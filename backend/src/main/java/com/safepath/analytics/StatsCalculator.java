package com.safepath.analytics;

import com.safepath.workflow.ReportWorkflow;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class StatsCalculator {

    public record DailyPoint(LocalDate date, int created, int resolved) {
    }

    public record Stats(
            int total,
            Map<String, Integer> byStatus,
            Map<String, Integer> activeByPriority,
            int unassignedActive,
            int overdueActive,
            Double avgResolutionHours,
            List<DailyPoint> daily
    ) {
    }

    private StatsCalculator() {
    }

    public static Stats compute(
            List<ReportFacts> facts,
            LocalDateTime now,
            int days,
            int overdueDays
    ) {
        Map<String, Integer> byStatus = new LinkedHashMap<>();
        for (String s : ReportWorkflow.STATUSES) {
            byStatus.put(s, 0);
        }
        Map<String, Integer> activeByPriority = new LinkedHashMap<>();
        for (String p : ReportWorkflow.PRIORITIES) {
            activeByPriority.put(p, 0);
        }

        int unassignedActive = 0;
        int overdueActive = 0;
        double resolutionHoursSum = 0;
        int resolvedWithDates = 0;

        LocalDate today = now.toLocalDate();
        Map<LocalDate, int[]> daily = new LinkedHashMap<>();
        for (int i = days - 1; i >= 0; i--) {
            daily.put(today.minusDays(i), new int[]{0, 0});
        }

        for (ReportFacts f : facts) {
            String status = ReportWorkflow.normalizeStatus(f.status());
            byStatus.merge(status, 1, Integer::sum);

            if (ReportWorkflow.isActive(status)) {
                String p = f.priority() == null ? "low" : f.priority();
                activeByPriority.merge(p, 1, Integer::sum);
                if (!f.assigned()) {
                    unassignedActive++;
                }
                if (f.createdAt() != null
                        && f.createdAt().isBefore(now.minusDays(overdueDays))) {
                    overdueActive++;
                }
            }

            if (ReportWorkflow.RESOLVED.equals(status)
                    && f.createdAt() != null && f.resolvedAt() != null) {
                double hours = Duration.between(f.createdAt(), f.resolvedAt()).toMinutes() / 60.0;
                resolutionHoursSum += Math.max(hours, 0);
                resolvedWithDates++;
            }

            if (f.createdAt() != null) {
                int[] cell = daily.get(f.createdAt().toLocalDate());
                if (cell != null) {
                    cell[0]++;
                }
            }
            if (f.resolvedAt() != null && ReportWorkflow.RESOLVED.equals(status)) {
                int[] cell = daily.get(f.resolvedAt().toLocalDate());
                if (cell != null) {
                    cell[1]++;
                }
            }
        }

        List<DailyPoint> series = new ArrayList<>();
        daily.forEach((d, c) -> series.add(new DailyPoint(d, c[0], c[1])));

        Double avg = resolvedWithDates == 0
                ? null
                : Math.round(resolutionHoursSum / resolvedWithDates * 10.0) / 10.0;

        return new Stats(
                facts.size(), byStatus, activeByPriority,
                unassignedActive, overdueActive, avg, series
        );
    }
}
