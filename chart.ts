TopicPartition tp = new TopicPartition(topic, partition);
        try (KafkaConsumer<String, Object> consumer = new KafkaConsumer<>(cfg, keyDes, valueDes)) {
            consumer.assign(Collections.singletonList(tp));

            // Validate offset range
            Long beginning = consumer.beginningOffsets(Collections.singleton(tp)).get(tp);
            Long end = consumer.endOffsets(Collections.singleton(tp)).get(tp);
            if (beginning != null && end != null) {
                if (offset < beginning || offset >= end) {
                    log.warn("Requested offset {} out of range [{}, {}) for {}-{}", offset, beginning, end, topic, partition);
                    return null;
                }
            }

            consumer.seek(tp, offset);

            long deadline = System.currentTimeMillis() + Math.max(0, timeoutMs);
            while (System.currentTimeMillis() < deadline) {
                long remaining = Math.max(1, deadline - System.currentTimeMillis());
                ConsumerRecords<String, Object> records = consumer.poll(Duration.ofMillis(Math.min(500, remaining)));
                for (ConsumerRecord<String, Object> rec : records.records(tp)) {
                    if (rec.offset() == offset) {
                        return rec;
                    } else if (rec.offset() > offset) {
                        // We passed the desired offset without seeing it
                        return null;
                    }
                }
            }
            return null;
        } catch (Exception e) {
            log.error("Failed to read single message from {}-{}@{}", topic, partition, offset, e);
            return null;
        }
    }
