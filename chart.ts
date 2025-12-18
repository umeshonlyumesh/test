import javax.net.ssl.*;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.security.KeyStore;
import java.security.SecureRandom;

import org.springframework.stereotype.Component;

@Component
public class MQSSLContextConfig {

    public SSLContext getSslContext(SSLProperties sslProps) throws Exception {

        validate(sslProps);

        // Required for IBM MQ when using non-IBM JVM
        System.setProperty(
                "com.ibm.mq.cfg.useIBMCipherMappings",
                "false"
        );

        // ---------- LOAD KEYSTORE ----------
        KeyStore keyStore = KeyStore.getInstance(sslProps.getType());
        try (InputStream ksStream = openStream(sslProps.getKeystore())) {
            keyStore.load(
                    ksStream,
                    sslProps.getPassword().toCharArray()
            );
        }

        KeyManagerFactory kmf =
                KeyManagerFactory.getInstance(
                        KeyManagerFactory.getDefaultAlgorithm()
                );
        kmf.init(
                keyStore,
                sslProps.getPassword().toCharArray()
        );

        // ---------- LOAD TRUSTSTORE ----------
        KeyStore trustStore = KeyStore.getInstance(sslProps.getType());
        try (InputStream tsStream = openStream(sslProps.getTruststore())) {
            trustStore.load(
                    tsStream,
                    sslProps.getPassword().toCharArray()
            );
        }

        TrustManagerFactory tmf =
                TrustManagerFactory.getInstance(
                        TrustManagerFactory.getDefaultAlgorithm()
                );
        tmf.init(trustStore);

        // ---------- BUILD SSL CONTEXT ----------
        SSLContext sslContext =
                SSLContext.getInstance(sslProps.getVersion());

        sslContext.init(
                kmf.getKeyManagers(),
                tmf.getTrustManagers(),
                new SecureRandom()
        );

        return sslContext;
    }

    /**
     * Supports:
     *  - classpath:cert/file.p12
     *  - /opt/mulecert/file.p12
     *  - C:/cert/file.p12
     */
    private InputStream openStream(String location) throws IOException {

        if (location == null || location.isBlank()) {
            throw new IllegalArgumentException(
                    "Keystore / Truststore path must not be empty"
            );
        }

        // ----- CLASSPATH -----
        if (location.startsWith("classpath:")) {

            String path = location.substring("classpath:".length());
            if (path.startsWith("/")) {
                path = path.substring(1);
            }

            ClassLoader classLoader =
                    Thread.currentThread().getContextClassLoader();

            InputStream is = classLoader.getResourceAsStream(path);

            if (is == null) {
                throw new FileNotFoundException(
                        "Classpath resource not found: " + location
                );
            }
            return is;
        }

        // ----- FILESYSTEM -----
        return new FileInputStream(location);
    }

    private void validate(SSLProperties props) {

        if (props.getKeystore() == null || props.getKeystore().isBlank()) {
            throw new IllegalArgumentException("ssl.keystore is required");
        }
        if (props.getTruststore() == null || props.getTruststore().isBlank()) {
            throw new IllegalArgumentException("ssl.truststore is required");
        }
        if (props.getPassword() == null || props.getPassword().isBlank()) {
            throw new IllegalArgumentException("ssl.password is required");
        }
        if (props.getType() == null || props.getType().isBlank()) {
            throw new IllegalArgumentException("ssl.type is required");
        }
        if (props.getVersion() == null || props.getVersion().isBlank()) {
            throw new IllegalArgumentException("ssl.version is required");
        }
    }
}