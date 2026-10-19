package com.safepath.controller;

import com.safepath.dto.AdminDtos.*;
import com.safepath.service.AdminReportService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;

/**
 * Admin workspace API. SecurityConfig restricts /api/admin/** to ROLE_ADMIN, and
 * the JWT filter only grants ROLE_ADMIN to role=admin accounts with a company
 * email address (see StaffPolicy).
 */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final AdminReportService service;

    public AdminController(AdminReportService service) {
        this.service = service;
    }

    // ---------------------------- overview ----------------------------

    @GetMapping("/me")
    public MeView me(Authentication auth) {
        return service.me(auth.getName());
    }

    @GetMapping("/stats")
    public DashboardStats stats() {
        return service.stats();
    }

    // ---------------------------- reports ----------------------------

    @GetMapping("/reports")
    public PageResult list(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String priority,
            @RequestParam(required = false) String assignee,
            @RequestParam(required = false) String zone,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "created") String sort,
            @RequestParam(defaultValue = "desc") String dir,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size,
            Authentication auth
    ) {
        return service.list(
                filter(status, priority, assignee, zone, q, from, to, sort, dir, page, size),
                auth.getName());
    }

    @GetMapping("/reports/export")
    public ResponseEntity<byte[]> export(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String priority,
            @RequestParam(required = false) String assignee,
            @RequestParam(required = false) String zone,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            Authentication auth
    ) {
        String csv = service.exportCsv(
                filter(status, priority, assignee, zone, q, from, to, "created", "desc", 0, 200),
                auth.getName());
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"safepath-reports.csv\"")
                .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                .body(csv.getBytes(StandardCharsets.UTF_8));
    }

    @GetMapping("/reports/{id}")
    public AdminReportView detail(@PathVariable String id) {
        return service.detail(id);
    }

    @PostMapping("/reports/{id}/status")
    public AdminReportView status(
            @PathVariable String id,
            @RequestBody StatusRequest body,
            Authentication auth
    ) {
        return service.changeStatus(id, auth.getName(), body.status(), body.note());
    }

    @PostMapping("/reports/{id}/assign")
    public AdminReportView assign(
            @PathVariable String id,
            @RequestBody AssignRequest body,
            Authentication auth
    ) {
        return service.assign(id, auth.getName(), body.assigneeId());
    }

    @PostMapping("/reports/{id}/priority")
    public AdminReportView priority(
            @PathVariable String id,
            @RequestBody PriorityRequest body,
            Authentication auth
    ) {
        return service.setPriority(id, auth.getName(), body.priority());
    }

    @PostMapping("/reports/{id}/notes")
    public AdminReportView note(
            @PathVariable String id,
            @RequestBody NoteRequest body,
            Authentication auth
    ) {
        return service.addNote(id, auth.getName(), body.text());
    }

    @PostMapping("/reports/bulk")
    public BulkResult bulk(@RequestBody BulkRequest body, Authentication auth) {
        return service.bulk(body, auth.getName());
    }

    @DeleteMapping("/reports/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    // ---------------------------- areas ----------------------------

    @GetMapping("/hotspots")
    public List<HotspotView> hotspots(
            @RequestParam(required = false) Double cell
    ) {
        return service.hotspots(cell);
    }

    @GetMapping("/zones")
    public List<ZoneStat> zones() {
        return service.zoneStats();
    }

    @PostMapping("/zones")
    public ZoneStat createZone(@RequestBody ZoneRequest body, Authentication auth) {
        return service.createZone(body, auth.getName());
    }

    @DeleteMapping("/zones/{id}")
    public ResponseEntity<Void> deleteZone(@PathVariable String id) {
        service.deleteZone(id);
        return ResponseEntity.noContent().build();
    }

    // ---------------------------- staff ----------------------------

    @GetMapping("/staff")
    public List<StaffView> staff() {
        return service.staff();
    }

    @PostMapping("/staff")
    public StaffView createStaff(@RequestBody StaffRequest body) {
        return service.createStaff(body);
    }

    @PostMapping("/me/password")
    public ResponseEntity<Void> changePassword(
            @RequestBody PasswordRequest body, Authentication auth
    ) {
        service.changePassword(auth.getName(), body);
        return ResponseEntity.noContent().build();
    }

    // ---------------------------- helpers ----------------------------

    private static AdminReportService.Filter filter(
            String status, String priority, String assignee, String zone, String q,
            LocalDate from, LocalDate to, String sort, String dir, int page, int size
    ) {
        AdminReportService.Filter f = new AdminReportService.Filter();
        f.status = status;
        f.priority = priority;
        f.assignee = assignee;
        f.zone = zone;
        f.q = q;
        f.from = from;
        f.to = to;
        f.sort = sort;
        f.dir = dir;
        f.page = page;
        f.size = size;
        return f;
    }
}
