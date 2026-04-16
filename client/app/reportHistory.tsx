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
import MapView, { Marker } from "react-native-maps";
import { FontAwesome } from "@expo/vector-icons";
import { ReportService } from "@/services/ReportService";
import { AuthService } from "@/services/AuthService";
import { STATIC_FILES_URL } from "@/services/Api";
import * as Location from "expo-location";

interface Report {
  _id: string;
  name: string;
  description: string;
  photo?: string | null;
  location: {
    latitude: number;
    longitude: number;
  };
  status: "Approved" | "Pending";
  detections?: {
    damage_type: string;
    confidence_score: number;
    _id: string;
  }[];
}

export default function ReportStatusScreen() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        setLoading(true);
        const userId = await AuthService.getUserId();
        if (!userId) {
          throw new Error("User ID not found");
        }
        const response = await ReportService.getReportsByUserId(userId);
        const sortedReports = response.data.sort(
          (a: { createdAt: string }, b: { createdAt: string }) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        console.log(sortedReports);
        setReports(sortedReports);
      } catch (err) {
        console.log(err);
        setError("Failed to fetch reports. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, []);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError("Permission to access location was denied");
        return;
      }
    })();
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="blue" />
        <Text>Fetching Reports...</Text>
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

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Your Reports</Text>

      {reports.length === 0 ? (
        <Text style={styles.noReportsText}>No reports found.</Text>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <View key={item._id} style={styles.reportCard}>
              <View style={styles.reportHeader}>
                <Text style={styles.reportTitle}>Name: {item.name}</Text>
                <TouchableOpacity onPress={() => setSelectedReport(item)}>
                  <FontAwesome name="info-circle" size={22} color="blue" />
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
                    color: (item.detections?.length ?? 0) > 0 ? "green" : "red",
                  }}
                >
                  {(item.detections?.length ?? 0) > 0
                    ? "Detected"
                    : "Not Detected"}
                </Text>
              </Text>

              {item.detections && item.detections.length > 0 && (
                <View style={styles.detectionsContainer}>
                  <Text style={styles.detectionsHeader}>Detections:</Text>
                  {item.detections.map((detection) => (
                    <Text key={detection._id} style={styles.detectionText}>
                      • {detection.damage_type} (Confidence:{" "}
                      {(detection.confidence_score * 100).toFixed(2)}%)
                    </Text>
                  ))}
                </View>
              )}

              <MapView
                style={styles.miniMap}
                initialRegion={{
                  latitude: item.location?.latitude ?? 0, // Default to 0 if undefined
                  longitude: item.location?.longitude ?? 0,
                  latitudeDelta: 0.005,
                  longitudeDelta: 0.005,
                }}
                region={{
                  latitude: item.location?.latitude ?? 0, // Default to 0 if undefined
                  longitude: item.location?.longitude ?? 0,
                  latitudeDelta: 0.005,
                  longitudeDelta: 0.005,
                }}
              >
                {item.location?.latitude && item.location?.longitude && (
                  <Marker
                    coordinate={{
                      latitude: item.location.latitude,
                      longitude: item.location.longitude,
                    }}
                    title={item.name}
                    pinColor="red"
                  />
                )}
              </MapView>
            </View>
          )}
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
            <Text style={styles.modalTitle}>{selectedReport?.name}</Text>
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

            {selectedReport?.detections &&
              selectedReport?.detections.length > 0 && (
                <View style={styles.detectionsContainer}>
                  <Text style={styles.detectionsHeader}>Detections:</Text>
                  {selectedReport?.detections.map((detection) => (
                    <Text key={detection._id} style={styles.detectionText}>
                      • {detection.damage_type} (Confidence:{" "}
                      {(detection.confidence_score * 100).toFixed(2)}%)
                    </Text>
                  ))}
                </View>
              )}
            {selectedReport?.photo && (
              <Image
                source={{
                  uri: `${STATIC_FILES_URL}${selectedReport.photo}`,
                }}
                style={styles.modalImage}
              />
            )}
            <Text style={styles.modalLocation}>
              📍 {selectedReport?.location.latitude},{" "}
              {selectedReport?.location.longitude}
            </Text>
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

// Styles
const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#fff" },
  header: { fontSize: 22, fontWeight: "bold", marginBottom: 10 },
  noReportsText: { fontSize: 16, textAlign: "center", marginTop: 20 },

  reportCard: {
    backgroundColor: "#f8f9fa",
    padding: 15,
    marginVertical: 10,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  reportHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  reportTitle: { fontSize: 18, fontWeight: "bold", color: "#333" },
  reportDescription: { fontSize: 14, color: "#555", marginTop: 5 },
  reportStatus: { fontSize: 14, fontWeight: "bold", marginTop: 5 },
  detectionStatus: { fontSize: 14, fontWeight: "bold", marginTop: 5 },

  miniMap: {
    width: "100%",
    height: 150,
    borderRadius: 8,
    marginTop: 10,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    fontSize: 16,
    color: "red",
  },
  detectionsContainer: {
    marginTop: 8,
    padding: 8,
    backgroundColor: "#f0f0f0",
    borderRadius: 6,
  },
  detectionsHeader: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333",
  },
  detectionText: {
    fontSize: 12,
    color: "#555",
    marginLeft: 5,
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalContent: {
    width: "80%",
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 8,
    alignItems: "center",
  },
  modalTitle: { fontSize: 20, fontWeight: "bold", marginBottom: 10 },
  modalDescription: { fontSize: 14, color: "#555", textAlign: "center" },
  modalStatus: { fontSize: 16, fontWeight: "bold", marginVertical: 5 },
  modalImage: {
    width: "100%",
    height: 150,
    borderRadius: 8,
    marginVertical: 10,
  },
  modalLocation: { fontSize: 14, color: "#777", textAlign: "center" },
  closeButton: {
    backgroundColor: "red",
    padding: 10,
    borderRadius: 5,
    marginTop: 10,
  },
  closeButtonText: { color: "white", fontWeight: "bold" },
});
