package com.safepath.controller;

import com.safepath.dto.ReportRequest;
import com.safepath.dto.ReportView;
import com.safepath.service.ReportService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/**
 * Citizen endpoints. Resolve / delete / assign etc. are admin-only and live in
 * AdminController (/api/admin/**).
 */
@RestController
@RequestMapping("/api/report")
public class ReportController {

    private final ReportService reportService;

    public ReportController(ReportService reportService) {
        this.reportService = reportService;
    }

    @PostMapping(
            value = "/register",
            consumes = "multipart/form-data"
    )
    public ResponseEntity<ReportView> createReport(
            @RequestParam("name") String name,
            @RequestParam(value = "description", required = false) String description,
            @RequestParam("latitude") Double latitude,
            @RequestParam("longitude") Double longitude,
            @RequestParam("photo") MultipartFile photo,
            Authentication authentication
    ) {
        ReportRequest request = new ReportRequest(
                name, description, latitude, longitude
        );

        return ResponseEntity.ok(
                reportService.createReport(request, authentication.getName(), photo)
        );
    }

    @GetMapping("/user/{userId}")
    public List<ReportView> getReportsByUser(
            @PathVariable String userId,
            Authentication authentication
    ) {
        return reportService.getReportsByUserId(userId, authentication.getName());
    }

    @GetMapping("/{id}")
    public ReportView getReportById(
            @PathVariable String id,
            Authentication authentication
    ) {
        return reportService.getReportById(id, authentication.getName());
    }

    @GetMapping
    public List<ReportView> getAllReports() {
        return reportService.getAllReports();
    }
}
