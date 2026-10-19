package com.safepath.service;

import com.safepath.analytics.HotspotCalculator;
import com.safepath.analytics.ReportFacts;
import com.safepath.analytics.StatsCalculator;
import com.safepath.dto.AdminDtos.*;
import com.safepath.exception.ApiException;
import com.safepath.model.Report;
import com.safepath.model.User;
import com.safepath.model.Zone;
import com.safepath.repository.ReportRepository;
import com.safepath.repository.UserRepository;
import com.safepath.repository.ZoneRepository;
import com.safepath.security.StaffPolicy;
import com.safepath.util.GeoUtil;
import com.safepath.workflow.ReportWorkflow;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Everything the admin dashboard does. All callers are already verified as staff. */
@Service
public class AdminReportService {

    private static final int OVERDUE_DAYS = 7;
    private static final double DUPLICATE_RADIUS_M = 30.0;
    private static final double DEFAULT_CELL_DEG = 0.005; // ~550 m

    private final ReportRepository reportRepository;
    private final UserRepository userRepository;
    private final ZoneRepository zoneRepository;
    private final PasswordEncoder passwordEncoder;
    private final PushService pushService;

    public AdminReportService(
            ReportRepository reportRepository,
            UserRepository userRepository,
            ZoneRepository zoneRepository,
            PasswordEncoder passwordEncoder,
            PushService pushService
    ) {
        this.pushService = pushService;
        this.reportRepository = reportRepository;
        this.userRepository = userRepository;
        this.zoneRepository = zoneRepository;
        this.passwordEncoder = passwordEncoder;
    }

    // ===================================================================
    //  Filters
    // ===================================================================

    public static class Filter {
        public String status;    // all | active | csv of statuses
        public String priority;  // csv
        public String assignee;  // me | unassigned | <userId>
        public String zone;      // <zoneId> | none
        public String q;
        public LocalDate from;
        public LocalDate to;
        public String sort = "created";  // created | priority | confidence | age
        public String dir = "desc";
        public int page = 0;
        public int size = 25;
    }

    /** Lookup data loaded once per request. */
    private static class Ctx {
        Map<String, User> users;
        List<Zone> zones;
    }

    private Ctx context(Collection<Report> reports) {
        Ctx c = new Ctx();
        Set<String> ids = reports.stream()
                .map(Report::getUserId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        c.users = new HashMap<>();
        if (!ids.isEmpty()) {
            for (User u : userRepository.findAllById(ids)) {
                c.users.put(u.getId(), u);
            }
        }
        c.zones = zoneRepository.findAll();
        return c;
    }

    // ===================================================================
    //  Listing / detail
    // ===================================================================

    public PageResult list(Filter f, String actorId) {
        List<Report> all = reportRepository.findAll();
        Ctx ctx = context(all);
        List<AdminReportView> views = all.stream()
                .map(r -> toView(r, ctx, false))
                .collect(Collectors.toList());

        // everything except the status filter -> used for the tab counts
        List<AdminReportView> base = views.stream()
                .filter(v -> matchesNonStatus(v, f, actorId))
                .collect(Collectors.toList());

        Map<String, Integer> counts = new LinkedHashMap<>();
        for (String s : ReportWorkflow.STATUSES) {
            counts.put(s, 0);
        }
        for (AdminReportView v : base) {
            counts.merge(v.status(), 1, Integer::sum);
        }

        Set<String> wanted = parseStatuses(f.status);
        List<AdminReportView> filtered = base.stream()
                .filter(v -> wanted == null || wanted.contains(v.status()))
                .sorted(comparator(f))
                .collect(Collectors.toList());

        int size = Math.min(Math.max(f.size, 1), 200);
        int page = Math.max(f.page, 0);
        int fromIdx = Math.min(page * size, filtered.size());
        int toIdx = Math.min(fromIdx + size, filtered.size());

        return new PageResult(
                filtered.subList(fromIdx, toIdx), filtered.size(), page, size, counts
        );
    }

    private Set<String> parseStatuses(String status) {
        if (status == null || status.isBlank() || "all".equalsIgnoreCase(status)) {
            return null;
        }
        if ("active".equalsIgnoreCase(status)) {
            return Set.of(ReportWorkflow.PENDING, ReportWorkflow.IN_PROGRESS);
        }
        Set<String> out = new HashSet<>();
        for (String s : status.split(",")) {
            if (ReportWorkflow.isValidStatus(s)) {
                out.add(s.trim().toLowerCase());
            }
        }
        return out.isEmpty() ? null : out;
    }

    private boolean matchesNonStatus(AdminReportView v, Filter f, String actorId) {
        if (f.priority != null && !f.priority.isBlank() && !"all".equalsIgnoreCase(f.priority)) {
            Set<String> p = Arrays.stream(f.priority.split(","))
                    .map(s -> s.trim().toLowerCase())
                    .collect(Collectors.toSet());
            if (!p.contains(v.priority())) {
                return false;
            }
        }
        if (f.assignee != null && !f.assignee.isBlank() && !"all".equalsIgnoreCase(f.assignee)) {
            if ("unassigned".equalsIgnoreCase(f.assignee) || "none".equalsIgnoreCase(f.assignee)) {
                if (v.assignedToId() != null) {
                    return false;
                }
            } else {
                String want = "me".equalsIgnoreCase(f.assignee) ? actorId : f.assignee;
                if (!Objects.equals(v.assignedToId(), want)) {
                    return false;
                }
            }
        }
        if (f.zone != null && !f.zone.isBlank() && !"all".equalsIgnoreCase(f.zone)) {
            if ("none".equalsIgnoreCase(f.zone)) {
                if (v.zoneId() != null) {
                    return false;
                }
            } else if (!f.zone.equals(v.zoneId())) {
                return false;
            }
        }
        if (f.from != null && (v.createdAt() == null || v.createdAt().toLocalDate().isBefore(f.from))) {
            return false;
        }
        if (f.to != null && (v.createdAt() == null || v.createdAt().toLocalDate().isAfter(f.to))) {
            return false;
        }
        if (f.q != null && !f.q.isBlank()) {
            String q = f.q.trim().toLowerCase();
            String hay = String.join(" ",
                    nz(v.name()), nz(v.description()), nz(v.reporterName()),
                    nz(v.reporterEmail()), nz(v.reporterPhone()), nz(v.id()), nz(v.zoneName()),
                    nz(v.assignedToName())
            ).toLowerCase();
            if (!hay.contains(q)) {
                return false;
            }
        }
        return true;
    }

    private Comparator<AdminReportView> comparator(Filter f) {
        Comparator<AdminReportView> c;
        switch (f.sort == null ? "created" : f.sort) {
            case "priority" -> c = Comparator.comparingInt(
                    v -> ReportWorkflow.priorityRank(v.priority()));
            case "confidence" -> c = Comparator.comparingDouble(
                    v -> v.maxConfidence() == null ? 0.0 : v.maxConfidence());
            case "age" -> c = Comparator.comparingLong(AdminReportView::ageHours);
            default -> c = Comparator.comparing(
                    AdminReportView::createdAt,
                    Comparator.nullsFirst(Comparator.naturalOrder()));
        }
        return "asc".equalsIgnoreCase(f.dir) ? c : c.reversed();
    }

    public AdminReportView detail(String id) {
        Report r = find(id);
        List<Report> all = reportRepository.findAll();
        List<Report> forCtx = new ArrayList<>(all);
        Ctx ctx = context(forCtx);
        AdminReportView base = toView(r, ctx, true);

        // possible duplicates: other reports within 30 m
        List<NearbyReport> nearby = new ArrayList<>();
        if (r.getLocation() != null && r.getLocation().getLatitude() != null) {
            for (Report o : all) {
                if (o.getId().equals(r.getId()) || o.getLocation() == null
                        || o.getLocation().getLatitude() == null) {
                    continue;
                }
                double d = GeoUtil.haversineMeters(
                        r.getLocation().getLatitude(), r.getLocation().getLongitude(),
                        o.getLocation().getLatitude(), o.getLocation().getLongitude());
                if (d <= DUPLICATE_RADIUS_M) {
                    nearby.add(new NearbyReport(
                            o.getId(), o.getName(),
                            ReportWorkflow.normalizeStatus(o.getStatus()),
                            Math.round(d)));
                }
            }
            nearby.sort(Comparator.comparingLong(NearbyReport::distanceMeters));
        }

        return new AdminReportView(
                base.id(), base.name(), base.description(), base.photo(), base.location(),
                base.userId(), base.reporterName(), base.reporterEmail(), base.reporterPhone(), base.status(),
                base.priority(), base.assignedToId(), base.assignedToName(),
                base.zoneId(), base.zoneName(), base.detectionCount(), base.maxConfidence(),
                base.avgConfidence(), base.detections(), base.resolutionNote(),
                base.rejectionReason(), base.resolvedByName(), base.resolvedAt(),
                base.createdAt(), base.updatedAt(), base.ageHours(), base.overdue(),
                base.history(), nearby
        );
    }

    // ===================================================================
    //  Workflow actions
    // ===================================================================

    public AdminReportView changeStatus(
            String id, String actorId, String newStatus, String note
    ) {
        Report r = find(id);
        applyStatus(r, actor(actorId), newStatus, note);
        reportRepository.save(r);
        notifyOwner(r);
        return detail(id);
    }

    private void applyStatus(Report r, User actor, String newStatus, String note) {
        if (!ReportWorkflow.isValidStatus(newStatus)) {
            throw ApiException.badRequest("Unknown status: " + newStatus);
        }
        String from = ReportWorkflow.normalizeStatus(r.getStatus());
        String to = ReportWorkflow.normalizeStatus(newStatus);
        String cleanNote = note == null ? "" : note.trim();

        if (from.equals(to)) {
            throw ApiException.badRequest("Report is already " + to.replace('_', ' '));
        }
        if (!ReportWorkflow.canTransition(from, to)) {
            throw ApiException.badRequest(
                    "Cannot move a report from " + from.replace('_', ' ')
                            + " to " + to.replace('_', ' '));
        }
        if (ReportWorkflow.requiresNote(to) && cleanNote.isEmpty()) {
            throw ApiException.badRequest(
                    "Please explain why the report is rejected - the reporter will see it");
        }

        LocalDateTime now = LocalDateTime.now();
        r.setStatus(to);

        // leaving a closed state clears the closing data (it stays in the history)
        if (ReportWorkflow.RESOLVED.equals(from) || ReportWorkflow.REJECTED.equals(from)) {
            r.setResolvedAt(null);
            r.setResolvedByName(null);
            r.setResolutionNote(null);
            r.setRejectionReason(null);
        }

        switch (to) {
            case ReportWorkflow.RESOLVED -> {
                r.setResolvedAt(now);
                r.setResolvedByName(actor.getName());
                r.setResolutionNote(cleanNote.isEmpty() ? null : cleanNote);
            }
            case ReportWorkflow.REJECTED -> {
                r.setResolvedAt(now);
                r.setResolvedByName(actor.getName());
                r.setRejectionReason(cleanNote);
            }
            case ReportWorkflow.IN_PROGRESS -> {
                if (r.getAssignedToId() == null) {
                    r.setAssignedToId(actor.getId());
                    r.setAssignedToName(actor.getName());
                }
            }
            default -> {
            }
        }

        addEvent(r, actor, "status_changed", from, to, cleanNote);
    }

    /** Tells the reporter about the new status (nothing is sent for "back to pending"). */
    private void notifyOwner(Report r) {
        String status = ReportWorkflow.normalizeStatus(r.getStatus());
        String name = r.getName() == null || r.getName().isBlank() ? "your report" : "\"" + r.getName() + "\"";
        String title;
        String body;
        switch (status) {
            case ReportWorkflow.IN_PROGRESS -> {
                title = "Your report is being handled";
                body = "Work on " + name + " has started.";
            }
            case ReportWorkflow.RESOLVED -> {
                title = "Your report was resolved";
                body = name + " has been fixed."
                        + (r.getResolutionNote() == null ? "" : " " + shorten(r.getResolutionNote()));
            }
            case ReportWorkflow.REJECTED -> {
                title = "Your report was closed";
                body = name + " could not be taken forward. Reason: "
                        + shorten(r.getRejectionReason());
            }
            default -> {
                return;
            }
        }
        pushService.notifyUser(r.getUserId(), title, body,
                Map.of("type", "report_status", "reportId", String.valueOf(r.getId()), "status", status));
    }

    private static String shorten(String s) {
        if (s == null) {
            return "";
        }
        String t = s.trim();
        return t.length() <= 120 ? t : t.substring(0, 117) + "...";
    }

    public AdminReportView assign(String id, String actorId, String assigneeId) {
        Report r = find(id);
        User actor = actor(actorId);
        applyAssign(r, actor, assigneeId);
        reportRepository.save(r);
        return detail(id);
    }

    private void applyAssign(Report r, User actor, String assigneeId) {
        String status = ReportWorkflow.normalizeStatus(r.getStatus());

        if (assigneeId == null || assigneeId.isBlank()) {
            if (r.getAssignedToId() == null) {
                return;
            }
            String previous = r.getAssignedToName();
            r.setAssignedToId(null);
            r.setAssignedToName(null);
            addEvent(r, actor, "unassigned", status, status, "Was " + previous);
            return;
        }

        User assignee = userRepository.findById(assigneeId)
                .filter(u -> StaffPolicy.isAdmin(u.getRole(), u.getEmail()))
                .orElseThrow(() -> ApiException.badRequest("Assignee must be a staff member"));

        if (assignee.getId().equals(r.getAssignedToId())) {
            return;
        }
        r.setAssignedToId(assignee.getId());
        r.setAssignedToName(assignee.getName());

        String from = status;
        if (ReportWorkflow.PENDING.equals(status)) {
            r.setStatus(ReportWorkflow.IN_PROGRESS);
        }
        addEvent(r, actor, "assigned", from, ReportWorkflow.normalizeStatus(r.getStatus()),
                "Assigned to " + assignee.getName());
    }

    public AdminReportView setPriority(String id, String actorId, String priority) {
        if (!ReportWorkflow.isValidPriority(priority)) {
            throw ApiException.badRequest("Priority must be low, medium, high or critical");
        }
        Report r = find(id);
        User actor = actor(actorId);
        String old = r.getPriority() == null ? "-" : r.getPriority();
        String neu = priority.trim().toLowerCase();
        if (!neu.equals(r.getPriority())) {
            r.setPriority(neu);
            String st = ReportWorkflow.normalizeStatus(r.getStatus());
            addEvent(r, actor, "priority_changed", st, st, old + " -> " + neu);
            reportRepository.save(r);
        }
        return detail(id);
    }

    public AdminReportView addNote(String id, String actorId, String text) {
        if (text == null || text.isBlank()) {
            throw ApiException.badRequest("Note cannot be empty");
        }
        if (text.length() > 1000) {
            throw ApiException.badRequest("Note is too long (max 1000 characters)");
        }
        Report r = find(id);
        String st = ReportWorkflow.normalizeStatus(r.getStatus());
        addEvent(r, actor(actorId), "note", st, st, text.trim());
        reportRepository.save(r);
        return detail(id);
    }

    public void delete(String id) {
        if (!reportRepository.existsById(id)) {
            throw ApiException.notFound("Report not found");
        }
        reportRepository.deleteById(id);
    }

    public BulkResult bulk(BulkRequest req, String actorId) {
        if (req == null || req.ids() == null || req.ids().isEmpty()) {
            throw ApiException.badRequest("Select at least one report");
        }
        if (req.ids().size() > 200) {
            throw ApiException.badRequest("Too many reports selected (max 200)");
        }
        if (req.action() == null) {
            throw ApiException.badRequest("Action is required");
        }
        User actor = actor(actorId);
        int updated = 0;
        Map<String, String> failed = new LinkedHashMap<>();

        for (String id : new LinkedHashSet<>(req.ids())) {
            try {
                Report r = find(id);
                if ("assign".equalsIgnoreCase(req.action())) {
                    applyAssign(r, actor, req.assigneeId());
                } else {
                    applyStatus(r, actor, req.action(), req.note());
                }
                reportRepository.save(r);
                if (!"assign".equalsIgnoreCase(req.action())) {
                    notifyOwner(r);
                }
                updated++;
            } catch (ApiException e) {
                failed.put(id, e.getMessage());
            }
        }
        return new BulkResult(updated, failed);
    }

    // ===================================================================
    //  Dashboard statistics, hotspots, zones
    // ===================================================================

    public DashboardStats stats() {
        LocalDateTime now = LocalDateTime.now();
        List<Report> all = reportRepository.findAll();
        Ctx ctx = context(all);

        StatsCalculator.Stats s = StatsCalculator.compute(
                facts(all), now, 30, OVERDUE_DAYS);

        // latest activity across all reports
        List<ActivityItem> activity = new ArrayList<>();
        for (Report r : all) {
            if (r.getHistory() == null) {
                continue;
            }
            for (Report.HistoryEvent e : r.getHistory()) {
                activity.add(new ActivityItem(
                        r.getId(), r.getName(), e.getAt(), e.getByName(),
                        e.getAction(), e.getToStatus(), e.getNote()));
            }
        }
        activity.sort(Comparator.comparing(
                ActivityItem::at, Comparator.nullsFirst(Comparator.naturalOrder())).reversed());
        if (activity.size() > 15) {
            activity = new ArrayList<>(activity.subList(0, 15));
        }

        // reports that need someone's attention right now
        List<AdminReportView> attention = all.stream()
                .filter(r -> ReportWorkflow.isActive(r.getStatus()))
                .map(r -> toView(r, ctx, false))
                .filter(v -> "critical".equals(v.priority()) || v.overdue()
                        || ("high".equals(v.priority()) && v.assignedToId() == null))
                .sorted(Comparator
                        .comparingInt((AdminReportView v) -> -ReportWorkflow.priorityRank(v.priority()))
                        .thenComparing(Comparator.comparingLong(AdminReportView::ageHours).reversed()))
                .limit(8)
                .collect(Collectors.toList());

        List<HotspotView> hotspots = hotspots(DEFAULT_CELL_DEG, ctx, all, now).stream()
                .filter(h -> h.active() > 0)
                .limit(5)
                .collect(Collectors.toList());

        List<ZoneStat> zones = zoneStats(ctx, all, now).stream()
                .sorted(Comparator.comparingInt(ZoneStat::active).reversed())
                .limit(5)
                .collect(Collectors.toList());

        return new DashboardStats(
                s.total(), s.byStatus(), s.activeByPriority(), s.unassignedActive(),
                s.overdueActive(), s.avgResolutionHours(), s.daily(),
                activity, attention, hotspots, zones);
    }

    public List<HotspotView> hotspots(Double cellSize) {
        List<Report> all = reportRepository.findAll();
        double cell = cellSize == null || cellSize < 0.0005 || cellSize > 0.1
                ? DEFAULT_CELL_DEG : cellSize;
        return hotspots(cell, context(all), all, LocalDateTime.now());
    }

    private List<HotspotView> hotspots(
            double cell, Ctx ctx, List<Report> all, LocalDateTime now
    ) {
        List<HotspotCalculator.Hotspot> raw =
                HotspotCalculator.cluster(facts(all), cell, now);
        List<HotspotView> out = new ArrayList<>();
        for (HotspotCalculator.Hotspot h : raw) {
            Zone z = zoneFor(h.lat(), h.lon(), ctx.zones);
            out.add(new HotspotView(
                    h.lat(), h.lon(), h.total(), h.active(), h.resolved(),
                    h.criticalActive(), h.oldestActiveAgeHours(),
                    String.format(Locale.ROOT, "%.4f, %.4f", h.lat(), h.lon()),
                    z == null ? null : z.getName()));
        }
        return out;
    }

    public List<ZoneStat> zoneStats() {
        List<Report> all = reportRepository.findAll();
        return zoneStats(context(all), all, LocalDateTime.now());
    }

    private List<ZoneStat> zoneStats(Ctx ctx, List<Report> all, LocalDateTime now) {
        List<ZoneStat> out = new ArrayList<>();
        for (Zone z : ctx.zones) {
            int total = 0, active = 0, resolved = 0, rejected = 0, critical = 0;
            double ageSum = 0;
            for (Report r : all) {
                Zone owner = zoneFor(r, ctx.zones);
                if (owner == null || !owner.getId().equals(z.getId())) {
                    continue;
                }
                total++;
                String st = ReportWorkflow.normalizeStatus(r.getStatus());
                if (ReportWorkflow.isActive(st)) {
                    active++;
                    if ("critical".equals(effectivePriority(r))) {
                        critical++;
                    }
                    if (r.getCreatedAt() != null) {
                        ageSum += Math.max(Duration.between(r.getCreatedAt(), now).toHours(), 0);
                    }
                } else if (ReportWorkflow.RESOLVED.equals(st)) {
                    resolved++;
                } else {
                    rejected++;
                }
            }
            out.add(new ZoneStat(
                    z.getId(), z.getName(), z.getLatitude(), z.getLongitude(),
                    z.getRadiusMeters(), total, active, resolved, rejected, critical,
                    active == 0 ? 0 : Math.round(ageSum / active * 10.0) / 10.0,
                    z.getCreatedByName()));
        }
        out.sort(Comparator.comparing(ZoneStat::name, String.CASE_INSENSITIVE_ORDER));
        return out;
    }

    public ZoneStat createZone(ZoneRequest req, String actorId) {
        if (req == null || req.name() == null || req.name().isBlank()) {
            throw ApiException.badRequest("Zone name is required");
        }
        if (req.name().trim().length() > 80) {
            throw ApiException.badRequest("Zone name is too long");
        }
        if (!GeoUtil.isValidCoordinate(req.latitude(), req.longitude())) {
            throw ApiException.badRequest("Valid latitude and longitude are required");
        }
        double radius = req.radiusMeters() == null ? 500 : req.radiusMeters();
        if (radius < 50 || radius > 20000) {
            throw ApiException.badRequest("Radius must be between 50 m and 20 km");
        }
        boolean exists = zoneRepository.findAll().stream()
                .anyMatch(z -> z.getName().equalsIgnoreCase(req.name().trim()));
        if (exists) {
            throw ApiException.conflict("A zone with this name already exists");
        }

        Zone z = new Zone();
        z.setName(req.name().trim());
        z.setLatitude(req.latitude());
        z.setLongitude(req.longitude());
        z.setRadiusMeters(radius);
        z.setCreatedByName(actor(actorId).getName());
        Zone saved = zoneRepository.save(z);

        return zoneStats().stream()
                .filter(s -> s.id().equals(saved.getId()))
                .findFirst()
                .orElseThrow();
    }

    public void deleteZone(String id) {
        if (!zoneRepository.existsById(id)) {
            throw ApiException.notFound("Zone not found");
        }
        zoneRepository.deleteById(id);
    }

    // ===================================================================
    //  CSV export
    // ===================================================================

    public String exportCsv(Filter f, String actorId) {
        Filter all = f;
        all.page = 0;
        all.size = 200;
        StringBuilder sb = new StringBuilder();
        sb.append("id,created_at,status,priority,name,description,reporter,reporter_email,reporter_phone,")
                .append("latitude,longitude,potholes_detected,max_confidence,assigned_to,zone,")
                .append("resolved_at,resolution_note,rejection_reason\n");

        int page = 0;
        while (true) {
            all.page = page++;
            PageResult res = list(all, actorId);
            for (AdminReportView v : res.items()) {
                sb.append(csv(v.id())).append(',')
                        .append(csv(String.valueOf(v.createdAt()))).append(',')
                        .append(csv(v.status())).append(',')
                        .append(csv(v.priority())).append(',')
                        .append(csv(v.name())).append(',')
                        .append(csv(v.description())).append(',')
                        .append(csv(v.reporterName())).append(',')
                        .append(csv(v.reporterEmail())).append(',')
                        .append(csv(v.reporterPhone())).append(',')
                        .append(v.location() == null ? "" : v.location().getLatitude()).append(',')
                        .append(v.location() == null ? "" : v.location().getLongitude()).append(',')
                        .append(v.detectionCount() == null ? 0 : v.detectionCount()).append(',')
                        .append(v.maxConfidence() == null ? "" : String.format(Locale.ROOT, "%.3f", v.maxConfidence())).append(',')
                        .append(csv(v.assignedToName())).append(',')
                        .append(csv(v.zoneName())).append(',')
                        .append(csv(v.resolvedAt() == null ? "" : v.resolvedAt().toString())).append(',')
                        .append(csv(v.resolutionNote())).append(',')
                        .append(csv(v.rejectionReason())).append('\n');
            }
            if ((long) (res.page() + 1) * res.size() >= res.total()) {
                break;
            }
        }
        return sb.toString();
    }

    /** Quotes a cell and neutralises spreadsheet formula injection (=, +, -, @). */
    private static String csv(String value) {
        String v = value == null ? "" : value;
        if (!v.isEmpty() && "=+-@\t\r".indexOf(v.charAt(0)) >= 0) {
            v = "'" + v;
        }
        return "\"" + v.replace("\"", "\"\"") + "\"";
    }

    // ===================================================================
    //  Staff
    // ===================================================================

    public List<StaffView> staff() {
        List<Report> all = reportRepository.findAll();
        Map<String, Long> load = all.stream()
                .filter(r -> r.getAssignedToId() != null
                        && ReportWorkflow.isActive(r.getStatus()))
                .collect(Collectors.groupingBy(Report::getAssignedToId, Collectors.counting()));

        return userRepository.findByRole("admin").stream()
                .filter(u -> StaffPolicy.isAdmin(u.getRole(), u.getEmail()))
                .map(u -> new StaffView(
                        u.getId(), u.getName(), u.getEmail(),
                        load.getOrDefault(u.getId(), 0L).intValue()))
                .sorted(Comparator.comparing(StaffView::name, String.CASE_INSENSITIVE_ORDER))
                .collect(Collectors.toList());
    }

    public StaffView createStaff(StaffRequest req) {
        if (req == null || req.name() == null || req.name().isBlank()) {
            throw ApiException.badRequest("Name is required");
        }
        String email = req.email() == null ? "" : req.email().trim().toLowerCase();
        if (!StaffPolicy.isStaffEmail(email)) {
            throw ApiException.badRequest(
                    "Staff accounts must use a " + StaffPolicy.STAFF_DOMAIN + " email");
        }
        if (!email.matches("^[a-z0-9._%+-]+@safepath\\.com$")) {
            throw ApiException.badRequest("Invalid email address");
        }
        if (req.password() == null || req.password().length() < 8) {
            throw ApiException.badRequest("Password must be at least 8 characters");
        }
        if (userRepository.findByEmail(email).isPresent()) {
            throw ApiException.conflict("This email is already registered");
        }

        User u = new User();
        u.setName(req.name().trim());
        u.setEmail(email);
        u.setPassword(passwordEncoder.encode(req.password()));
        u.setRole("admin");
        User saved = userRepository.save(u);
        return new StaffView(saved.getId(), saved.getName(), saved.getEmail(), 0);
    }

    public void changePassword(String actorId, PasswordRequest req) {
        User u = actor(actorId);
        if (req == null || req.currentPassword() == null || req.newPassword() == null) {
            throw ApiException.badRequest("Current and new password are required");
        }
        if (!passwordEncoder.matches(req.currentPassword(), u.getPassword())) {
            throw ApiException.badRequest("Current password is incorrect");
        }
        if (req.newPassword().length() < 8) {
            throw ApiException.badRequest("New password must be at least 8 characters");
        }
        u.setPassword(passwordEncoder.encode(req.newPassword()));
        userRepository.save(u);
    }

    public MeView me(String actorId) {
        User u = actor(actorId);
        return new MeView(u.getId(), u.getName(), u.getEmail(),
                StaffPolicy.effectiveRole(u.getRole(), u.getEmail()));
    }

    // ===================================================================
    //  Helpers
    // ===================================================================

    private Report find(String id) {
        return reportRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Report not found"));
    }

    private User actor(String actorId) {
        return userRepository.findById(actorId)
                .orElseThrow(() -> ApiException.unauthorized("Unknown user"));
    }

    private void addEvent(
            Report r, User actor, String action, String from, String to, String note
    ) {
        if (r.getHistory() == null) {
            r.setHistory(new ArrayList<>());
        }
        r.getHistory().add(new Report.HistoryEvent(
                LocalDateTime.now(), actor.getId(), actor.getName(),
                action, from, to, note == null || note.isBlank() ? null : note));
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    private static String effectivePriority(Report r) {
        if (r.getPriority() != null) {
            return r.getPriority();
        }
        List<Report.Detection> d = r.getDetections() == null ? List.of() : r.getDetections();
        Double max = r.getMaxConfidence() != null ? r.getMaxConfidence()
                : d.stream().map(Report.Detection::getConfidenceScore)
                        .filter(Objects::nonNull).max(Double::compare).orElse(null);
        return ReportWorkflow.computePriority(
                r.getDetectionCount() != null ? r.getDetectionCount() : d.size(), max);
    }

    private List<ReportFacts> facts(List<Report> reports) {
        List<ReportFacts> out = new ArrayList<>();
        for (Report r : reports) {
            if (r.getLocation() == null || r.getLocation().getLatitude() == null
                    || r.getLocation().getLongitude() == null) {
                continue;
            }
            out.add(new ReportFacts(
                    r.getId(),
                    r.getLocation().getLatitude(),
                    r.getLocation().getLongitude(),
                    ReportWorkflow.normalizeStatus(r.getStatus()),
                    effectivePriority(r),
                    r.getCreatedAt(),
                    r.getResolvedAt(),
                    r.getAssignedToId() != null));
        }
        return out;
    }

    private Zone zoneFor(Report r, List<Zone> zones) {
        if (r.getLocation() == null || r.getLocation().getLatitude() == null
                || r.getLocation().getLongitude() == null) {
            return null;
        }
        return zoneFor(r.getLocation().getLatitude(), r.getLocation().getLongitude(), zones);
    }

    /** Nearest zone whose circle contains the point, or null. */
    private Zone zoneFor(double lat, double lon, List<Zone> zones) {
        Zone best = null;
        double bestDist = Double.MAX_VALUE;
        for (Zone z : zones) {
            if (z.getLatitude() == null || z.getLongitude() == null || z.getRadiusMeters() == null) {
                continue;
            }
            double d = GeoUtil.haversineMeters(lat, lon, z.getLatitude(), z.getLongitude());
            if (d <= z.getRadiusMeters() && d < bestDist) {
                best = z;
                bestDist = d;
            }
        }
        return best;
    }

    private AdminReportView toView(Report r, Ctx ctx, boolean withHistory) {
        User reporter = r.getUserId() == null ? null : ctx.users.get(r.getUserId());
        Zone zone = zoneFor(r, ctx.zones);
        String status = ReportWorkflow.normalizeStatus(r.getStatus());
        List<Report.Detection> detections =
                r.getDetections() == null ? List.of() : r.getDetections();

        Double max = r.getMaxConfidence();
        if (max == null) {
            max = detections.stream().map(Report.Detection::getConfidenceScore)
                    .filter(Objects::nonNull).max(Double::compare).orElse(null);
        }
        Double avg = r.getAvgConfidence();
        if (avg == null && !detections.isEmpty()) {
            avg = detections.stream().map(Report.Detection::getConfidenceScore)
                    .filter(Objects::nonNull).mapToDouble(Double::doubleValue)
                    .average().orElse(0.0);
        }

        LocalDateTime now = LocalDateTime.now();
        boolean active = ReportWorkflow.isActive(status);
        long ageHours = r.getCreatedAt() == null ? 0
                : Math.max(Duration.between(
                        r.getCreatedAt(), active || r.getResolvedAt() == null ? now : r.getResolvedAt()
                ).toHours(), 0);
        boolean overdue = active && r.getCreatedAt() != null
                && r.getCreatedAt().isBefore(now.minusDays(OVERDUE_DAYS));

        return new AdminReportView(
                r.getId(), r.getName(), r.getDescription(), r.getPhoto(), r.getLocation(),
                r.getUserId(),
                reporter == null ? "Deleted user" : reporter.getName(),
                reporter == null ? null : reporter.getEmail(),
                reporter == null ? null : reporter.getPhone(),
                status, effectivePriority(r),
                r.getAssignedToId(), r.getAssignedToName(),
                zone == null ? null : zone.getId(),
                zone == null ? null : zone.getName(),
                r.getDetectionCount() != null ? r.getDetectionCount() : detections.size(),
                max, avg, detections,
                r.getResolutionNote(), r.getRejectionReason(),
                r.getResolvedByName(), r.getResolvedAt(),
                r.getCreatedAt(), r.getUpdatedAt(),
                ageHours, overdue,
                withHistory ? (r.getHistory() == null ? List.of() : r.getHistory()) : null,
                null);
    }
}
