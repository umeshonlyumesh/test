package com.example.coreapi.fraud.client;

import com.example.coreapi.common.http.SdkErrorHandler;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

@Component
@RequiredArgsConstructor
public class FraudApiClient {

    private final RestClient fraudRestClient;
    private final SdkErrorHandler sdkErrorHandler;

    public String invokeApi(Object request) {
        try {
            return fraudRestClient.post()
                    .uri("/fraud/check")
                    .body(request)
                    .retrieve()
                    .body(String.class);

        } catch (RestClientResponseException ex) {
            sdkErrorHandler.handleError(
                    "fraud",
                    ex.getStatusCode(),
                    ex.getResponseBodyAsString()
            );
            throw ex;
        } catch (ResourceAccessException ex) {
            sdkErrorHandler.handleError("fraud", ex);
            throw ex;
        } catch (RestClientException ex) {
            sdkErrorHandler.handleError("fraud", ex);
            throw ex;
        }
    }
}