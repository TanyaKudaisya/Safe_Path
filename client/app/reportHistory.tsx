
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  Image,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
} from "react-native";
import { WebView } from "react-native-webview";
import { FontAwesome } from "@expo/vector-icons";
import { ReportService } from "@/services/ReportService";
import { AuthService } from "@/services/AuthService";
import { resolvePhotoUrl } from "@/services/Api";
import DetectionSummary from "@/components/DetectionSummary";

interface Report {
  id: string;
  name: string;
  description: string;
  photo?: string | null;
  location: {
    latitude: number;
    longitude: number;
  };
  status: "pending" | "in_progress" | "resolved" | "rejected";
  resolutionNote?: string | null;
  rejectionReason?: string | null;
  createdAt?: string;
  detectionCount?: number | null;
  maxConfidence?: number | null;
  avgConfidence?: number | null;
  detections?: {
    damageType: string;
    confidenceScore: number;
  }[];
}

type TabKey = "active" | "resolved" | "rejected";

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  pending: { label: "Pending review", bg: "#FFF3D6", fg: "#9A6700" },
  in_progress: { label: "In progress", bg: "#DDEBFF", fg: "#0B5BD3" },
  resolved: { label: "Resolved", bg: "#D9F5E5", fg: "#117A3E" },
  rejected: { label: "Rejected", bg: "#FDE2E2", fg: "#B42318" },
};

const tabOf = (status?: string): TabKey =>
  status === "resolved" ? "resolved" : status === "rejected" ? "rejected" : "active";

function StatusBadge({ report }: { report: Report }) {
  const meta = STATUS_META[report.status ?? "pending"] ?? STATUS_META.pending;
  const note =
    report.status === "resolved"
      ? report.resolutionNote
      : report.status === "rejected"
      ? report.rejectionReason
      : null;
  return (
    <View style={{ marginTop: 8 }}>
      <View
        style={{
          alignSelf: "flex-start",
          backgroundColor: meta.bg,
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 12,
        }}
      >
        <Text style={{ color: meta.fg, fontWeight: "700", fontSize: 12 }}>
          {meta.label}
        </Text>
      </View>
      {note ? (
        <Text style={{ color: "#555555", fontSize: 13, marginTop: 6 }}>
          {report.status === "rejected" ? "Reason: " : "Note: "}
          {note}
        </Text>
      ) : null}
    </View>
  );
}

function createMapHtml(
  latitude: number,
  longitude: number,
  title: string
) {
  const safeTitle = JSON.stringify(title);

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1"
        />
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        />
        <style>
          html, body, #map {
            height: 100%;
            width: 100%;
            margin: 0;
            padding: 0;
            background: #f2efe9;
          }

          .leaflet-container {
            background: #f2efe9;
          }
        </style>
      </head>
      <body>
        <div id="map"></div>

        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <script>
          const lat = ${latitude};
          const lng = ${longitude};
          const title = ${safeTitle};

          const map = L.map("map", {
            zoomControl: false,
            scrollWheelZoom: false,
            dragging: false,
            doubleClickZoom: false,
            touchZoom: false,
            boxZoom: false,
            keyboard: false
          }).setView([lat, lng], 16);

          L.tileLayer(
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
              maxZoom: 19,
              attribution: "&copy; OpenStreetMap contributors"
            }
          ).addTo(map);

          L.marker([lat, lng])
            .addTo(map)
            .bindPopup(title);
        </script>
      </body>
    </html>
  `;
}

export default function ReportStatusScreen() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] =
    useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("active");

  useEffect(() => {
    let mounted = true;

    const fetchReports = async () => {
      try {
        setLoading(true);
        setError(null);

        const userId = await AuthService.getUserId();

        if (!userId) {
          throw new Error("User ID not found");
        }

        const response =
          await ReportService.getReportsByUserId(userId);

        const data = Array.isArray(response.data)
          ? response.data
          : [];

        const sortedReports = [...data].sort(
          (a: Report, b: Report) =>
            (new Date(b.createdAt ?? 0).getTime() || 0) -
            (new Date(a.createdAt ?? 0).getTime() || 0)
        );

        if (mounted) {
          setReports(sortedReports);
        }
      } catch (err) {
        console.error("Failed to fetch reports:", err);

        if (mounted) {
          setError("Failed to fetch reports. Please try again.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchReports();

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1677ff" />
        <Text style={styles.loadingText}>Fetching Reports...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  const counts: Record<TabKey, number> = { active: 0, resolved: 0, rejected: 0 };
  reports.forEach((r) => {
    counts[tabOf(r.status)] += 1;
  });
  const visible = reports.filter((r) => tabOf(r.status) === tab);
  const tabs: { key: TabKey; label: string }[] = [
    { key: "active", label: "Active" },
    { key: "resolved", label: "Resolved" },
    ...(counts.rejected > 0 || tab === "rejected"
      ? [{ key: "rejected" as TabKey, label: "Rejected" }]
      : []),
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Your Reports</Text>

      <View style={{ flexDirection: "row", marginBottom: 6 }}>
        {tabs.map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setTab(t.key)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 7,
              borderRadius: 16,
              marginRight: 8,
              backgroundColor: tab === t.key ? "#1677FF" : "#EEF1F5",
            }}
          >
            <Text
              style={{
                fontWeight: "600",
                color: tab === t.key ? "#FFFFFF" : "#333333",
              }}
            >
              {t.label} ({counts[t.key]})
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {visible.length === 0 ? (
        <Text style={styles.noReportsText}>
          {reports.length === 0
            ? "No reports found."
            : tab === "resolved"
            ? "Nothing resolved yet."
            : tab === "rejected"
            ? "No rejected reports."
            : "No active reports."}
        </Text>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const detections = item.detections ?? [];
            const detected = detections.length > 0;

            const latitude = Number(item.location?.latitude);
            const longitude = Number(item.location?.longitude);

            const validLocation =
              Number.isFinite(latitude) &&
              Number.isFinite(longitude) &&
              latitude >= -90 &&
              latitude <= 90 &&
              longitude >= -180 &&
              longitude <= 180;

            return (
              <View style={styles.reportCard}>
                <View style={styles.reportHeader}>
                  <Text style={styles.reportTitle}>
                    Name: {item.name}
                  </Text>

                  <TouchableOpacity
                    onPress={() => setSelectedReport(item)}
                    accessibilityLabel="View report details"
                  >
                    <FontAwesome
                      name="info-circle"
                      size={22}
                      color="#1677ff"
                    />
                  </TouchableOpacity>
                </View>

                <Text style={styles.reportDescription}>
                  Description: {item.description}
                </Text>

                <Text style={styles.detectionStatus}>
                  Detection:{" "}
                  <Text
                    style={{
                      fontWeight: "bold",
                      color: detected ? "green" : "red",
                    }}
                  >
                    {detected ? "Detected" : "Not Detected"}
                  </Text>
                </Text>

                <StatusBadge report={item} />

                {detected && <DetectionSummary report={item} />}

                {validLocation ? (
                  <View style={styles.mapContainer}>
                    <WebView
                      style={styles.miniMap}
                      source={{
                        html: createMapHtml(
                          latitude,
                          longitude,
                          item.name
                        ),
                      }}
                      javaScriptEnabled
                      domStorageEnabled
                      originWhitelist={["*"]}
                      scrollEnabled={false}
                      onError={(event) =>
                        console.error(
                          "Report history map error:",
                          event.nativeEvent.description
                        )
                      }
                    />
                  </View>
                ) : (
                  <View style={styles.noLocation}>
                    <Text style={styles.noLocationText}>
                      Location unavailable for this report.
                    </Text>
                  </View>
                )}

                {item.photo && (
                  <TouchableOpacity
                    style={styles.detailsButton}
                    onPress={() => setSelectedReport(item)}
                  >
                    <Text style={styles.detailsButtonText}>
                      View Report Details
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
        />
      )}

      <Modal
        visible={!!selectedReport}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedReport(null)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {selectedReport?.name}
            </Text>

            <Text style={styles.modalDescription}>
              {selectedReport?.description}
            </Text>

            <Text style={styles.detectionStatus}>
              Detection:{" "}
              <Text
                style={{
                  fontWeight: "bold",
                  color:
                    (selectedReport?.detections?.length ?? 0) > 0
                      ? "green"
                      : "red",
                }}
              >
                {(selectedReport?.detections?.length ?? 0) > 0
                  ? "Detected"
                  : "Not Detected"}
              </Text>
            </Text>

            {selectedReport && <DetectionSummary report={selectedReport} />}

            {selectedReport?.photo && (
              <Image
                source={{
                  uri: resolvePhotoUrl(selectedReport.photo) ?? "",
                }}
                style={styles.modalImage}
                resizeMode="contain"
              />
            )}

            <Text style={styles.modalLocation}>
              📍{" "}
              {selectedReport?.location?.latitude ?? "N/A"},{" "}
              {selectedReport?.location?.longitude ?? "N/A"}
            </Text>

            {selectedReport && <StatusBadge report={selectedReport} />}

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setSelectedReport(null)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#FFFFFF",
  },
  header: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#222222",
  },
  listContent: {
    paddingBottom: 24,
  },
  noReportsText: {
    fontSize: 16,
    textAlign: "center",
    marginTop: 20,
    color: "#444444",
  },
  reportCard: {
    backgroundColor: "#F8F9FA",
    padding: 15,
    marginVertical: 10,
    borderRadius: 8,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  reportHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  reportTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "bold",
    color: "#333333",
    marginRight: 10,
  },
  reportDescription: {
    fontSize: 14,
    color: "#555555",
    marginTop: 5,
  },
  detectionStatus: {
    fontSize: 14,
    fontWeight: "bold",
    marginTop: 8,
    color: "#333333",
  },
  statusText: {
    fontSize: 14,
    color: "#444444",
    marginTop: 5,
  },
  detectionsContainer: {
    marginTop: 8,
    padding: 8,
    backgroundColor: "#F0F0F0",
    borderRadius: 6,
  },
  detectionsHeader: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333333",
  },
  detectionText: {
    fontSize: 12,
    color: "#555555",
    marginLeft: 5,
    marginTop: 3,
  },
  mapContainer: {
    width: "100%",
    height: 150,
    borderRadius: 8,
    marginTop: 10,
    overflow: "hidden",
    backgroundColor: "#F2EFE9",
  },
  miniMap: {
    flex: 1,
    backgroundColor: "#F2EFE9",
  },
  noLocation: {
    height: 70,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
    backgroundColor: "#EEEEEE",
    borderRadius: 8,
  },
  noLocationText: {
    color: "#666666",
    fontSize: 13,
  },
  detailsButton: {
    alignSelf: "flex-start",
    marginTop: 12,
    paddingVertical: 6,
  },
  detailsButtonText: {
    color: "#1677FF",
    fontWeight: "600",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  loadingText: {
    color: "#333333",
    marginTop: 10,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#FFFFFF",
  },
  errorText: {
    fontSize: 16,
    color: "#CC2222",
    textAlign: "center",
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    maxHeight: "85%",
    backgroundColor: "#FFFFFF",
    padding: 20,
    borderRadius: 8,
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#222222",
    textAlign: "center",
  },
  modalDescription: {
    fontSize: 14,
    color: "#555555",
    textAlign: "center",
  },
  modalImage: {
    width: "100%",
    height: 180,
    borderRadius: 8,
    marginVertical: 10,
  },
  modalLocation: {
    fontSize: 14,
    color: "#777777",
    textAlign: "center",
    marginTop: 8,
  },
  modalStatus: {
    fontSize: 14,
    color: "#444444",
    marginTop: 8,
  },
  closeButton: {
    backgroundColor: "#1677FF",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 5,
    marginTop: 16,
  },
  closeButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
  },
});
