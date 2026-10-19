package com.safepath.service;

import com.safepath.dto.ReportRequest;
import com.safepath.dto.ReportView;
import com.safepath.dto.YoloResponse;
import com.safepath.exception.ApiException;
import com.safepath.model.Report;
import com.safepath.model.User;
import com.safepath.repository.ReportRepository;
import com.safepath.repository.UserRepository;
import com.safepath.security.StaffPolicy;
import com.safepath.util.GeoUtil;
import com.safepath.workflow.ReportWorkflow;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/** Citizen-facing report operations. Admin operations live in AdminReportService. */
@Service
public class ReportService {

    private final ReportRepository reportRepository;
    private final UserRepository userRepository;
    private final FileStorageService fileStorageService;
    private final YoloService yoloService;

    public ReportService(
            ReportRepository reportRepository,
            UserRepository userRepository,
            FileStorageService fileStorageService,
            YoloService yoloService
    ) {
        this.reportRepository = reportRepository;
        this.userRepository = userRepository;
        this.fileStorageService = fileStorageService;
        this.yoloService = yoloService;
    }

    public ReportView createReport(
            ReportRequest request,
            String userId,
            MultipartFile photo
    ) {
        if (request.getName() == null || request.getName().isBlank()) {
            throw ApiException.badRequest("Report name is required");
        }
        if (!GeoUtil.isValidCoordinate(request.getLatitude(), request.getLongitude())) {
            throw ApiException.badRequest("A valid location is required");
        }
        if (photo == null || photo.isEmpty()) {
            throw ApiException.badRequest("A photo is required");
        }

        // 1. Upload image to Cloudinary
        String photoUrl = fileStorageService.saveFile(photo);

        // 2. Send image to FastAPI + YOLO
        YoloResponse yoloResponse = yoloService.detectImage(photo);

        // 3. Convert YOLO detections to Report detections
        List<Report.Detection> detections =
                yoloResponse == null || yoloResponse.getDetections() == null
                        ? new ArrayList<>()
                        : yoloResponse.getDetections()
                                .stream()
                                .map(d -> new Report.Detection(d.getLabel(), d.getScore()))
                                .toList();

        // 4. Build report
        Report report = new Report();
        report.setName(request.getName().trim());
        report.setDescription(
                request.getDescription() == null ? "" : request.getDescription().trim()
        );
        report.setPhoto(photoUrl);
        report.setLocation(
                new Report.Location(request.getLatitude(), request.getLongitude())
        );
        report.setUserId(userId);
        report.setStatus(ReportWorkflow.PENDING);
        report.setDetections(detections);

        Double max = detections.stream()
                .map(Report.Detection::getConfidenceScore)
                .filter(Objects::nonNull)
                .max(Double::compare)
                .orElse(null);
        Double avg = detections.isEmpty()
                ? null
                : detections.stream()
                        .map(Report.Detection::getConfidenceScore)
                        .filter(Objects::nonNull)
                        .mapToDouble(Double::doubleValue)
                        .average()
                        .orElse(0.0);

        report.setDetectionCount(detections.size());
        report.setMaxConfidence(max);
        report.setAvgConfidence(avg);
        report.setPriority(ReportWorkflow.computePriority(detections.size(), max));

        String reporterName = userRepository.findById(userId)
                .map(User::getName)
                .orElse("User");
        report.setHistory(new ArrayList<>());
        report.getHistory().add(new Report.HistoryEvent(
                LocalDateTime.now(), userId, reporterName,
                "submitted", null, ReportWorkflow.PENDING,
                detections.size() + " detection(s) by YOLO"
        ));

        return ReportView.from(reportRepository.save(report));
    }

    /** Users can read their own reports; staff can read anyone's. */
    public List<ReportView> getReportsByUserId(String userId, String requesterId) {
        assertOwnerOrStaff(userId, requesterId);
        return reportRepository.findByUserId(userId)
                .stream()
                .map(ReportView::from)
                .toList();
    }

    public ReportView getReportById(String id, String requesterId) {
        Report report = reportRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Report not found"));
        assertOwnerOrStaff(report.getUserId(), requesterId);
        return ReportView.from(report);
    }

    /** Open reports only (pending / in progress), for the public pothole map. Fixed ones drop off. */
    public List<ReportView> getAllReports() {
        return reportRepository.findAll()
                .stream()
                .filter(r -> ReportWorkflow.isActive(ReportWorkflow.normalizeStatus(r.getStatus())))
                .map(ReportView::from)
                .map(ReportView::withoutOwner)
                .toList();
    }

    private void assertOwnerOrStaff(String ownerId, String requesterId) {
        if (requesterId != null && requesterId.equals(ownerId)) {
            return;
        }
        boolean staff = requesterId != null && userRepository.findById(requesterId)
                .map(u -> StaffPolicy.isAdmin(u.getRole(), u.getEmail()))
                .orElse(false);
        if (!staff) {
            throw ApiException.forbidden("You can only view your own reports");
        }
    }
}
