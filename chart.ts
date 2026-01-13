import org.apache.kafka.clients.consumer.*;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.errors.RetriableException;
import org.apache.kafka.common.errors.WakeupException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;

import java.lang.reflect.Method;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

public class KafkaConsumerRunner {

    private static final Logger log = LoggerFactory.getLogger(KafkaConsumerRunner.class);

    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();
    private final KafkaSdkProperties props;
    private final KafkaProducerClient producerClient;
    private final Environment environment;

    // One consumer per listener thread; keep a set so stop() can wake all
    private final Set<KafkaConsumer<String, Object>> activeConsumers = ConcurrentHashMap.newKeySet();
    private final AtomicBoolean running = new AtomicBoolean(false);

    public KafkaConsumerRunner(KafkaSdkProperties props,
                               KafkaProducerClient producerClient,
                               Environment environment) {
        this.props = props;
        this.producerClient = producerClient;
        this.environment = environment;

        Runtime.getRuntime().addShutdownHook(new Thread(this::stop));
    }

    public void registerListener(Object bean) {
        for (Method method : bean.getClass().getDeclaredMethods()) {
            KafkaConsumerListener ann = method.getAnnotation(KafkaConsumerListener.class);
            if (ann != null) {
                startConsumer(bean, method, ann);
            }
        }
    }

    private void startConsumer(Object bean, Method method, KafkaConsumerListener ann) {
        running.set(true);

        final String topic = environment.resolvePlaceholders(ann.topic());
        final int chunkSize = Integer.parseInt(environment.resolvePlaceholders(ann.chunkSize()));
        final Duration flushTimeout = Duration.ofMillis(Long.parseLong(environment.resolvePlaceholders(ann.flushTimeoutMs())));
        final Duration pollTimeout = Duration.ofMillis(Integer.parseInt(environment.resolvePlaceholders(ann.pollIntervalMs())));

        executor.submit(() -> runConsumerLoop(bean, method, ann, topic, chunkSize, flushTimeout, pollTimeout));
    }

    private void runConsumerLoop(Object bean,
                                 Method method,
                                 KafkaConsumerListener ann,
                                 String topic,
                                 int chunkSize,
                                 Duration flushTimeout,
                                 Duration pollTimeout) {

        Properties cfg = getProperties(ann);

        // offsets we are safe to commit (ONLY after successful processing or DLQ success)
        final Map<TopicPartition, OffsetAndMetadata> processedOffsets = new ConcurrentHashMap<>();

        // We keep a single “in-flight” chunk list (same as your current logic)
        List<ConsumerRecord<String, Object>> chunk = new ArrayList<>(chunkSize);
        Instant lastMessageTime = Instant.now();

        // Backoff for transient broker/network errors
        long backoffMs = 250;
        final long maxBackoffMs = 10_000;

        try (KafkaConsumer<String, Object> consumer = new KafkaConsumer<>(cfg)) {
            activeConsumers.add(consumer);

            consumer.subscribe(Collections.singletonList(topic), new ConsumerRebalanceListener() {
                @Override
                public void onPartitionsRevoked(Collection<TopicPartition> partitions) {
                    // We are losing partitions: flush & commit what we safely processed for those partitions
                    try {
                        commitSyncForPartitions(consumer, processedOffsets, partitions);
                    } finally {
                        // remove revoked partitions from map to avoid committing stale offsets later
                        partitions.forEach(processedOffsets::remove);
                    }
                }

                @Override
                public void onPartitionsAssigned(Collection<TopicPartition> partitions) {
                    // no-op (could reset per-partition buffers if you switch to per-partition batching)
                }
            });

            log.info("Kafka consumer started. topic={}, groupId={}", topic, cfg.getProperty(ConsumerConfig.GROUP_ID_CONFIG));

            while (running.get()) {
                try {
                    ConsumerRecords<String, Object> records = consumer.poll(pollTimeout);

                    if (!records.isEmpty()) {
                        backoffMs = 250; // reset backoff on successful poll activity
                    }

                    for (ConsumerRecord<String, Object> rec : records) {
                        chunk.add(rec);
                        lastMessageTime = Instant.now();

                        if (chunk.size() >= chunkSize) {
                            processChunkAndMarkOffsets(bean, method, topic, chunk, processedOffsets);
                            chunk = new ArrayList<>(chunkSize);
                            commitAsyncSafe(consumer, processedOffsets);
                        }
                    }

                    // flush partial chunk after timeout
                    if (!chunk.isEmpty() &&
                        Duration.between(lastMessageTime, Instant.now()).compareTo(flushTimeout) >= 0) {
                        processChunkAndMarkOffsets(bean, method, topic, chunk, processedOffsets);
                        chunk = new ArrayList<>(chunkSize);
                        commitAsyncSafe(consumer, processedOffsets);
                    }

                } catch (WakeupException we) {
                    // Normal during stop()
                    if (!running.get()) {
                        break;
                    }
                    throw we;

                } catch (RetriableException re) {
                    // broker down / transient network issue → backoff and continue
                    log.warn("Retriable Kafka error (will backoff and continue). topic={}, err={}", topic, re.toString());
                    sleepQuietly(backoffMs);
                    backoffMs = Math.min(maxBackoffMs, backoffMs * 2);

                } catch (CommitFailedException cfe) {
                    // Often occurs during rebalance if you commit late; we handle via rebalance listener + next commits
                    log.warn("CommitFailedException (likely rebalance). topic={}, err={}", topic, cfe.toString());

                } catch (Exception e) {
                    // Unknown failure: log and backoff a bit to avoid hot spin
                    log.error("Unexpected error in consumer loop. topic={}", topic, e);
                    sleepQuietly(backoffMs);
                    backoffMs = Math.min(maxBackoffMs, backoffMs * 2);
                }
            }

            // graceful shutdown: flush and commit what’s processed
            if (!chunk.isEmpty()) {
                try {
                    processChunkAndMarkOffsets(bean, method, topic, chunk, processedOffsets);
                } catch (Exception ex) {
                    log.error("Error flushing final chunk during shutdown. topic={}", topic, ex);
                }
            }

            commitSyncSafe(consumer, processedOffsets);
            log.info("Kafka consumer stopped. topic={}", topic);

        } catch (Exception fatal) {
            log.error("Kafka consumer died. topic={}", topic, fatal);
            throw new RuntimeException("Kafka consumer failed for topic=" + topic, fatal);
        } finally {
            activeConsumers.removeIf(Objects::isNull);
        }
    }

    /**
     * Process chunk. If handler succeeds => mark offsets for commit.
     * If handler fails => attempt DLQ.
     *   - If DLQ succeeds => mark offsets for commit (skip poison pills)
     *   - If DLQ fails => do NOT mark offsets; throw to allow retry/backoff (no message loss)
     */
    private void processChunkAndMarkOffsets(Object bean,
                                           Method method,
                                           String topic,
                                           List<ConsumerRecord<String, Object>> chunk,
                                           Map<TopicPartition, OffsetAndMetadata> processedOffsets) throws Exception {

        try {
            method.setAccessible(true);
            method.invoke(bean, chunk);

            markOffsets(chunk, processedOffsets);

        } catch (Exception handlerEx) {
            log.error("Error processing records. topic={}, chunkSize={}", topic, chunk.size(), handlerEx);

            if (!isDlqEnabled()) {
                // no DLQ: do not commit; allow retry (at-least-once)
                throw handlerEx;
            }

            boolean dlqOk = sendChunkToDlq(topic, chunk);
            if (dlqOk) {
                // DLQ succeeded -> commit offsets so we don't get stuck
                markOffsets(chunk, processedOffsets);
            } else {
                // DLQ failed -> do NOT commit; retry later
                throw handlerEx;
            }
        }
    }

    private void markOffsets(List<ConsumerRecord<String, Object>> chunk,
                             Map<TopicPartition, OffsetAndMetadata> processedOffsets) {
        for (ConsumerRecord<String, Object> rec : chunk) {
            TopicPartition tp = new TopicPartition(rec.topic(), rec.partition());
            // commit NEXT offset (offset+1)
            processedOffsets.put(tp, new OffsetAndMetadata(rec.offset() + 1));
        }
    }

    private void commitAsyncSafe(KafkaConsumer<String, Object> consumer,
                                 Map<TopicPartition, OffsetAndMetadata> processedOffsets) {
        if (processedOffsets.isEmpty()) return;

        Map<TopicPartition, OffsetAndMetadata> snapshot = new HashMap<>(processedOffsets);
        consumer.commitAsync(snapshot, (offsets, exception) -> {
            if (exception != null) {
                log.warn("commitAsync failed: {}", exception.toString(), exception);
            }
        });
    }

    private void commitSyncSafe(KafkaConsumer<String, Object> consumer,
                                Map<TopicPartition, OffsetAndMetadata> processedOffsets) {
        if (processedOffsets.isEmpty()) return;

        try {
            consumer.commitSync(new HashMap<>(processedOffsets));
        } catch (Exception e) {
            log.warn("commitSync failed during shutdown: {}", e.toString(), e);
        }
    }

    private void commitSyncForPartitions(KafkaConsumer<String, Object> consumer,
                                         Map<TopicPartition, OffsetAndMetadata> processedOffsets,
                                         Collection<TopicPartition> partitions) {
        if (partitions == null || partitions.isEmpty()) return;

        Map<TopicPartition, OffsetAndMetadata> toCommit = new HashMap<>();
        for (TopicPartition tp : partitions) {
            OffsetAndMetadata om = processedOffsets.get(tp);
            if (om != null) toCommit.put(tp, om);
        }
        if (toCommit.isEmpty()) return;

        try {
            consumer.commitSync(toCommit);
        } catch (Exception e) {
            log.warn("commitSync failed onPartitionsRevoked: {}", e.toString(), e);
        }
    }

    private boolean sendChunkToDlq(String sourceTopic, List<ConsumerRecord<String, Object>> chunk) {
        String dlqTopic = resolveDlqTopic(sourceTopic);

        try {
            for (ConsumerRecord<String, Object> rec : chunk) {
                String key = rec.key();

                // Your current code only DLQs SpecificRecord; keep that behavior
                Object value = rec.value();
                if (value instanceof org.apache.avro.specific.SpecificRecord sr) {
                    String json = toJson(sr);
                    producerClient.sendString(dlqTopic, key, json);
                } else {
                    log.error("DLQ skipped (non-SpecificRecord). topic={}, valueType={}",
                            dlqTopic, value == null ? "null" : value.getClass().getName());
                    // You can decide: either treat as DLQ success (commit) or DLQ failure (retry).
                    // Safer: treat as failure so message is not lost.
                    return false;
                }
            }
            log.info("DLQ publish success. dlqTopic={}, count={}", dlqTopic, chunk.size());
            return true;

        } catch (Exception ex) {
            log.error("DLQ publish failed. dlqTopic={}, count={}", dlqTopic, chunk.size(), ex);
            return false;
        }
    }

    private boolean isDlqEnabled() {
        return props.getDlq() != null && Boolean.TRUE.equals(props.getDlq().isEnabled());
    }

    private String resolveDlqTopic(String sourceTopic) {
        String override = props.getDlq() == null ? null : props.getDlq().getTopicOverride();
        if (override != null && !override.isBlank()) {
            return override;
        }
        return sourceTopic + "-dlq";
    }

    private boolean isAvro() {
        return "avro".equalsIgnoreCase(props.getMessageFormat());
    }

    private Properties getProperties(KafkaConsumerListener ann) {
        Properties cfg = new Properties();

        cfg.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, props.getBootstrapServers());
        cfg.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, org.apache.kafka.common.serialization.StringDeserializer.class.getName());

        // IMPORTANT: manual commit
        cfg.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, "false");

        // Use your provided groupId or default
        String groupId = environment.resolvePlaceholders(ann.groupId());
        cfg.put(ConsumerConfig.GROUP_ID_CONFIG, (groupId == null || groupId.isBlank()) ? props.getDefaultGroupId() : groupId);

        // Align poll size with your chunking approach
        cfg.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, environment.resolvePlaceholders(ann.chunkSize()));

        // Resiliency + rebalances:
        // Ensure this is > worst-case processing time for a batch
        cfg.putIfAbsent(ConsumerConfig.MAX_POLL_INTERVAL_MS_CONFIG, String.valueOf(props.getMaxPollIntervalMs())); // e.g. 300000+

        // Broker/network backoff tuning (client reconnect behavior)
        cfg.putIfAbsent(ConsumerConfig.RECONNECT_BACKOFF_MS_CONFIG, "250");
        cfg.putIfAbsent(ConsumerConfig.RECONNECT_BACKOFF_MAX_MS_CONFIG, "10000");
        cfg.putIfAbsent(ConsumerConfig.RETRY_BACKOFF_MS_CONFIG, "250");

        // Optional but recommended:
        // cfg.putIfAbsent(ConsumerConfig.SESSION_TIMEOUT_MS_CONFIG, "45000");
        // cfg.putIfAbsent(ConsumerConfig.HEARTBEAT_INTERVAL_MS_CONFIG, "15000");

        if (isAvro()) {
            cfg.put("schema.registry.url", props.getSchemaRegistryUrl());
            cfg.put("specific.avro.reader", "true");
            cfg.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, io.confluent.kafka.serializers.KafkaAvroDeserializer.class.getName());
            KafkaUtil.setSchemaRegistrySsl(cfg, props); // keep your existing helper
        } else {
            cfg.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, org.apache.kafka.common.serialization.StringDeserializer.class.getName());
        }

        // Your existing: auto.offset.reset=earliest
        cfg.putIfAbsent(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");

        // SSL
        KafkaUtil.setBrokerSsl(cfg, props); // keep your existing helper

        // metrics push flag if you had it
        cfg.put("enable.metrics.push", String.valueOf(ann.enableMetricPush()));

        return cfg;
    }

    private String toJson(org.apache.avro.specific.SpecificRecord record) throws java.io.IOException {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        org.apache.avro.io.DatumWriter<org.apache.avro.specific.SpecificRecord> writer =
                new org.apache.avro.specific.SpecificDatumWriter<>(record.getSchema());
        org.apache.avro.io.Encoder encoder =
                org.apache.avro.io.EncoderFactory.get().jsonEncoder(record.getSchema(), out);
        writer.write(record, encoder);
        encoder.flush();
        return out.toString(java.nio.charset.StandardCharsets.UTF_8);
    }

    private void sleepQuietly(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
        }
    }

    public void stop() {
        log.info("Stopping KafkaConsumerRunner");
        running.set(false);

        // Wake up all active consumers so poll() exits quickly
        for (KafkaConsumer<String, Object> c : activeConsumers) {
            try {
                c.wakeup();
            } catch (Exception ignore) {
            }
        }

        executor.shutdown();
        try {
            // IMPORTANT: seconds, not microseconds
            if (!executor.awaitTermination(30, TimeUnit.SECONDS)) {
                executor.shutdownNow();
            }
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            executor.shutdownNow();
        }

        log.info("KafkaConsumerRunner stopped");
    }
}