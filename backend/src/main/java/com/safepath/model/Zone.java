package com.safepath.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;

/** A named circular area (e.g. "Sector 14 Market") that admins track. */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "zones")
public class Zone {

    @Id
    private String id;

    private String name;

    private Double latitude;

    private Double longitude;

    private Double radiusMeters;

    private String createdByName;

    @CreatedDate
    private LocalDateTime createdAt;
}
