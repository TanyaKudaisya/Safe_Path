import { useEffect, useState } from "react";
import { View, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { StackNavigationProp } from "@react-navigation/stack";
import * as Location from "expo-location";
import haversine from "haversine-distance"; // For calculating distance
import { IconName, RootStackParamList } from "@/types";
import { ActivityIndicator } from "@react-native-material/core";
import axios from "axios";
import { API_BASE_URL } from "@/services/Api";
import "react-native-get-random-values";

type HomeScreenNavigationProp = StackNavigationProp<RootStackParamList, "home">;

interface Pothole {
  latitude: number;
  longitude: number;
}

export default function HomeScreen() {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lon: number;
  } | null>(null);
  const [nearestPothole, setNearestPothole] = useState<{
    lat: number;
    lon: number;
    distance: number;
  } | null>(null);
  const [potholes, setPotholes] = useState<Pothole[]>([]);

  const features: {
    title: string;
    description: string;
    icon: IconName;
    onPress: () => void;
  }[] = [
    {
      title: "Report Pothole",
      description: "Upload a new pothole location.",
      icon: "camera-outline" as IconName,
      onPress: () => {
        navigation.navigate("report");
      },
    },
    {
      title: "Nearby Potholes",
      description: "View potholes near your location.",
      icon: "location-outline" as IconName,
      onPress: () => {
        navigation.navigate("nearbyPotholes");
      },
    },
    {
      title: "Realtime Detection",
      description: "Detect road damage real-time.",
      icon: "camera-outline" as IconName,
      onPress: () => {
        navigation.navigate("realtimeDetection");
      },
    },
  ];

  useEffect(() => {
    const fetchPotholes = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/report`);
        const potholes = response.data
          .filter((pothole: any) => pothole.detections.length > 0)
          .map((pothole: any) => ({
            lat: pothole.location.latitude,
            lon: pothole.location.longitude,
          }));

        setPotholes(potholes);
      } catch (error) {
        console.error("Error fetching potholes:", error);
      }
    };

    fetchPotholes();
  }, []);

  // Get User Location
  useEffect(() => {
    (async () => {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission Denied", "Location permission is required.");
          setLoading(false);
          return;
        }

        let location = await Location.getCurrentPositionAsync({});
        const userCoords = {
          lat: location.coords.latitude,
          lon: location.coords.longitude,
        };
        setUserLocation(userCoords);

        let nearest = null;
        let minDistance = Infinity;

        potholes.forEach((pothole) => {
          const distance = haversine(userCoords, pothole); // Distance in meters

          if (distance < minDistance) {
            minDistance = distance;
            nearest = { ...pothole, distance };
          }
        });

        // Only set nearestPothole if it's within 25 meters
        if (nearest && minDistance <= 25) {
          setNearestPothole(nearest);
        } else {
          setNearestPothole(null); // Hide warning if no pothole is close enough
        }
      } catch (error) {
        Alert.alert("Error", "Failed to fetch location.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const getNearestPothole = (
    userLocation: { lat: number; lon: number },
    potholes: { latitude: number; longitude: number }[]
  ) => {
    if (!userLocation || potholes.length === 0) return null;

    let nearestPothole = null;
    let minDistance = Infinity;

    potholes.forEach((pothole) => {
      const distance = haversine(userLocation, pothole); // Calculate distance in meters

      if (distance < minDistance) {
        minDistance = distance;
        nearestPothole = { ...pothole, distance };
      }
    });

    return nearestPothole;
  };

  useEffect(() => {
    if (!userLocation || potholes.length === 0) return;

    const nearest: any = getNearestPothole(userLocation, potholes);

    // Only update state if the nearest pothole actually changes
    if (
      nearest?.lat !== nearestPothole?.lat ||
      nearest?.lon !== nearestPothole?.lon
    ) {
      setNearestPothole(nearest);
    }
  }, [potholes, userLocation]);

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#2D8CFF" />
          <ThemedText style={styles.loaderText}>
            Fetching location...
          </ThemedText>
        </View>
      ) : (
        <>
          {/* Warning Banner */}
          {nearestPothole && (
            <View style={styles.warningBanner}>
              <Ionicons name="alert-circle-outline" size={24} color="red" />
              <ThemedText style={styles.warningText}>
                ⚠️ Pothole detected {nearestPothole.distance.toFixed(2)} meters
                away!
              </ThemedText>
            </View>
          )}

          {/* Header with Gradient */}
          <LinearGradient colors={["#2D8CFF", "#0044CC"]} style={styles.header}>
            <ThemedText type="title" style={styles.headerText}>
              🚧 Pothole Tracker
            </ThemedText>
          </LinearGradient>

          {/* Cards Container */}
          <View style={styles.cardContainer}>
            {features.map((feature, index) => (
              <TouchableOpacity
                key={index}
                style={styles.card}
                activeOpacity={0.8}
                onPress={feature.onPress}
              >
                <View style={styles.iconWrapper}>
                  <Ionicons name={feature.icon} size={36} color="#2D8CFF" />
                </View>
                <ThemedText type="title" style={styles.cardTitle}>
                  {feature.title}
                </ThemedText>
                <ThemedText style={styles.cardDesc}>
                  {feature.description}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F0F4F8",
  },
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loaderText: {
    marginTop: 10,
    fontSize: 16,
    color: "#2D8CFF",
  },
  warningBanner: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    height: 100,
    flexDirection: "row",
    backgroundColor: "#FFC107",
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  warningText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#D32F2F",
    marginLeft: 5,
  },
  header: {
    paddingTop: 45,
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    elevation: 6,
  },
  headerText: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFF",
  },
  cardContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-around",
    padding: 15,
  },
  card: {
    width: "100%",
    height: 200,
    padding: 16,
    marginVertical: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  iconWrapper: {
    width: 55,
    height: 55,
    borderRadius: 55 / 2,
    backgroundColor: "#E3F2FD",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  cardDesc: {
    fontSize: 13,
    textAlign: "center",
    marginTop: 5,
    color: "#555",
  },
});
