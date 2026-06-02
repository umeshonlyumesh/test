cat > TestCall.java <<'EOF'
import java.io.FileInputStream;
import java.net.URI;
import java.net.http.*;
import java.security.KeyStore;
import javax.net.ssl.*;

public class TestCall {
  public static void main(String[] args) throws Exception {
    String p12File = "/opt/podkeystore/ptpkeystore.p12";
    String password = "PaymentEngine123$";

    KeyStore ks = KeyStore.getInstance("PKCS12");
    try (FileInputStream fis = new FileInputStream(p12File)) {
      ks.load(fis, password.toCharArray());
    }

    KeyManagerFactory kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
    kmf.init(ks, password.toCharArray());

    SSLContext ssl = SSLContext.getInstance("TLS");
    ssl.init(kmf.getKeyManagers(), null, null);

    String json = """
    {
      "header": {
        "sourceId": "PE-Zelle",
        "operation": "Posting",
        "requestId": "1234567890",
        "timestamp": "2025-09-08T15:30:05Z"
      },
      "paymentInfo": {
        "amount": "2.0",
        "debitAccountNumber": "059094797533527808",
        "debitAccountNumberType": "SAV",
        "debtorFirstName": "Sender First name",
        "creditAccountNumber": "232613617390591836",
        "creditAccountNumberType": "CHK",
        "creditorFirstName": "JOHN SIMPSON",
        "source": "PE"
      },
      "memoPost": {
        "side": "B",
        "tranReference": "040247903580599850",
        "description1": "TEST Transaction",
        "description2": "P2P Zelle Transaction",
        "debitTranCode": "8280",
        "creditTranCode": "3377"
      }
    }
    """;

    HttpClient client = HttpClient.newBuilder()
        .sslContext(ssl)
        .build();

    HttpRequest request = HttpRequest.newBuilder()
        .uri(URI.create("https://pez-core-api.pez-truist-pite:8080/integration/v1.0"))
        .header("Content-Type", "application/json")
        .POST(HttpRequest.BodyPublishers.ofString(json))
        .build();

    HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

    System.out.println("Status = " + response.statusCode());
    System.out.println(response.body());
  }
}
EOF

java TestCall.java
