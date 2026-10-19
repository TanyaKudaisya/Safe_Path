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
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { AuthService } from "@/services/AuthService";
import { getErrorMessage } from "@/services/Api";
import { useSnackbar } from "@/context/SnackbarContext";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { showSnackbar } = useSnackbar();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    const clean = email.trim().toLowerCase();
    if (!clean) {
      showSnackbar("Please enter your email.", "error");
      return;
    }
    setBusy(true);
    try {
      await AuthService.forgotPassword(clean);
      setEmail(clean);
      setStep("code");
      showSnackbar("If that email is registered, a code is on its way.", "success");
    } catch (error: any) {
      showSnackbar(getErrorMessage(error, "Could not send the code."), "error");
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async () => {
    if (!/^\d{6}$/.test(code.trim())) {
      showSnackbar("Enter the 6-digit code from the email.", "error");
      return;
    }
    if (newPassword.length < 8) {
      showSnackbar("Password must be at least 8 characters.", "error");
      return;
    }
    setBusy(true);
    try {
      await AuthService.resetPassword({
        email,
        code: code.trim(),
        newPassword,
      });
      Alert.alert("Password changed", "You can now log in with your new password.");
      router.replace("/login");
    } catch (error: any) {
      showSnackbar(getErrorMessage(error, "Could not reset the password."), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <MaterialCommunityIcons name="lock-reset" size={80} color="#2D8CFF" />
      <Text style={styles.title}>Reset password</Text>

      {step === "email" ? (
        <>
          <Text style={styles.hint}>
            Enter your account email and we will send you a 6-digit code.
          </Text>
          <View style={styles.inputContainer}>
            <MaterialCommunityIcons name="email" size={20} color="#888" style={styles.icon} />
            <TextInput
              style={styles.input}
              placeholder="Email"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
          </View>
          <TouchableOpacity
            style={[styles.button, busy && styles.disabled]}
            onPress={sendCode}
            disabled={busy}
          >
            <Text style={styles.buttonText}>{busy ? "Sending..." : "Send code"}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.hint}>
            We sent a code to {email}. It is valid for 15 minutes.
          </Text>
          <View style={styles.inputContainer}>
            <MaterialCommunityIcons name="numeric" size={20} color="#888" style={styles.icon} />
            <TextInput
              style={styles.input}
              placeholder="6-digit code"
              keyboardType="number-pad"
              maxLength={6}
              value={code}
              onChangeText={setCode}
            />
          </View>
          <View style={styles.inputContainer}>
            <MaterialCommunityIcons name="lock" size={20} color="#888" style={styles.icon} />
            <TextInput
              style={styles.input}
              placeholder="New password (min 8 characters)"
              secureTextEntry={!passwordVisible}
              value={newPassword}
              onChangeText={setNewPassword}
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
          <TouchableOpacity
            style={[styles.button, busy && styles.disabled]}
            onPress={changePassword}
            disabled={busy}
          >
            <Text style={styles.buttonText}>{busy ? "Saving..." : "Change password"}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setStep("email")}>
            <Text style={styles.link}>Use a different email / send a new code</Text>
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity onPress={() => router.replace("/login")}>
        <Text style={styles.link}>Back to login</Text>
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
  title: { fontSize: 22, fontWeight: "bold", marginVertical: 12, color: "#333" },
  hint: { color: "#555", textAlign: "center", marginBottom: 8 },
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
    elevation: 2,
  },
  input: { flex: 1, marginLeft: 10, fontSize: 16, color: "#333" },
  icon: { marginRight: 5 },
  button: {
    backgroundColor: "#2D8CFF",
    paddingVertical: 12,
    borderRadius: 10,
    width: "100%",
    alignItems: "center",
    marginTop: 20,
    elevation: 4,
  },
  disabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  link: { marginTop: 15, color: "#2D8CFF", fontWeight: "bold", fontSize: 14 },
});
