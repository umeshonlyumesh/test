@Bean
@ConditionalOnMissingBean(name = "kafkaSdkDefaultErrorHandler")
public DefaultErrorHandler kafkaSdkDefaultErrorHandler(
        KafkaTemplate<String, Object> sdkKafkaTemplate,
        KafkaSdkProperties props,
        SdkNotifier sdkNotifier
) {

    DeadLetterPublishingRecoverer dltRecoverer =
            new DeadLetterPublishingRecoverer(sdkKafkaTemplate,
                    (rec, ex) -> new TopicPartition(
                            DltTopicResolver.resolve(props, rec.topic()),
                            rec.partition()
                    )
            );

    FixedBackOff backOff = SdkBackoffFactory.buildBackoff(props);

    ConsumerRecordRecoverer recoverer = props.getNotifications().isEnabled()
            ? new NotifyingRecoverer(dltRecoverer, props, sdkNotifier)
            : dltRecoverer;

    DefaultErrorHandler errorHandler = new DefaultErrorHandler(recoverer, backOff);

    errorHandler.setCommitRecovered(true);
    errorHandler.setAckAfterHandle(false);
    errorHandler.setSeekAfterError(true);

    // ✅ retryable processing exceptions
    errorHandler.addRetryableExceptions(RetryableProcessingException.class);

    // ✅ treat deserialize + unknown magic byte + serialization as BAD payload (no retry)
    errorHandler.addNotRetryableExceptions(
            org.springframework.kafka.support.serializer.DeserializationException.class,
            org.apache.kafka.common.errors.SerializationException.class,
            org.apache.kafka.common.errors.InvalidConfigurationException.class,
            NonRetryableProcessingException.class
    );

    return errorHandler;
}