import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;

import javax.net.ssl.*;
import java.io.InputStream;
import java.security.KeyStore;
import java.security.SecureRandom;

public class MQSSLContextConfig {

    public SSLContext getSslContext(SSLProperties sslProps) throws Exception {

        // 1) Load KeyStore (client cert)
        KeyStore keyStore = KeyStore.getInstance(sslProps.getType());
        Resource ksRes = resolveResource(sslProps.getKeystore());

        try (InputStream ksIn = ksRes.getInputStream()) {
            keyStore.load(ksIn, sslProps.getPassword().toCharArray());
        }

        KeyManagerFactory kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        kmf.init(keyStore, sslProps.getPassword().toCharArray());

        // 2) Load TrustStore (server cert chain)
        KeyStore trustStore = KeyStore.getInstance(sslProps.getType());
        Resource tsRes = resolveResource(sslProps.getTruststore());

        try (InputStream tsIn = tsRes.getInputStream()) {
            trustStore.load(tsIn, sslProps.getPassword().toCharArray());
        }

        TrustManagerFactory tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        tmf.init(trustStore);

        // 3) Build SSLContext
        SSLContext sslContext = SSLContext.getInstance(sslProps.getVersion()); // ex: TLSv1.2 or TLSv1.3
        sslContext.init(kmf.getKeyManagers(), tmf.getTrustManagers(), new SecureRandom());

        return sslContext;
    }

    private Resource resolveResource(String path) {
        if (path == null) throw new IllegalArgumentException("Keystore/Truststore path is null");

        // allow both: "classpath:cert/mqawskeystore.p12" and "cert/mqawskeystore.p12"
        if (path.startsWith("classpath:")) {
            String p = path.substring("classpath:".length());
            if (p.startsWith("/")) p = p.substring(1);
            return new ClassPathResource(p);
        }

        // treat as classpath by default (recommended)
        return new ClassPathResource(path.startsWith("/") ? path.substring(1) : path);
    }
}