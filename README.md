import org.apache.kafka.common.errors.TimeoutException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

class AsyncRetryTest {

  private ScheduledExecutorService scheduler;
  private AsyncRetry asyncRetry;

  @BeforeEach
  void setUp() {
    scheduler = Executors.newSingleThreadScheduledExecutor();
    asyncRetry = new AsyncRetry(scheduler);
  }

  @AfterEach
  void tearDown() {
    scheduler.shutdownNow();
  }

  @Test
  void retryAsync_successOnFirstAttempt_completesNormally() throws Exception {
    CompletableFuture<String> cf = asyncRetry.retryAsync(
        () -> CompletableFuture.completedFuture("OK"),
        3,
        10
    );

    assertEquals("OK", cf.get(1, TimeUnit.SECONDS));
  }

  @Test
  void retryAsync_retriableFailureThenSuccess_retriesAndCompletes() throws Exception {
    AtomicInteger attempts = new AtomicInteger(0);

    CompletableFuture<String> cf = asyncRetry.retryAsync(
        () -> {
          int n = attempts.incrementAndGet();
          if (n < 3) {
            CompletableFuture<String> fail = new CompletableFuture<>();
            fail.completeExceptionally(new TimeoutException("temporary"));
            return fail;
          }
          return CompletableFuture.completedFuture("OK_AFTER_RETRY");
        },
        5,
        10
    );

    assertEquals("OK_AFTER_RETRY", cf.get(2, TimeUnit.SECONDS));
    assertEquals(3, attempts.get(), "Should attempt exactly 3 times");
  }

  @Test
  void retryAsync_nonRetriableFailure_doesNotRetry_completesExceptionally() {
    AtomicInteger attempts = new AtomicInteger(0);

    CompletableFuture<String> cf = asyncRetry.retryAsync(
        () -> {
          attempts.incrementAndGet();
          CompletableFuture<String> fail = new CompletableFuture<>();
          fail.completeExceptionally(new IllegalArgumentException("bad payload"));
          return fail;
        },
        5,
        10
    );

    ExecutionException ee = assertThrows(ExecutionException.class, () -> cf.get(1, TimeUnit.SECONDS));
    assertTrue(ee.getCause() instanceof IllegalArgumentException);
    assertEquals(1, attempts.get(), "Should not retry non-retriable exception");
  }

  @Test
  void retryAsync_maxAttemptsReached_completesExceptionally() {
    AtomicInteger attempts = new AtomicInteger(0);

    CompletableFuture<String> cf = asyncRetry.retryAsync(
        () -> {
          attempts.incrementAndGet();
          CompletableFuture<String> fail = new CompletableFuture<>();
          fail.completeExceptionally(new TimeoutException("still down"));
          return fail;
        },
        3,
        10
    );

    ExecutionException ee = assertThrows(ExecutionException.class, () -> cf.get(2, TimeUnit.SECONDS));
    // Depending on how CompletionException is wrapped, cause may be TimeoutException or CompletionException
    Throwable cause = ee.getCause() instanceof CompletionException ? ee.getCause().getCause() : ee.getCause();
    assertTrue(cause instanceof TimeoutException);
    assertEquals(3, attempts.get(), "Should retry exactly maxAttempts times");
  }

  @Test
  void retryAsync_actionCallableThrows_completesExceptionallyImmediately() {
    AtomicInteger attempts = new AtomicInteger(0);

    CompletableFuture<String> cf = asyncRetry.retryAsync(
        () -> {
          attempts.incrementAndGet();
          throw new RuntimeException("boom");
        },
        5,
        10
    );

    ExecutionException ee = assertThrows(ExecutionException.class, () -> cf.get(1, TimeUnit.SECONDS));
    assertTrue(ee.getCause() instanceof RuntimeException);
    assertEquals("boom", ee.getCause().getMessage());
    assertEquals(1, attempts.get(), "Callable throws before returning future -> no retries");
  }

  @Test
  void retryAsync_retriableWrappedInCompletionException_shouldRetry() throws Exception {
    AtomicInteger attempts = new AtomicInteger(0);

    CompletableFuture<String> cf = asyncRetry.retryAsync(
        () -> {
          int n = attempts.incrementAndGet();
          if (n == 1) {
            CompletableFuture<String> fail = new CompletableFuture<>();
            fail.completeExceptionally(new CompletionException(new TimeoutException("wrapped")));
            return fail;
          }
          return CompletableFuture.completedFuture("OK");
        },
        3,
        10
    );

    assertEquals("OK", cf.get(2, TimeUnit.SECONDS));
    assertEquals(2, attempts.get());
  }
}