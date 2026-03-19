package com.truist.core.enrichment.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.truist.core.enums.OperationType;
import com.truist.core.exception.SdkException;
import com.truist.core.helper.TokenizationHelper;
import com.truist.core.enrichment.client.EnrichmentClient;
import com.truist.core.enrichment.error.CifError;
import com.truist.core.enrichment.model.CIFDataEnrichmentRequest;
import com.truist.core.enrichment.model.GetCIFEnrichmentDataResponse;
import com.truist.core.enrichment.util.XmlUtil;

import jakarta.xml.bind.JAXBException;
import javax.xml.stream.XMLStreamException;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class CifEnrichmentServiceImplTest {

    @Mock
    private EnrichmentClient enrichmentClient;

    @Mock
    private TokenizationHelper tokenizationHelper;

    private CifEnrichmentServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new CifEnrichmentServiceImpl(enrichmentClient, tokenizationHelper);
    }

    @Test
    void getOperationName_shouldReturnEnrichment() {
        String result = service.getOperationName();

        assertEquals(OperationType.Enrichment.name(), result);
    }

    @Test
    void execute_shouldReturnResponse_whenSuccessful() throws Exception {
        CIFDataEnrichmentRequest request = mock(CIFDataEnrichmentRequest.class);
        GetCIFEnrichmentDataResponse expectedResponse = mock(GetCIFEnrichmentDataResponse.class);

        String finalPayload = "<xml>request</xml>";
        String responseXml = "<xml>response</xml>";

        doNothing().when(tokenizationHelper).detokenizeRequest(request);
        doNothing().when(tokenizationHelper).tokenizeResponse(expectedResponse);
        when(enrichmentClient.invokeApi(finalPayload)).thenReturn(responseXml);

        try (MockedStatic<XmlUtil> xmlUtilMock = org.mockito.Mockito.mockStatic(XmlUtil.class)) {
            xmlUtilMock.when(() -> XmlUtil.prepareReq(request)).thenReturn(finalPayload);
            xmlUtilMock.when(() -> XmlUtil.convertToResponse(responseXml)).thenReturn(expectedResponse);

            GetCIFEnrichmentDataResponse actual = service.execute(request);

            assertSame(expectedResponse, actual);
            verify(tokenizationHelper).detokenizeRequest(request);
            verify(enrichmentClient).invokeApi(finalPayload);
            verify(tokenizationHelper).tokenizeResponse(expectedResponse);

            xmlUtilMock.verify(() -> XmlUtil.prepareReq(request));
            xmlUtilMock.verify(() -> XmlUtil.convertToResponse(responseXml));
        }
    }

    @Test
    void execute_shouldThrowSdkException_whenPrepareReqThrowsJaxbException() throws Exception {
        CIFDataEnrichmentRequest request = mock(CIFDataEnrichmentRequest.class);

        doNothing().when(tokenizationHelper).detokenizeRequest(request);

        try (MockedStatic<XmlUtil> xmlUtilMock = org.mockito.Mockito.mockStatic(XmlUtil.class)) {
            xmlUtilMock.when(() -> XmlUtil.prepareReq(request))
                    .thenThrow(new JAXBException("prepare failed"));

            SdkException ex = assertThrows(SdkException.class, () -> service.execute(request));

            assertEquals(CifError.CIF_SDK_ERROR.getCode(), ex.getCode());
            assertEquals(CifError.CIF_SDK_ERROR.getMessage(), ex.getMessage());

            verify(tokenizationHelper).detokenizeRequest(request);
            xmlUtilMock.verify(() -> XmlUtil.prepareReq(request));
        }
    }

    @Test
    void execute_shouldThrowSdkException_whenConvertToResponseThrowsXmlStreamException() throws Exception {
        CIFDataEnrichmentRequest request = mock(CIFDataEnrichmentRequest.class);

        String finalPayload = "<xml>request</xml>";
        String responseXml = "<xml>response</xml>";

        doNothing().when(tokenizationHelper).detokenizeRequest(request);
        when(enrichmentClient.invokeApi(finalPayload)).thenReturn(responseXml);

        try (MockedStatic<XmlUtil> xmlUtilMock = org.mockito.Mockito.mockStatic(XmlUtil.class)) {
            xmlUtilMock.when(() -> XmlUtil.prepareReq(request)).thenReturn(finalPayload);
            xmlUtilMock.when(() -> XmlUtil.convertToResponse(responseXml))
                    .thenThrow(new XMLStreamException("response parse failed"));

            SdkException ex = assertThrows(SdkException.class, () -> service.execute(request));

            assertEquals(CifError.CIF_SDK_ERROR.getCode(), ex.getCode());
            assertEquals(CifError.CIF_SDK_ERROR.getMessage(), ex.getMessage());

            verify(tokenizationHelper).detokenizeRequest(request);
            verify(enrichmentClient).invokeApi(finalPayload);

            xmlUtilMock.verify(() -> XmlUtil.prepareReq(request));
            xmlUtilMock.verify(() -> XmlUtil.convertToResponse(responseXml));
        }
    }
}