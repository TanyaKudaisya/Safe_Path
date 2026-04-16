import React, { createContext, useContext, useState, useRef } from "react";
import { View, StyleSheet, Animated, Easing } from "react-native";
import { Button, Snackbar } from "@react-native-material/core";

interface SnackbarContextType {
  showSnackbar: (
    message: string,
    type?: "success" | "error" | "general"
  ) => void;
}

const SnackbarContext = createContext<SnackbarContextType | undefined>(
  undefined
);

export const SnackbarProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");
  const [snackbarColor, setSnackbarColor] = useState("#323232"); // Default: General message
  const slideAnim = useRef(new Animated.Value(-100)).current; // Start position (above screen)
  let timeout: NodeJS.Timeout;

  const showSnackbar = (
    msg: string,
    type: "success" | "error" | "general" = "general"
  ) => {
    setMessage(msg);

    // Set color based on type
    const colorMap = {
      success: "#4CAF50", // Green
      error: "#F44336", // Red
      general: "#323232", // Dark gray (default)
    };
    setSnackbarColor(colorMap[type]);

    setVisible(true);

    // Slide down animation
    Animated.timing(slideAnim, {
      toValue: 0, // Bring into view
      duration: 300,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();

    // Hide after 3 seconds
    clearTimeout(timeout);
    timeout = setTimeout(() => dismissSnackbar(), 3000);
  };

  const dismissSnackbar = () => {
    clearTimeout(timeout);

    // Slide up animation
    Animated.timing(slideAnim, {
      toValue: -100, // Move out of view
      duration: 300,
      easing: Easing.in(Easing.ease),
      useNativeDriver: true,
    }).start(() => setVisible(false));
  };

  return (
    <SnackbarContext.Provider value={{ showSnackbar }}>
      <View style={{ flex: 1 }}>
        {children}
        {visible && (
          <Animated.View
            style={[
              styles.snackbarContainer,
              { transform: [{ translateY: slideAnim }] },
            ]}
          >
            <Snackbar
              message={message}
              style={[styles.snackbar, { backgroundColor: snackbarColor }]}
              action={
                <Button
                  variant="text"
                  title="Dismiss"
                  color="#FFF"
                  compact
                  onPress={dismissSnackbar}
                />
              }
            />
          </Animated.View>
        )}
      </View>
    </SnackbarContext.Provider>
  );
};

export const useSnackbar = () => {
  const context = useContext(SnackbarContext);
  if (!context) {
    throw new Error("useSnackbar must be used within a SnackbarProvider");
  }
  return context;
};

const styles = StyleSheet.create({
  snackbarContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 999,
  },
  snackbar: {
    paddingHorizontal: 16,
    borderRadius: 8,
    width: "90%",
    marginTop: "15%",
  },
});
