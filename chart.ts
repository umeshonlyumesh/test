@Test
void invokeApiTest() throws CPSConnectorException {

    FraudResponse fraudResponse = FraudResponse.builder()
            .successfull(true)
            .body(
                FraudResponseBody.builder()
                        .returnCode("0")
                        .customOutCome(
                                CustomOutcome.builder()
                                        .response("Allow")
                                        .build()
                        )
                        .build()
            )
            .build();

    RestResponse<FraudResponse> expectedResp =
            RestResponse.<FraudResponse>builder()
                    .body(fraudResponse)
                    .statusCode(200)
                    .build();

    when(props.getUrl()).thenReturn("http://test-url");
    when(props.getConnectTimeout()).thenReturn(1000);
    when(props.getReadTimeout()).thenReturn(2000);

    when(connector.post(
            eq("http://test-url"),
            anyString(),
            anyMap(),
            eq(FraudResponse.class)
    )).thenReturn(expectedResp);

    RestResponse<FraudResponse> actualResp = client.invokeApi("ifmxRequest");

    assertNotNull(actualResp);
    assertTrue(actualResp.isSuccessful());
    assertEquals("0", actualResp.getBody().getReturnCode());
    assertEquals("Allow", actualResp.getBody().getCustomOutCome().getResponse());
}