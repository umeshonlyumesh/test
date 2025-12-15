package com.truist.core.config;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.util.Map;
import java.util.Optional;

@Component
public class CountryCodeLookup {

    private static final String FILE_PATH =
            "config/country-codes-reversed.json";

    private final ObjectMapper objectMapper;
    private Map<String, String> alpha3ToAlpha2;

    public CountryCodeLookup(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @PostConstruct
    void init() {
        try (InputStream is =
                     new ClassPathResource(FILE_PATH).getInputStream()) {

            this.alpha3ToAlpha2 = Map.copyOf(
                    objectMapper.readValue(
                            is,
                            new TypeReference<Map<String, String>>() {}
                    )
            );

        } catch (Exception e) {
            throw new IllegalStateException(
                    "Failed to load country-codes-reversed.json", e);
        }
    }

    /** Example: NZL → NZ */
    public Optional<String> toAlpha2(String alpha3) {
        return Optional.ofNullable(alpha3ToAlpha2.get(alpha3));
    }

    public boolean isValidAlpha3(String alpha3) {
        return alpha3ToAlpha2.containsKey(alpha3);
    }

    public Map<String, String> getAll() {
        return alpha3ToAlpha2;
    }
}