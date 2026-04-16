import React, { useState } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Text,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { AuthService } from "@/services/AuthService";
import { useSnackbar } from "@/context/SnackbarContext";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export default function SignUpScreen() {
  const router = useRouter();
  const { showSnackbar } = useSnackbar();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [passwordVisible, setPasswordVisible] = useState(false);

  const handleInputChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSignup = async () => {
    const { name, email, password } = form;
    if (!name || !email || !password) {
      showSnackbar("Please enter all fields.", "error");
      return;
    }

    try {
      await AuthService.signup(form);
      Alert.alert("Success", "Signed up successfully!");
      setForm({ name: "", email: "", password: "" });
      router.push("/");
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.error || error.message || "Signup failed";
      Alert.alert("Signup Failed", errorMessage);
    }
  };

  return (
    <View style={styles.container}>
      <MaterialCommunityIcons name="account-circle" size={80} color="#2D8CFF" />
      <Text style={styles.title}>Create an Account</Text>

      <View style={styles.inputContainer}>
        <MaterialCommunityIcons
          name="account"
          size={20}
          color="#888"
          style={styles.icon}
        />
        <TextInput
          style={styles.input}
          placeholder="Full Name"
          value={form.name}
          onChangeText={(value) => handleInputChange("name", value)}
        />
      </View>

      <View style={styles.inputContainer}>
        <MaterialCommunityIcons
          name="email"
          size={20}
          color="#888"
          style={styles.icon}
        />
        <TextInput
          style={styles.input}
          placeholder="Email"
          keyboardType="email-address"
          autoCapitalize="none"
          value={form.email}
          onChangeText={(value) => handleInputChange("email", value)}
        />
      </View>

      <View style={styles.inputContainer}>
        <MaterialCommunityIcons
          name="lock"
          size={20}
          color="#888"
          style={styles.icon}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          secureTextEntry={!passwordVisible}
          value={form.password}
          onChangeText={(value) => handleInputChange("password", value)}
        />
        <TouchableOpacity onPress={() => setPasswordVisible(!passwordVisible)}>
          <MaterialCommunityIcons
            name={passwordVisible ? "eye-off" : "eye"}
            size={20}
            color="#888"
            style={styles.icon}
          />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.signupButton} onPress={handleSignup}>
        <Text style={styles.buttonText}>Sign Up</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push("/login")}>
        <Text style={styles.loginText}>Already have an account? Log in</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#f5f7fa",
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginVertical: 20,
    color: "#333",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 12,
    marginVertical: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2, // Android shadow
  },
  input: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
    color: "#333",
  },
  icon: {
    marginRight: 5,
  },
  signupButton: {
    backgroundColor: "#2D8CFF",
    paddingVertical: 12,
    borderRadius: 10,
    width: "100%",
    alignItems: "center",
    marginTop: 20,
    shadowColor: "#2D8CFF",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    elevation: 4, // Android shadow
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
  loginText: {
    marginTop: 15,
    color: "#2D8CFF",
    fontWeight: "bold",
    fontSize: 14,
  },
});
