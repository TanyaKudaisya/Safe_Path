package com.safepath.dto;

import com.safepath.analytics.StatsCalculator;
import com.safepath.model.Report;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/** Request/response shapes for /api/admin/**. */
public final class AdminDtos {

    private AdminDtos() {
    }

    // ----------------------------- requests -----------------------------

    public record StatusRequest(String status, String note) {
    }

    public record AssignRequest(String assigneeId) {
    }

    public record PriorityRequest(String priority) {
    }

    public record NoteRequest(String text) {
    }

    public record BulkRequest(
            List<String> ids, String action, String note, String assigneeId
    ) {
    }

    public record ZoneRequest(
            String name, Double latitude, Double longitude, Double radiusMeters
    ) {
    }

    public record StaffRequest(String name, String email, String password) {
    }

    public record PasswordRequest(String currentPassword, String newPassword) {
    }

    // ----------------------------- responses -----------------------------

    public record NearbyReport(
            String id, String name, String status, long distanceMeters
    ) {
    }

    public record AdminReportView(
            String id,
            String name,
            String description,
            String photo,
            Report.Location location,
            String userId,
            String reporterName,
            String reporterEmail,
            String reporterPhone,
            String status,
            String priority,
            String assignedToId,
            String assignedToName,
            String zoneId,
            String zoneName,
            Integer detectionCount,
            Double maxConfidence,
            Double avgConfidence,
            List<Report.Detection> detections,
            String resolutionNote,
            String rejectionReason,
            String resolvedByName,
            LocalDateTime resolvedAt,
            LocalDateTime createdAt,
            LocalDateTime updatedAt,
            long ageHours,
            boolean overdue,
            List<Report.HistoryEvent> history,
            List<NearbyReport> nearby
    ) {
    }

    public record PageResult(
            List<AdminReportView> items,
            int total,
            int page,
            int size,
            Map<String, Integer> statusCounts
    ) {
    }

    public record BulkResult(
            int updated, Map<String, String> failed
    ) {
    }

    public record HotspotView(
            double latitude,
            double longitude,
            int total,
            int active,
            int resolved,
            int criticalActive,
            long oldestActiveAgeHours,
            String label,
            String zoneName
    ) {
    }

    public record ZoneStat(
            String id,
            String name,
            double latitude,
            double longitude,
            double radiusMeters,
            int total,
            int active,
            int resolved,
            int rejected,
            int criticalActive,
            double avgActiveAgeHours,
            String createdByName
    ) {
    }

    public record ActivityItem(
            String reportId,
            String reportName,
            LocalDateTime at,
            String byName,
            String action,
            String toStatus,
            String note
    ) {
    }

    public record DashboardStats(
            int total,
            Map<String, Integer> byStatus,
            Map<String, Integer> activeByPriority,
            int unassignedActive,
            int overdueActive,
            Double avgResolutionHours,
            List<StatsCalculator.DailyPoint> daily,
            List<ActivityItem> recentActivity,
            List<AdminReportView> needsAttention,
            List<HotspotView> topHotspots,
            List<ZoneStat> topZones
    ) {
    }

    public record StaffView(
            String id, String name, String email, int activeAssigned
    ) {
    }

    public record MeView(
            String id, String name, String email, String role
    ) {
    }
}
