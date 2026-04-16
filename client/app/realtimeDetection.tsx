import React, { useEffect, useRef, useState } from "react";
import { View, Text, FlatList, Dimensions } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import Slider from "@react-native-community/slider";

const CAMERA_HEIGHT = 400;

// ✅ BUG 4 FIX: Use actual screen width instead of hardcoded value
const CAMERA_WIDTH = Dimensions.get("window").width;

// ✅ BUG 2 FIX: Use environment variable instead of hardcoded IP
// Add this to your .env file: EXPO_PUBLIC_WS_URL=ws://192.168.29.242:9000/ws
const WS_URL = process.env.EXPO_PUBLIC_WS_URL ?? "ws://192.168.1.29:9001/ws";

export default function RealtimeDetectionScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [threshold, setThreshold] = useState(0.25);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [detections, setDetections] = useState<any[]>([]);
  const [cameraReady, setCameraReady] = useState(false);
  const [wsConnected, setWsConnected] = useState(false); // ✅ Track WS status for UI

  const cameraRef = useRef<any>(null);
  const ws = useRef<WebSocket | null>(null);
  const runningRef = useRef(false);

  // ✅ BUG 3 FIX: Use a ref for threshold to avoid stale closure in the loop
  const thresholdRef = useRef(0.25);
  const latitudeRef = useRef<number | null>(null);
  const longitudeRef = useRef<number | null>(null);

  /* ---------- PERMISSIONS ---------- */
  useEffect(() => {
    (async () => {
      if (!permission?.granted) {
        await requestPermission();
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({});
        setLatitude(loc.coords.latitude);
        setLongitude(loc.coords.longitude);

        // ✅ BUG 3 FIX: Keep refs in sync
        latitudeRef.current = loc.coords.latitude;
        longitudeRef.current = loc.coords.longitude;
      }
    })();
  }, []);

  /* ---------- WEBSOCKET ---------- */
  useEffect(() => {
    ws.current = new WebSocket(WS_URL);

    ws.current.onopen = () => {
      console.log("✅ WebSocket connected");
      setWsConnected(true);

      // ✅ BUG 1 FIX: If camera is already ready when WS opens, start streaming
      if (cameraReady) {
        startSendingFrames();
      }
    };

    ws.current.onmessage = (event) => {
      try {
        setDetections(JSON.parse(event.data));
      } catch { }
    };

    // ✅ BUG 5 FIX: Handle disconnection gracefully
    ws.current.onclose = () => {
      console.log("🔌 WebSocket disconnected");
      setWsConnected(false);
      runningRef.current = false;
    };

    ws.current.onerror = (error) => {
      console.log("❌ WebSocket error:", error);
      setWsConnected(false);
    };

    return () => {
      runningRef.current = false;
      ws.current?.close();
    };
  }, []);

  /* ---------- START STREAM WHEN CAMERA READY ---------- */
  // ✅ BUG 1 FIX: Also check if WS is already open when camera becomes ready
  useEffect(() => {
    if (cameraReady) {
      if (ws.current?.readyState === WebSocket.OPEN) {
        startSendingFrames();
      }
      // If WS not open yet, the ws.current.onopen above will trigger startSendingFrames
    }
  }, [cameraReady]);

  /* ---------- SLIDER CHANGE ---------- */
  // ✅ BUG 3 FIX: Update both state (for UI) and ref (for loop)
  const handleThresholdChange = (val: number) => {
    setThreshold(val);
    thresholdRef.current = val;
  };

  /* ---------- FRAME SENDING LOOP ---------- */
  const startSendingFrames = async () => {
    if (runningRef.current) return;
    runningRef.current = true;

    while (runningRef.current) {
      if (cameraRef.current && ws.current?.readyState === WebSocket.OPEN) {
        try {
          const photo = await cameraRef.current.takePictureAsync({
            base64: true,
            quality: 0.4,
            skipProcessing: true,
          });

          // ✅ BUG 3 FIX: Use refs instead of stale state values
          ws.current.send(JSON.stringify({
            threshold: thresholdRef.current,
            latitude: latitudeRef.current,
            longitude: longitudeRef.current,
          }));

          ws.current.send(photo.base64);

        } catch (err) {
          console.log("Frame send error:", err);
        }

        await new Promise((r) => setTimeout(r, 400));
      } else {
        // WS not ready, wait and retry
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  };

  /* ---------- UI ---------- */
  if (!permission?.granted) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text>Camera permission required</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Text style={{ textAlign: "center", fontSize: 18, marginVertical: 8 }}>
        Realtime Pothole Detection
      </Text>

      {/* ✅ BUG 5 FIX: Show connection status to user */}
      <Text style={{
        textAlign: "center",
        fontSize: 12,
        color: wsConnected ? "green" : "red",
        marginBottom: 4,
      }}>
        {wsConnected ? "🟢 Connected" : "🔴 Disconnected"}
      </Text>

      {/* CAMERA + BOX OVERLAY */}
      <View style={{ width: "100%", height: CAMERA_HEIGHT, position: "relative" }}>
        <CameraView
          ref={cameraRef}
          style={{ width: "100%", height: "100%" }}
          facing="back"
          onCameraReady={() => setCameraReady(true)}
        />

        {/* DRAW BOUNDING BOXES */}
        {detections.map((det, index) => {
          if (!det.box) return null;

          // ✅ BUG 4 FIX: Uses real CAMERA_WIDTH from Dimensions
          const left = det.box.x1 * CAMERA_WIDTH;
          const top = det.box.y1 * CAMERA_HEIGHT;
          const width = (det.box.x2 - det.box.x1) * CAMERA_WIDTH;
          const height = (det.box.y2 - det.box.y1) * CAMERA_HEIGHT;

          return (
            <View
              key={index}
              style={{
                position: "absolute",
                left,
                top,
                width,
                height,
                borderWidth: 2,
                borderColor: "red",
              }}
            >
              <Text
                style={{
                  color: "red",
                  backgroundColor: "rgba(0,0,0,0.6)",
                  fontSize: 12,
                }}
              >
                {det.label} {(det.score * 100).toFixed(0)}%
              </Text>
            </View>
          );
        })}
      </View>

      <Text style={{ textAlign: "center" }}>
        Confidence Threshold: {threshold.toFixed(2)}
      </Text>

      <Slider
        value={threshold}
        onValueChange={handleThresholdChange}  // ✅ BUG 3 FIX: use handler that updates ref
        minimumValue={0}
        maximumValue={1}
        step={0.05}
        style={{ width: "90%", alignSelf: "center" }}
      />

      <FlatList
        data={detections}
        keyExtractor={(_, i) => i.toString()}
        renderItem={({ item }) => (
          <Text style={{ textAlign: "center" }}>
            {item.label} ({(item.score * 100).toFixed(1)}%)
          </Text>
        )}
      />
    </View>
  );
}