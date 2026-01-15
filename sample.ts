package com.truist.core.common.logging;

public final class LogSanitizer {

    private static final int MAX_LEN = 8000;

    private LogSanitizer() {}

    public static String sanitize(String input) {
        if (input == null) return null;

        // cap size to avoid log flooding
        String s = input.length() > MAX_LEN ? input.substring(0, MAX_LEN) + "..." : input;

        StringBuilder out = new StringBuilder(s.length() + 32);
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '\r' -> out.append("\\r");
                case '\n' -> out.append("\\n");
                case '\t' -> out.append("\\t");
                case '\f' -> out.append("\\f");
                case '\b' -> out.append("\\b");

                // Unicode line separators (often missed)
                case '\u2028' -> out.append("\\u2028");
                case '\u2029' -> out.append("\\u2029");
                case '\u0085' -> out.append("\\u0085");

                default -> {
                    // Escape other control chars (0x00-0x1F, 0x7F-0x9F)
                    if ((c <= 0x1F) || (c >= 0x7F && c <= 0x9F)) {
                        out.append(String.format("\\u%04x", (int) c));
                    } else {
                        out.append(c);
                    }
                }
            }
        }
        return out.toString();
    }
}