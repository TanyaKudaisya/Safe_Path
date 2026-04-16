import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
} from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { AuthService } from "@/services/AuthService";

export default function ProfileScreen() {
  const [userData, setUserData] = useState<{
    name: string;
    email: string;
    avatar?: string;
  }>({
    name: "",
    email: "",
    avatar: "",
  });
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    loadUserProfile();
  }, []);

  // Fetch user data from AsyncStorage
  const loadUserProfile = async () => {
    try {
      const storedData = await AsyncStorage.getItem("user");
      if (storedData) {
        setUserData(JSON.parse(storedData));
      }
    } catch (error) {
      console.log("Error loading profile:", error);
    } finally {
      setLoading(false);
    }
  };

  // Save updated profile
  const saveProfile = async () => {
    try {
      const token = await AuthService.getToken();

      if (!token) {
        console.error("No token found!");
        return;
      }

      const response = await AuthService.updateProfile(
        {
          name: userData.name,
          avatar: userData.avatar || "",
        },
        token
      );

      const updatedUser = response.data.user;
      await AsyncStorage.setItem("user", JSON.stringify(updatedUser));
      setUserData(updatedUser);

      setIsEditing(false);
    } catch (error) {
      console.log("Error saving profile:", error);
    }
  };

  const pickImage = async () => {
    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permissionResult.granted === false) {
      alert("Permission to access gallery is required!");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled) {
      const selectedImageUri = result.assets[0].uri;
      setUserData({ ...userData, avatar: selectedImageUri });
    }
  };

  if (loading) {
    return <ActivityIndicator size="large" color="#2D8CFF" />;
  }

  return (
    <View style={styles.container}>
      {/* Profile Image */}
      <View style={styles.profileImageContainer}>
        <Image
          source={{
            uri: userData?.avatar || "https://example.com/default-avatar.png",
          }}
          style={styles.profileImage}
        />
        {isEditing && (
          <TouchableOpacity style={styles.editIcon} onPress={pickImage}>
            <Feather name="edit-2" size={18} color="white" />
          </TouchableOpacity>
        )}
      </View>

      {/* <MaterialCommunityIcons
        name="account-circle"
        size={100}
        color="#2D8CFF"
      /> */}

      {/* Profile Details Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Profile</Text>

        {/* Name */}
        <View style={styles.field}>
          <Text style={styles.label}>Name</Text>
          {isEditing ? (
            <TextInput
              style={styles.input}
              value={userData.name}
              onChangeText={(text) => setUserData({ ...userData, name: text })}
            />
          ) : (
            <Text style={styles.text}>{userData.name || "N/A"}</Text>
          )}
        </View>

        {/* Email (Non-editable) */}
        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.text}>{userData.email || "N/A"}</Text>
        </View>

        {/* Edit & Save Button */}
        <TouchableOpacity
          style={[
            styles.button,
            { backgroundColor: isEditing ? "#27AE60" : "#3498DB" },
          ]}
          onPress={() => (isEditing ? saveProfile() : setIsEditing(true))}
        >
          <Text style={styles.buttonText}>
            {isEditing ? "Save Changes" : "Edit Profile"}
          </Text>
        </TouchableOpacity>

        {/* Logout Button */}
        <TouchableOpacity
          style={[styles.button, styles.logoutButton]}
          onPress={async () => {
            await AsyncStorage.removeItem("token");
            router.push("/login");
          }}
        >
          <Text style={styles.buttonText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "#ECF0F1",
    paddingTop: 80,
  },
  profileImageContainer: {
    position: "relative",
    marginBottom: 20,
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: "#2D8CFF",
  },
  editIcon: {
    position: "absolute",
    bottom: 5,
    right: 5,
    backgroundColor: "#3498DB",
    borderRadius: 15,
    padding: 5,
  },
  card: {
    width: "90%",
    backgroundColor: "white",
    padding: 20,
    borderRadius: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 5,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    color: "#2C3E50",
    marginBottom: 15,
  },
  field: {
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#7F8C8D",
  },
  text: {
    fontSize: 16,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#F7F9F9",
    color: "#2C3E50",
    marginTop: 5,
  },
  input: {
    fontSize: 16,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#ECF0F1",
    borderWidth: 1,
    borderColor: "#BDC3C7",
    marginTop: 5,
  },
  button: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 20,
  },
  buttonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
  logoutButton: {
    backgroundColor: "#E74C3C",
    marginTop: 10,
  },
});
