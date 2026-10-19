
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  Image,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  ActivityIndicator,
  Platform,
} from "react-native";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";

import { ReportService } from "@/services/ReportService";
import { AuthService } from "@/services/AuthService";
import { getErrorMessage } from "@/services/Api";
import { useRouter } from "expo-router";

type Coordinates = {
  latitude: number;
  longitude: number;
};

export default function RegisterReportScreen() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [marker, setMarker] = useState<Coordinates | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const webViewRef = useRef<WebView>(null);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    const initializeLocation = async () => {
      try {
        const { status } =
          await Location.requestForegroundPermissionsAsync();

        if (status !== "granted") {
          Alert.alert(
            "Permission Denied",
            "Location permission is required to select the report location."
          );
          return;
        }

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (!mounted) return;

        setMarker({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
      } catch (error) {
        console.error("Location error:", error);
        Alert.alert(
          "Location unavailable",
          "Could not fetch GPS location. You can still select a location by tapping the map."
        );

        // Fallback map location: GL Bajaj / Greater Noida area.
        if (mounted) {
          setMarker({ latitude: 28.4595, longitude: 77.0266 });
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initializeLocation();

    return () => {
      mounted = false;
    };
  }, []);

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 1,
    });

    if (!res.canceled) {
      setPhoto(res.assets[0].uri);
    }
  };

  const saveReport = async () => {
    if (!name.trim() || !description.trim()) {
      Alert.alert("Error", "All fields are required!");
      return;
    }

    if (!marker) {
      Alert.alert("Location Required", "Please select a location on the map.");
      return;
    }

    if (!photo) {
      Alert.alert("Photo Required", "Please upload a photo of the pothole.");
      return;
    }

    setSubmitting(true);

    try {
      const userId = await AuthService.getUserId();

      if (!userId) {
        Alert.alert("Login required", "Please log in again.");
        return;
      }

      const formData = new FormData();

      formData.append("name", name.trim());
      formData.append("description", description.trim());
      formData.append("latitude", String(marker.latitude));
      formData.append("longitude", String(marker.longitude));

      const filename = photo.split("/").pop() || "pothole.jpg";
      const extension = filename.split(".").pop()?.toLowerCase();
      const mimeType =
        extension === "png"
          ? "image/png"
          : extension === "webp"
            ? "image/webp"
            : "image/jpeg";

      formData.append(
        "photo",
        {
          uri: photo,
          name: filename,
          type: mimeType,
        } as any
      );

      const response = await ReportService.registerReport(formData);
      console.log("REPORT RESPONSE:", response.data);

      const detections = response.data?.detections ?? [];

      if (detections.length === 0) {
        Alert.alert(
          "No Pothole Detected",
          "The image was submitted, but no pothole was detected. Try a clearer photo."
        );
      } else {
        Alert.alert("Success", "Pothole report submitted successfully!", [
          { text: "OK", onPress: () => router.push("/report") },
        ]);
      }

      setName("");
      setDescription("");
      setPhoto(null);
    } catch (err: any) {
      console.error("REPORT ERROR:", err);
      Alert.alert(
        "Error",
        getErrorMessage(
          err,
          "Submission failed. Please check your connection and try again."
        )
      );
    } finally {
      setSubmitting(false);
    }
  };

  const mapHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
      <style>
        html, body, #map { height:100%; width:100%; margin:0; padding:0; }
        .location-label { font: 14px Arial; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <script>
        const initial = ${JSON.stringify(
          marker ?? { latitude: 28.4595, longitude: 77.0266 }
        )};

        const map = L.map('map').setView(
          [initial.latitude, initial.longitude],
          16
        );

        L.tileLayer(
          'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
          {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors'
          }
        ).addTo(map);

        let pin = L.marker(
          [initial.latitude, initial.longitude],
          { draggable: true }
        ).addTo(map);

        function sendLocation(lat, lng) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'location',
            latitude: lat,
            longitude: lng
          }));
        }

        pin.on('dragend', function() {
          const p = pin.getLatLng();
          sendLocation(p.lat, p.lng);
        });

        map.on('click', function(event) {
          pin.setLatLng(event.latlng);
          sendLocation(event.latlng.lat, event.latlng.lng);
        });

        function setLocation(lat, lng) {
          pin.setLatLng([lat, lng]);
          map.setView([lat, lng], 16);
        }

        document.addEventListener('message', function(event) {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'setLocation') {
              setLocation(data.latitude, data.longitude);
            }
          } catch(e) {}
        });

        window.addEventListener('message', function(event) {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'setLocation') {
              setLocation(data.latitude, data.longitude);
            }
          } catch(e) {}
        });

        sendLocation(initial.latitude, initial.longitude);
        window.ReactNativeWebView.postMessage('map-ready');
      </script>
    </body>
    </html>
  `;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.container}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Pothole near college gate"
          />

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.descriptionInput]}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe the pothole"
            multiline
          />

          <Text style={styles.label}>Select Pothole Location</Text>
          <Text style={styles.helper}>
            Tap the map or drag the marker to adjust the location.
          </Text>

          <View style={styles.mapContainer}>
            <WebView
              ref={webViewRef}
              style={styles.map}
              source={{ html: mapHtml }}
              javaScriptEnabled
              domStorageEnabled
              originWhitelist={["*"]}
              onMessage={(event) => {
                const value = event.nativeEvent.data;

                if (value === "map-ready") {
                  setMapReady(true);
                  return;
                }

                try {
                  const data = JSON.parse(value);
                  if (
                    data.type === "location" &&
                    Number.isFinite(data.latitude) &&
                    Number.isFinite(data.longitude)
                  ) {
                    setMarker({
                      latitude: data.latitude,
                      longitude: data.longitude,
                    });
                  }
                } catch {
                  // Ignore non-JSON WebView messages.
                }
              }}
              onError={(event) => {
                console.error(
                  "Register map error:",
                  event.nativeEvent.description
                );
              }}
            />

            {!mapReady && (
              <View style={styles.mapLoading}>
                <ActivityIndicator size="small" color="#1677ff" />
                <Text>Loading map...</Text>
              </View>
            )}
          </View>

          {marker && (
            <Text style={styles.coordinates}>
              Selected: {marker.latitude.toFixed(6)},{" "}
              {marker.longitude.toFixed(6)}
            </Text>
          )}

          {photo && (
            <Image source={{ uri: photo }} style={styles.image} />
          )}

          <View style={styles.actionButton}>
            <Button title="Pick Image" onPress={pickImage} />
          </View>

          <View style={styles.actionButton}>
            {submitting ? (
              <ActivityIndicator size="large" />
            ) : (
              <Button title="Submit Report" onPress={saveReport} />
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}


const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  scrollContent: {
    paddingBottom: 24,
    backgroundColor: "#FFFFFF",
    flexGrow: 1,
  },
  container: {
    padding: 20,
    backgroundColor: "#FFFFFF",
  },
  label: {
    fontWeight: "bold",
    marginTop: 10,
    color: "#222222",
  },
  helper: {
    color: "#666666",
    fontSize: 13,
    marginTop: 4,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#CCCCCC",
    padding: 10,
    marginTop: 5,
    borderRadius: 5,
    color: "#222222",
    backgroundColor: "#FFFFFF",
  },
  descriptionInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  mapContainer: {
    height: 280,
    marginVertical: 10,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#EEEEEE",
  },
  map: { flex: 1 },
  mapLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  coordinates: {
    color: "#444444",
    fontSize: 12,
    marginBottom: 8,
  },
  image: {
    width: 120,
    height: 120,
    marginVertical: 10,
    borderRadius: 6,
  },
  actionButton: { marginTop: 12 },
});
