package com.safepath.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "reports")
public class Report {

    @Id
    private String id;

    private String name;

    private String description;

    private String photo;

    private Location location;

    private String userId;

    /** pending | in_progress | resolved | rejected */
    private String status = "pending";

    private List<Detection> detections;

    // Summary of detections (for admin sorting/filtering)
    private Integer detectionCount;

    private Double maxConfidence;

    private Double avgConfidence;

    /** low | medium | high | critical (auto-suggested, admin can change) */
    private String priority;

    // ---- admin workflow ----
    private String assignedToId;

    private String assignedToName;

    private String resolutionNote;

    private String rejectionReason;

    private LocalDateTime resolvedAt;

    private String resolvedByName;

    private List<HistoryEvent> history = new ArrayList<>();

    @CreatedDate
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Location {

        private Double latitude;

        private Double longitude;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Detection {

        private String damageType;

        private Double confidenceScore;
    }

    /** One entry of the audit trail shown on the admin timeline. */
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class HistoryEvent {

        private LocalDateTime at;

        private String byId;

        private String byName;

        /** submitted | status_changed | assigned | unassigned | priority_changed | note */
        private String action;

        private String fromStatus;

        private String toStatus;

        private String note;
    }
}
