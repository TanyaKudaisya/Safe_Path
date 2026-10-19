package com.safepath.util;

/** Phone number cleaning/validation. Pure Java so it can be unit tested. */
public final class PhoneUtil {

    private PhoneUtil() {
    }

    /**
     * Strips spaces, dashes, dots and brackets and returns digits with an optional leading '+'.
     * Returns null when the result is not 10-15 digits (E.164 allows at most 15).
     */
    public static String normalize(String raw) {
        if (raw == null) {
            return null;
        }
        String s = raw.trim().replaceAll("[\\s\\-().]", "");
        boolean plus = s.startsWith("+");
        String digits = plus ? s.substring(1) : s;
        if (!digits.matches("\\d{10,15}")) {
            return null;
        }
        return (plus ? "+" : "") + digits;
    }
}
