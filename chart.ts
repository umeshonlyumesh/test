package com.truist.core.titan.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.truist.core.exception.SdkException;
import com.truist.core.titan.client.TitanClient;
import com.truist.core.titan.enums.OperationType;
import com.truist.core.titan.error.TitanError;
import com.truist.core.titan.helper.TokenizationHelper;
import com.truist.core.titan.model.ApiResponse;
import com.truist.core.titan.model.CustomerAlert;
import com.truist.core.titan.model.Parameter;
import com.truist.core.titan.model.Status;
import com.truist.core.titan.model.TitanResponse;
import com.truist.core.util.JsonCleaner;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.annotation.Qualifier;

import java.io.IOException;
import java.util.List;
import java.util.function.Function;

@ExtendWith(MockitoExtension.class)
class TitanServiceImplTest {

    @Mock
    private TitanClient titanClient;

    @Mock
    @Qualifier("customerAlertTemplate")
    private Function<java.util.Map<String, String>, String> template;

    @Mock
    private TokenizationHelper tokenizationHelper;

    @Mock
    private JsonCleaner jsonCleaner;

    @InjectMocks
    private TitanServiceImpl titanService;

    private CustomerAlert customerAlert;
    private ApiResponse apiResponse;
    private Status status;

    @BeforeEach
    void setUp() {
        customerAlert = mock(CustomerAlert.class);
        apiResponse = mock(ApiResponse.class);
        status = mock(Status.class);
    }

    @Test
    void getOperationName_shouldReturnCustomerAlert() {
        String operationName = titanService.getOperationName();

        assertEquals(OperationType.CustomerAlert.name(), operationName);
    }

    @Test
    void execute_shouldReturnTitanResponse_whenRequestIsSuccessful() throws IOException {
        Parameter parameter1 = mock(Parameter.class);
        Parameter parameter2 = mock(Parameter.class);

        when(customerAlert.getParameters()).thenReturn(List.of(parameter1, parameter2));
        when(customerAlert.getType()).thenReturn("EMAIL");

        when(parameter1.getFieldId()).thenReturn("customerId");
        when(parameter1.getFieldValue()).thenReturn("12345");

        when(parameter2.getFieldId()).thenReturn("alertId");
        when(parameter2.getFieldValue()).thenReturn("A100");

        doNothing().when(tokenizationHelper).detokenizeFields(customerAlert);

        when(template.apply(anyMap())).thenReturn("{\"type\":\"EMAIL\",\"value\":\"abc\"}");
        when(jsonCleaner.cleanRenderedJson("{\"type\":\"EMAIL\",\"value\":\"abc\"}"))
                .thenReturn("{\"type\":\"EMAIL\",\"value\":\"abc\"}");

        when(titanClient.invokeApi("{\"type\":\"EMAIL\",\"value\":\"abc\"}")).thenReturn(apiResponse);
        when(apiResponse.getStatus()).thenReturn(status);
        when(status.getCode()).thenReturn("200");
        when(status.getDesc()).thenReturn("SUCCESS");

        TitanResponse response = titanService.execute(customerAlert);

        assertNotNull(response);
        assertEquals("200", response.getReturnCode());
        assertEquals("SUCCESS", response.getMessage());

        verify(tokenizationHelper).detokenizeFields(customerAlert);
        verify(template).apply(anyMap());
        verify(jsonCleaner).cleanRenderedJson("{\"type\":\"EMAIL\",\"value\":\"abc\"}");
        verify(titanClient).invokeApi("{\"type\":\"EMAIL\",\"value\":\"abc\"}");
        verify(apiResponse).getStatus();
        verify(status).getCode();
        verify(status).getDesc();
    }

    @Test
    void execute_shouldThrowSdkException_whenTemplateApplyThrowsIOException() throws IOException {
        Parameter parameter = mock(Parameter.class);

        when(customerAlert.getParameters()).thenReturn(List.of(parameter));
        when(customerAlert.getType()).thenReturn("SMS");

        when(parameter.getFieldId()).thenReturn("customerId");
        when(parameter.getFieldValue()).thenReturn("999");

        doNothing().when(tokenizationHelper).detokenizeFields(customerAlert);

        when(template.apply(anyMap())).thenThrow(new IOException("Template processing failed"));

        SdkException exception = assertThrows(SdkException.class, () -> titanService.execute(customerAlert));

        assertEquals(TitanError.TITAN_SDK_ERROR.getCode(), exception.getCode());
        assertEquals(TitanError.TITAN_SDK_ERROR.getMessage(), exception.getMessage());

        verify(tokenizationHelper).detokenizeFields(customerAlert);
        verify(template).apply(anyMap());
    }
}