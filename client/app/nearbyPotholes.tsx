import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import { ReportService } from "@/services/ReportService";

interface Pothole {
  id: string;
  name: string;
  description: string;
  photo?: string | null;
  location: {
    latitude: number;
    longitude: number;
  };
  maxConfidence?: number | null;
  detections?: {
    damageType: string;
    confidenceScore: number;
  }[] | null;
}

const NearbyPotholesScreen = () => {
  const webViewRef = useRef<WebView>(null);
  const [currentLocation, setCurrentLocation] =
    useState<{ latitude: number; longitude: number } | null>(null);
  const [potholes, setPotholes] = useState<Pothole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [mapType, setMapType] = useState<"street" | "satellite">("street");

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      try {
        const [reports, locationResult] = await Promise.allSettled([
          ReportService.getAllReports(),
          getLocation(),
        ]);

        if (!mounted) return;

        if (reports.status === "fulfilled") {
          const data = reports.value;
          const list = Array.isArray(data) ? data : data?.content ?? [];

          const detected = list.filter((report: Pothole) => {
            const lat = Number(report.location?.latitude);
            const lng = Number(report.location?.longitude);

            return (
              Array.isArray(report.detections) &&
              report.detections.length > 0 &&
              Number.isFinite(lat) &&
              Number.isFinite(lng) &&
              lat >= -90 &&
              lat <= 90 &&
              lng >= -180 &&
              lng <= 180
            );
          });

          setPotholes(detected);
        } else {
          console.error("Failed to fetch reports:", reports.reason);
          Alert.alert(
            "Reports unavailable",
            "The map can still load, but pothole reports could not be fetched."
          );
        }

        if (locationResult.status === "fulfilled") {
          setCurrentLocation(locationResult.value);
        }
      } catch (error) {
        console.error("Nearby map initialization error:", error);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    initialize();

    return () => {
      mounted = false;
    };
  }, []);

  const getLocation = async () => {
    const enabled = await Location.hasServicesEnabledAsync();

    if (!enabled) {
      throw new Error("GPS is disabled");
    }

    const permission = await Location.requestForegroundPermissionsAsync();

    if (permission.status !== "granted") {
      throw new Error("Location permission denied");
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
  };

  const updateLocation = async () => {
    try {
      const location = await getLocation();

      setCurrentLocation(location);

      webViewRef.current?.postMessage(
        JSON.stringify({
          type: "recenter",
          location,
        })
      );
    } catch {
      Alert.alert(
        "Location unavailable",
        "Enable GPS and grant location permission to update your location."
      );
    }
  };

  const mapHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
      <style>
        html, body, #map { height: 100%; width: 100%; margin: 0; padding: 0; }
        .leaflet-popup-content { min-width: 160px; }
        .report-photo { width: 100%; max-height: 110px; object-fit: cover; border-radius: 6px; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <script>
        const reports = ${JSON.stringify(
    potholes.map((p) => ({
      id: p.id,
      name: p.name || "Detected pothole",
      description: p.description || "",
      photo: p.photo || "",
      latitude: p.location.latitude,
      longitude: p.location.longitude,
      confidence:
        p.maxConfidence ??
        (p.detections?.length
          ? Math.max(...p.detections.map((d) => d.confidenceScore))
          : null),
    }))
  )};

        const currentLocation = ${JSON.stringify(currentLocation)};
        const map = L.map('map').setView(
          currentLocation
            ? [currentLocation.latitude, currentLocation.longitude]
            : [28.4595, 77.0266],
          14
        );

        const streetLayer = L.tileLayer(
          'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
          {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors'
          }
        );

        const satelliteLayer = L.tileLayer(
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          {
            maxZoom: 19,
            attribution: 'Tiles &copy; Esri'
          }
        );

        streetLayer.addTo(map);

        if (currentLocation) {
          L.circleMarker(
            [currentLocation.latitude, currentLocation.longitude],
            {
              radius: 8,
              color: '#ffffff',
              weight: 3,
              fillColor: '#1677ff',
              fillOpacity: 1
            }
          ).addTo(map).bindPopup('Your current location');
        }

        reports.forEach((report) => {
          const marker = L.marker([report.latitude, report.longitude]).addTo(map);

          const photo = report.photo && /^https?:\\/\\//i.test(report.photo)
            ? '<img class="report-photo" src="' + report.photo.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '" />'
            : '';

          const confidence = report.confidence !== null
            ? '<p>Highest confidence: ' + (report.confidence * 100).toFixed(1) + '%</p>'
            : '';

          marker.bindPopup(
            '<b>' + String(report.name).replace(/</g, '&lt;') + '</b>' +
            '<p>' + String(report.description).replace(/</g, '&lt;') + '</p>' +
            photo + confidence
          );
        });

        if (reports.length > 0) {
          const points = reports.map(r => [r.latitude, r.longitude]);
          if (currentLocation) {
            points.push([currentLocation.latitude, currentLocation.longitude]);
          }
          map.fitBounds(points, { padding: [35, 35], maxZoom: 15 });
        }

        window.setMapType = function(type) {
          if (type === 'satellite') {
            if (map.hasLayer(streetLayer)) map.removeLayer(streetLayer);
            satelliteLayer.addTo(map);
          } else {
            if (map.hasLayer(satelliteLayer)) map.removeLayer(satelliteLayer);
            streetLayer.addTo(map);
          }
        };

        document.addEventListener('message', function(event) {
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'mapType') {
              window.setMapType(message.value);
            }
            if (message.type === 'recenter' && message.location) {
              map.setView(
                [message.location.latitude, message.location.longitude],
                15
              );
            }
          } catch (e) {}
        });

        window.addEventListener('message', function(event) {
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'mapType') {
              window.setMapType(message.value);
            }
            if (message.type === 'recenter' && message.location) {
              map.setView(
                [message.location.latitude, message.location.longitude],
                15
              );
            }
          } catch (e) {}
        });

        window.ReactNativeWebView?.postMessage('map-ready');
      </script>
    </body>
    </html>
  `;

  return (
    <View style={styles.container}>
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#1677ff" />
          <Text style={styles.loadingText}>Loading nearby potholes...</Text>
        </View>
      )}

      <WebView
        ref={webViewRef}
        style={styles.map}
        source={{ html: mapHtml }}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={["*"]}
        onMessage={(event) => {
          if (event.nativeEvent.data === "map-ready") {
            setMapReady(true);
          }
        }}
        onError={(event) => {
          console.error("Map WebView error:", event.nativeEvent.description);
        }}
      />

      {!isLoading && !mapReady && (
        <View style={styles.mapMessage}>
          <Text>Map is taking longer to load. Check your internet connection.</Text>
        </View>
      )}

      <View style={styles.infoBadge}>
        <Text style={styles.infoText}>
          {potholes.length} detected pothole{potholes.length === 1 ? "" : "s"}
        </Text>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.button} onPress={updateLocation}>
          <Text style={styles.buttonText}>Update Location</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.switchButton}
          onPress={() => {
            const next = mapType === "street" ? "satellite" : "street";

            setMapType(next);

            webViewRef.current?.postMessage(
              JSON.stringify({
                type: "mapType",
                value: next,
              })
            );
          }}
        >
          <Text style={styles.buttonText}>
            {mapType === "street" ? "Satellite" : "Street Map"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f2f2f2" },
  map: { flex: 1, backgroundColor: "#f2f2f2" },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  loadingText: { marginTop: 10, color: "#333333" },
  mapMessage: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    backgroundColor: "#fff4d6",
    padding: 10,
    borderRadius: 8,
  },
  infoBadge: {
    position: "absolute",
    top: 12,
    alignSelf: "center",
    backgroundColor: "white",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    elevation: 4,
  },
  infoText: { fontWeight: "600", color: "#222222" },
  buttonContainer: {
    position: "absolute",
    bottom: 20,
    left: 16,
    right: 16,
    flexDirection: "row",
    gap: 10,
  },
  button: {
    flex: 1,
    backgroundColor: "#1677ff",
    paddingVertical: 12,
    borderRadius: 22,
    alignItems: "center",
  },
  switchButton: {
    flex: 1,
    backgroundColor: "#222222",
    paddingVertical: 12,
    borderRadius: 22,
    alignItems: "center",
  },
  buttonText: { color: "white", fontWeight: "600" },
});

export default NearbyPotholesScreen;
