package com.safepath.analytics;

import com.safepath.workflow.ReportWorkflow;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Groups reports into grid cells (default ~500 m) to find problem areas. */
public final class HotspotCalculator {

    public record Hotspot(
            double lat,
            double lon,
            int total,
            int active,
            int resolved,
            int criticalActive,
            long oldestActiveAgeHours
    ) {
    }

    private static final class Acc {
        double latSum, lonSum;
        int total, active, resolved, criticalActive;
        long oldestActiveHours;
    }

    private HotspotCalculator() {
    }

    public static List<Hotspot> cluster(
            List<ReportFacts> facts, double cellSizeDeg, LocalDateTime now
    ) {
        Map<String, Acc> cells = new HashMap<>();

        for (ReportFacts f : facts) {
            String key = Math.floor(f.lat() / cellSizeDeg) + ":"
                    + Math.floor(f.lon() / cellSizeDeg);
            Acc a = cells.computeIfAbsent(key, k -> new Acc());
            a.latSum += f.lat();
            a.lonSum += f.lon();
            a.total++;

            String status = ReportWorkflow.normalizeStatus(f.status());
            if (ReportWorkflow.isActive(status)) {
                a.active++;
                if ("critical".equals(f.priority())) {
                    a.criticalActive++;
                }
                if (f.createdAt() != null) {
                    long h = Math.max(Duration.between(f.createdAt(), now).toHours(), 0);
                    a.oldestActiveHours = Math.max(a.oldestActiveHours, h);
                }
            } else if (ReportWorkflow.RESOLVED.equals(status)) {
                a.resolved++;
            }
        }

        List<Hotspot> out = new ArrayList<>();
        for (Acc a : cells.values()) {
            out.add(new Hotspot(
                    a.latSum / a.total, a.lonSum / a.total,
                    a.total, a.active, a.resolved,
                    a.criticalActive, a.oldestActiveHours
            ));
        }

        out.sort(
                Comparator.comparingInt(Hotspot::active).reversed()
                        .thenComparing(Comparator.comparingInt(Hotspot::total).reversed())
        );
        return out;
    }
}
