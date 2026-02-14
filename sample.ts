import org.apache.kafka.clients.producer.RecordMetadata;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.errors.TimeoutException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.retry.annotation.EnableRetry;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

import java.time.Instant;
import java.util.concurrent.CompletableFuture;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@SpringJUnitConfig(classes = RetryableKafkaClientTest.Config.class)
class RetryableKafkaClientTest {

    @TestConfiguration
    @EnableRetry
    static class Config {

        @Bean
        KafkaTemplate<String, Object> kafkaTemplate() {
            return mock(KafkaTemplate.class);
        }

        @Bean
        RetryableKafkaClient retryableKafkaClient(KafkaTemplate<String, Object> kafkaTemplate) {
            return new RetryableKafkaClient(kafkaTemplate);
        }
    }

    @Autowired
    KafkaTemplate<String, Object> kafkaTemplate;

    @Autowired
    RetryableKafkaClient client;

    @Test
    void successFirstAttempt() throws Exception {

        SendResult<String, Object> success = successSendResult("topicA", 0, 10L);

        when(kafkaTemplate.send(eq("topicA"), eq("k1"), any()))
                .thenReturn(CompletableFuture.completedFuture(success));

        SendResult<String, Object> result =
                client.sendWithRetry("topicA", "k1", "payload");

        assertEquals("topicA", result.getRecordMetadata().topic());
        verify(kafkaTemplate, times(1)).send(eq("topicA"), eq("k1"), any());
    }

    @Test
    void retriableTimeoutThenSuccess() throws Exception {

        CompletableFuture<SendResult<String, Object>> failFuture =
                CompletableFuture.failedFuture(new TimeoutException("temporary"));

        SendResult<String, Object> success = successSendResult("topicB", 1, 20L);

        when(kafkaTemplate.send(eq("topicB"), eq("k2"), any()))
                .thenReturn(failFuture) // first attempt
                .thenReturn(CompletableFuture.completedFuture(success)); // retry

        SendResult<String, Object> result =
                client.sendWithRetry("topicB", "k2", "payload");

        assertEquals(20L, result.getRecordMetadata().offset());
        verify(kafkaTemplate, times(2)).send(eq("topicB"), eq("k2"), any());
    }

    @Test
    void maxAttemptsReached_shouldThrow() {

        CompletableFuture<SendResult<String, Object>> fail =
                CompletableFuture.failedFuture(new TimeoutException("still down"));

        when(kafkaTemplate.send(eq("topicC"), eq("k3"), any()))
                .thenReturn(fail)
                .thenReturn(fail)
                .thenReturn(fail);

        RuntimeException ex = assertThrows(RuntimeException.class,
                () -> client.sendWithRetry("topicC", "k3", "payload"));

        assertTrue(ex.getMessage().contains("permanently failed"));
        verify(kafkaTemplate, times(3)).send(eq("topicC"), eq("k3"), any());
    }

    // helper
    private static SendResult<String, Object> successSendResult(String topic, int partition, long offset) {
        RecordMetadata rm = new RecordMetadata(
                new TopicPartition(topic, partition),
                0L,
                offset,
                Instant.now().toEpochMilli(),
                0,
                0
        );
        return new SendResult<>(null, rm);
    }
}