import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;

import java.io.File;
import java.util.Map;
import java.util.stream.Collectors;

public class ReverseJsonGenerator {

    public static void main(String[] args) throws Exception {

        ObjectMapper mapper = new ObjectMapper()
                .enable(SerializationFeature.INDENT_OUTPUT);

        // 🔹 Input JSON file
        File inputFile = new File("country-codes.json");

        // 🔹 Output JSON file
        File outputFile = new File("country-codes-reversed.json");

        // 1️⃣ Read original JSON (ALPHA2 → ALPHA3)
        Map<String, String> original =
                mapper.readValue(
                        inputFile,
                        new TypeReference<Map<String, String>>() {}
                );

        // 2️⃣ Reverse map (ALPHA3 → ALPHA2)
        Map<String, String> reversed =
                original.entrySet()
                        .stream()
                        .collect(Collectors.toMap(
                                Map.Entry::getValue, // value becomes key
                                Map.Entry::getKey,   // key becomes value
                                (v1, v2) -> {
                                    throw new IllegalStateException(
                                            "Duplicate value found while reversing JSON: " + v1
                                    );
                                }
                        ));

        // 3️⃣ Write reversed JSON to file
        mapper.writeValue(outputFile, reversed);

        System.out.println("✅ Reversed JSON generated: "
                + outputFile.getAbsolutePath());
    }
}