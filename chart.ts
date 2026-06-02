cat > TestCall.java <<'EOF'
import java.io.FileInputStream;
import java.net.URI;
import java.net.http.*;
import java.security.KeyStore;
import javax.net.ssl.*;

public class TestCall {
  public static void main(String[] args) throws Exception {

    if (args.length == 0) {
      System.err.println("Usage:");
      System.err.println("java TestCall.java '<json-payload>'");
      System.exit(1);
    }

    String json = args[0];

    String url = "https://pez-core-api.pez-truist-pite:8080/integration/v1.0";
    String p12File = "/opt/podkeystore/ptpkeystore.p12";
    String password = "PaymentEngine123$";

    KeyStore ks = KeyStore.getInstance("PKCS12");
    try (FileInputStream fis = new FileInputStream(p12File)) {
      ks.load(fis, password.toCharArray());
    }

    KeyManagerFactory kmf =
        KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
    kmf.init(ks, password.toCharArray());

    SSLContext sslContext = SSLContext.getInstance("TLS");
    sslContext.init(kmf.getKeyManagers(), null, null);

    HttpClient client = HttpClient.newBuilder()
        .sslContext(sslContext)
        .build();

    HttpRequest request = HttpRequest.newBuilder()
        .uri(URI.create(url))
        .header("Content-Type", "application/json")
        .POST(HttpRequest.BodyPublishers.ofString(json))
        .build();

    HttpResponse<String> response =
        client.send(request, HttpResponse.BodyHandlers.ofString());

    System.out.println("HTTP Status: " + response.statusCode());
    System.out.println("Response Body:");
    System.out.println(response.body());
  }
}
EOF
