import React, { useState, useEffect } from "react";
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
} from "react-native";

import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";

import { ReportService } from "@/services/ReportService";
import { AuthService } from "@/services/AuthService";
import { useRouter } from "expo-router";

// ✅ REMOVED: YOLO_API constant and checkPothole() function
// Detection is now handled entirely by the backend (ReportController.js)

export default function RegisterReportScreen() {

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);

  const [region, setRegion] = useState<any>(null);
  const [marker, setMarker] = useState<any>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const router = useRouter();

  useEffect(() => {
    (async () => {

      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        Alert.alert("Permission Denied");
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});

      setRegion({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });

      setMarker({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });

      setLoading(false);

    })();
  }, []);

  const pickImage = async () => {

    const res = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      quality: 1,
    });

    if (!res.canceled) {
      setPhoto(res.assets[0].uri);
    }
  };

  const saveReport = async () => {

    if (!name || !description) {
      Alert.alert("Error", "All fields are required!");
      return;
    }

    if (!marker) {
      Alert.alert("Location Required");
      return;
    }

    // ✅ BUG 4 FIX: Require photo before submitting
    if (!photo) {
      Alert.alert("Photo Required", "Please upload a photo of the pothole.");
      return;
    }

    setSubmitting(true);

    try {

      const userId = await AuthService.getUserId();

      if (!userId) {
        Alert.alert("Login required");
        setSubmitting(false);
        return;
      }

      // ✅ BUG 1 FIX: Removed checkPothole() call here.
      // The backend will call YOLO and handle detection automatically.

      const formData = new FormData();

      formData.append("user_id", userId);
      formData.append("name", name);
      formData.append("description", description);
      formData.append("latitude", String(marker.latitude));
      formData.append("longitude", String(marker.longitude));

      formData.append("photo", {
        uri: photo,
        name: "image.jpg",
        type: "image/jpeg",
      } as any);

      const response = await ReportService.registerReport(formData);

      console.log("REPORT RESPONSE:", response.data);

      // ✅ Check if backend detected a pothole and inform the user
      const detections = response.data?.report?.detections ?? [];

      if (detections.length === 0) {
        Alert.alert(
          "No Pothole Detected",
          "The image was submitted but no pothole was detected. Please try with a clearer photo."
        );
      } else {
        Alert.alert("Success", "Pothole report submitted successfully!", [
          { text: "OK", onPress: () => router.push("/report") },
        ]);
      }

      setName("");
      setDescription("");
      setPhoto(null);

    } catch (err) {

      console.log("REPORT ERROR:", err);
      Alert.alert("Error", "Submission failed. Please check your connection and try again.");

    } finally {

      setSubmitting(false);

    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
        <Text>Fetching Location...</Text>
      </View>
    );
  }

  return (

    <KeyboardAvoidingView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        <View style={styles.container}>

          <Text style={styles.label}>Name</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} />

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={styles.input}
            value={description}
            onChangeText={setDescription}
            multiline
          />

          <MapView style={styles.map} region={region}>
            {marker && <Marker coordinate={marker} />}
          </MapView>

          {photo && <Image source={{ uri: photo }} style={styles.image} />}

          <Button title="Pick Image" onPress={pickImage} />

          {submitting
            ? <ActivityIndicator />
            : <Button title="Submit Report" onPress={saveReport} />
          }

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({

  container: { padding: 20 },

  label: {
    fontWeight: "bold",
    marginTop: 10
  },

  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    marginTop: 5,
    borderRadius: 5,
  },

  map: {
    height: 250,
    marginVertical: 10
  },

  image: {
    width: 120,
    height: 120,
    marginVertical: 10
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },

});