package com.safepath.dto;

import com.safepath.model.Report;

import java.time.LocalDateTime;
import java.util.List;

/**
 * What ordinary (non-admin) users get back. Deliberately leaves out the audit
 * trail, internal notes and staff details.
 */
public record ReportView(
        String id,
        String name,
        String description,
        String photo,
        Report.Location location,
        String userId,
        String status,
        List<Report.Detection> detections,
        Integer detectionCount,
        Double maxConfidence,
        Double avgConfidence,
        String resolutionNote,
        String rejectionReason,
        LocalDateTime resolvedAt,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {

    /** Copy for the public map feed: no owner id. */
    public ReportView withoutOwner() {
        return new ReportView(id, name, description, photo, location, null, status, detections,
                detectionCount, maxConfidence, avgConfidence, resolutionNote, rejectionReason,
                resolvedAt, createdAt, updatedAt);
    }

    public static ReportView from(Report r) {
        List<Report.Detection> d = r.getDetections() == null ? List.of() : r.getDetections();
        return new ReportView(
                r.getId(),
                r.getName(),
                r.getDescription(),
                r.getPhoto(),
                r.getLocation(),
                r.getUserId(),
                com.safepath.workflow.ReportWorkflow.normalizeStatus(r.getStatus()),
                d,
                r.getDetectionCount() != null ? r.getDetectionCount() : d.size(),
                r.getMaxConfidence(),
                r.getAvgConfidence(),
                r.getResolutionNote(),
                r.getRejectionReason(),
                r.getResolvedAt(),
                r.getCreatedAt(),
                r.getUpdatedAt()
        );
    }
}
