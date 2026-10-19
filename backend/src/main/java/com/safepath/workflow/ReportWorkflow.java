package com.safepath.workflow;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Report lifecycle rules (pure Java, no Spring dependencies).
 *
 *   pending ──► in_progress ──► resolved
 *      │            │              │
 *      └────────────┴──► rejected  └──► in_progress (reopen)
 *                          └──► pending (reopen)
 */
public final class ReportWorkflow {

    public static final String PENDING = "pending";
    public static final String IN_PROGRESS = "in_progress";
    public static final String RESOLVED = "resolved";
    public static final String REJECTED = "rejected";

    public static final List<String> STATUSES =
            List.of(PENDING, IN_PROGRESS, RESOLVED, REJECTED);

    public static final List<String> PRIORITIES =
            List.of("low", "medium", "high", "critical");

    private static final Map<String, Set<String>> ALLOWED = Map.of(
            PENDING, Set.of(IN_PROGRESS, RESOLVED, REJECTED),
            IN_PROGRESS, Set.of(PENDING, RESOLVED, REJECTED),
            RESOLVED, Set.of(IN_PROGRESS),
            REJECTED, Set.of(PENDING)
    );

    private ReportWorkflow() {
    }

    /** Null/blank/unknown statuses (legacy documents) are treated as pending. */
    public static String normalizeStatus(String status) {
        if (status == null) {
            return PENDING;
        }
        String s = status.trim().toLowerCase();
        return STATUSES.contains(s) ? s : PENDING;
    }

    public static boolean isValidStatus(String status) {
        return status != null && STATUSES.contains(status.trim().toLowerCase());
    }

    /** Active = still needs work (shown on the public map, "Active" tab in the app). */
    public static boolean isActive(String status) {
        String s = normalizeStatus(status);
        return PENDING.equals(s) || IN_PROGRESS.equals(s);
    }

    public static boolean canTransition(String from, String to) {
        Set<String> allowed = ALLOWED.get(normalizeStatus(from));
        return allowed != null && allowed.contains(normalizeStatus(to));
    }

    /** Rejecting a report must always be explained to the reporter. */
    public static boolean requiresNote(String to) {
        return REJECTED.equals(normalizeStatus(to));
    }

    public static boolean isValidPriority(String priority) {
        return priority != null && PRIORITIES.contains(priority.trim().toLowerCase());
    }

    public static int priorityRank(String priority) {
        if (priority == null) {
            return 0;
        }
        int idx = PRIORITIES.indexOf(priority.trim().toLowerCase());
        return Math.max(idx, 0);
    }

    /**
     * Initial priority from what YOLO found.
     * critical: several potholes AND a very confident one
     * high:     a very confident detection, or 3+ potholes
     * medium:   a reasonably confident detection
     * low:      weak / no detection
     */
    public static String computePriority(int detectionCount, Double maxConfidence) {
        double max = maxConfidence == null ? 0.0 : maxConfidence;
        if (detectionCount <= 0) {
            return "low";
        }
        if (detectionCount >= 3 && max >= 0.8) {
            return "critical";
        }
        if (max >= 0.75 || detectionCount >= 3) {
            return "high";
        }
        if (max >= 0.5) {
            return "medium";
        }
        return "low";
    }
}
