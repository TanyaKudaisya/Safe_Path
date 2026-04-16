import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  StyleSheet,
  Image,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import axios from "axios";
import { API_BASE_URL } from "@/services/Api";

interface Pothole {
  _id: string;
  name: string;
  description: string;
  photo: string;
  location: {
    latitude: number;
    longitude: number;
  };
}

const NearbyPotholesScreen = () => {
  const [currentLocation, setCurrentLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPothole, setSelectedPothole] = useState<any>(null);
  const [mapType, setMapType] = useState<"standard" | "satellite">("standard");
  const [potholes, setPotholes] = useState<Pothole[]>([]);

  useEffect(() => {
    const fetchPotholes = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/report`);
        const potholes = response.data
          .filter((pothole: any) => pothole.detections.length > 0)
          .map((pothole: any) => ({
            _id: pothole._id,
            name: pothole.name,
            description: pothole.description,
            photo: pothole.photo,
            location: pothole.location,
          }));

        setPotholes(potholes);
      } catch (error) {
        console.error("Error fetching potholes:", error);
      }
    };

    fetchPotholes();
  }, []);

  useEffect(() => {
    checkGPSAndFetchLocation();
  }, []);

  // Function to check GPS and fetch location
  const checkGPSAndFetchLocation = async () => {
    setIsLoading(true);

    const isGPSEnabled = await Location.hasServicesEnabledAsync();
    if (!isGPSEnabled) {
      Alert.alert("GPS is Off", "Please enable GPS to fetch your location.");
      setIsLoading(false);
      return;
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Denied", "Location access is required.");
      setIsLoading(false);
      return;
    }

    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setCurrentLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    } catch (error) {
      Alert.alert("Error", "Failed to fetch location.");
    }

    setIsLoading(false);
  };

  return (
    <View style={styles.container}>
      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="blue" />
          <Text>Fetching location...</Text>
        </View>
      ) : (
        <>
          {/* Map View */}
          <MapView
            style={styles.map}
            mapType={mapType} // Switch between standard & satellite
            initialRegion={{
              latitude: currentLocation?.latitude || 10.9392571,
              longitude: currentLocation?.longitude || 76.9589574,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
            showsUserLocation={false}
            onPress={() => setSelectedPothole(null)} // Hide tip when tapping outside
          >
            {/* User's Current Location Marker */}
            {currentLocation && (
              <Marker
                coordinate={{
                  latitude: currentLocation.latitude,
                  longitude: currentLocation.longitude,
                }}
              >
                <View style={styles.userMarker} />
              </Marker>
            )}

            {/* Pothole Markers */}
            {potholes.map((pothole) => (
              <Marker
                key={pothole._id}
                coordinate={{
                  latitude: pothole.location.latitude,
                  longitude: pothole.location.longitude,
                }}
                pinColor="red"
                onPress={() => setSelectedPothole(pothole)}
              />
            ))}
          </MapView>

          {/* Floating Tip Card */}
          {selectedPothole && (
            <View style={styles.tipContainer}>
              <Text style={styles.tipTitle}>{selectedPothole.name}</Text>
              <Text style={styles.tipDescription}>
                {selectedPothole.description}
              </Text>
              <Image
                source={{
                  uri: `${API_BASE_URL}/${selectedPothole.photo}`,
                }}
                style={styles.tipImage}
              />
              <Text style={styles.tipWarning}>
                🚧 Be careful! This pothole was detected.
              </Text>
            </View>
          )}

          <View style={styles.buttonContainer}>
            {/* Update Location Button */}
            <TouchableOpacity
              style={styles.button}
              onPress={checkGPSAndFetchLocation}
            >
              <Text style={styles.buttonText}>Update Location</Text>
            </TouchableOpacity>

            {/* Switch Map Type Button */}
            <TouchableOpacity
              style={styles.switchButton}
              onPress={() =>
                setMapType(mapType === "standard" ? "satellite" : "standard")
              }
            >
              <Text style={styles.buttonText}>
                {mapType === "standard"
                  ? "Switch to Satellite"
                  : "Switch to Standard"}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  loaderContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  userMarker: {
    width: 15,
    height: 15,
    backgroundColor: "blue",
    borderRadius: 7.5,
    borderWidth: 2,
    borderColor: "white",
    alignSelf: "center",
  },
  tipContainer: {
    position: "absolute",
    top: 20,
    left: 20,
    right: 20,
    backgroundColor: "white",
    padding: 10,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  tipTitle: { fontWeight: "bold", fontSize: 16 },
  tipDescription: { fontSize: 14, color: "gray", marginBottom: 5 },
  tipImage: { width: "100%", height: 100, borderRadius: 5 },
  tipWarning: {
    marginTop: 5,
    fontSize: 14,
    color: "red",
    fontWeight: "bold",
  },
  button: {
    backgroundColor: "blue",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    flex: 1, // Allow buttons to grow equally
    marginRight: 10, // Add spacing between buttons
    alignItems: "center",
  },
  switchButton: {
    backgroundColor: "black",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    flex: 1, // Equal size as other button
    alignItems: "center",
  },
  buttonText: {
    color: "white",
    fontWeight: "bold",
    textAlign: "center",
  },
  buttonContainer: {
    position: "absolute",
    bottom: 20,
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

export default NearbyPotholesScreen;
