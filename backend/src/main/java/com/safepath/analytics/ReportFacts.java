package com.safepath.analytics;

import java.time.LocalDateTime;

/** Minimal, framework-free view of a report used by the calculators. */
public record ReportFacts(
        String id,
        double lat,
        double lon,
        String status,
        String priority,
        LocalDateTime createdAt,
        LocalDateTime resolvedAt,
        boolean assigned
) {
}
