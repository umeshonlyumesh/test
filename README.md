# 🧩 Kafka SDK for Spring Boot

**Kafka SDK** is a reusable, production-grade library designed to simplify Kafka integration across microservices.  
It provides **plug-and-play producer and consumer support**, **automatic topic creation**, **SSL configuration**, and **DLQ with retry** — all driven by Spring Boot `application.yml` configuration.

---

## 🚀 Features

✅ Simplified producer (sync / async send)  
✅ Custom `@KafkaConsumerListener` annotation with virtual thread consumers  
✅ Automatic topic creation if missing  
✅ Configurable SSL for producer and consumer  
✅ Built-in retry and DLQ handling  
✅ Micrometer metrics integration  
✅ Auto-configuration via Spring Boot starter mechanism  

---

## 🧱 Project Modules

```
kafka-sdk/
 ├── src/main/java/com/truist/kafka/
 │     ├── config/               → Auto-configuration & properties
 │     ├── producer/             → Producer client with retry/DLQ
 │     ├── consumer/             → Annotation-based listener support
 │     ├── admin/                → KafkaTopicManager (auto-create topics)
 │     └── metrics/              → Micrometer integration
 └── pom.xml
```

---

## ⚙️ Installation

### 1️⃣ Publish to Internal Maven Repository (e.g. Nexus)

Run:
```bash
mvn clean install
```

Then publish:
```bash
mvn deploy
```

Once deployed, any microservice can consume the SDK via Maven:

```xml
<dependency>
  <groupId>com.truist.kafka</groupId>
  <artifactId>kafka-sdk</artifactId>
  <version>1.0.0</version>
</dependency>
```

---

## 🧩 Configuration (application.yml)

```yaml
kafka:
  sdk:
    bootstrap-servers: kafka.dev.truist.com:443
    auto-create-topics: true

    producer:
      ssl:
        key-store-type: PKCS12
        key-store-location: classpath:cert/pezkafkakeystore.p12
        key-store-password: Zelledisbursment12$
        trust-store-type: PKCS12
        trust-store-location: classpath:cert/pezkafkatruststore.p12
        trust-store-password: Zelledisbursment12$

    consumer:
      default-group-id: default-group
      ssl:
        key-store-type: PKCS12
        key-store-location: classpath:cert/pezkafkakeystore.p12
        key-store-password: Zelledisbursment12$
        trust-store-type: PKCS12
        trust-store-location: classpath:cert/pezkafkatruststore.p12
        trust-store-password: Zelledisbursment12$

    dlq:
      enabled: true
      topic-override: my-dlq-topic

    retry:
      max-attempts: 5
      backoff-ms: 1500
```

---

## 🧩 Producer Usage

```java
@Service
@RequiredArgsConstructor
public class PaymentPublisher {
    private final KafkaProducerClient producer;

    public void publishPayment(String id, String payload) {
        producer.sendAsync("payments-topic", id, payload);
    }
}
```

```java
producer.sendSync("audit-topic", "txn123", "{\"status\":\"APPROVED\"}");
```

> Both methods internally handle retries, error counting, and DLQ fallback if configured.

---

## 🧩 Consumer Usage

```java
@Component
public class PaymentConsumer {

    @KafkaConsumerListener(topic = "payments-topic", groupId = "payments-group")
    public void onMessage(ConsumerRecord<String, String> record) {
        System.out.println("✅ Received payment event: " + record.value());
    }
}
```

---

## 🧩 Topic Management

```java
@Service
@RequiredArgsConstructor
public class TopicInitializer {
    private final KafkaTopicManager topicManager;

    @PostConstruct
    public void setupTopics() {
        topicManager.createTopicIfNotExists("payments-topic", 3, (short) 1);
        topicManager.createTopicIfNotExists("audit-topic", 2, (short) 1);
    }
}
```

---

## 🧩 Metrics Integration

Metrics are automatically registered in Micrometer under:
- `kafka.sdk.producer.send.count`
- `kafka.sdk.producer.error.count`
- `kafka.sdk.producer.send.timer`

They appear at:
```
/actuator/metrics
/actuator/prometheus
```

---

## 🧩 Error Handling and DLQ

If message send fails permanently after all retries,  
the SDK publishes the failed message to the configured **DLQ topic**.

```yaml
kafka:
  sdk:
    dlq:
      enabled: true
      topic-override: payment-failed-dlq
```

---

## 🧩 Retry Configuration

```yaml
kafka:
  sdk:
    retry:
      max-attempts: 5
      backoff-ms: 1000
```

---

## 🧩 SSL Configuration Example

```yaml
kafka:
  sdk:
    producer:
      ssl:
        key-store-type: PKCS12
        key-store-location: file:/opt/cert/kafka-producer-keystore.p12
        key-store-password: changeit
        trust-store-location: file:/opt/cert/kafka-producer-truststore.p12
        trust-store-password: changeit
```

---

## 🧩 End-to-End Setup

1️⃣ Add SDK dependency  
2️⃣ Add YAML configuration  
3️⃣ Create Producer + Consumer classes  
4️⃣ Run the application 🎉  

---

## 🧩 Logging

```yaml
logging:
  level:
    com.truist.kafka: DEBUG
```

---

## 🧩 Extensibility

| Feature | How to extend |
|----------|---------------|
| Topic creation policy | Extend `KafkaTopicManager` |
| Retry backoff | Override `props.getRetry()` |
| Metrics registry | Autowire `MeterRegistry` |
| Listener concurrency | Adjust virtual thread pool |

---

## 🧩 License
Internal use only © Truist Bank / IBM – Kafka SDK Starter  
Version 1.0.0
