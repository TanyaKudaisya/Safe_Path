import React, { useEffect, useRef, useState } from "react";
import { View, Text, FlatList, Dimensions, Switch } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import Slider from "@react-native-community/slider";
import haversine from "haversine-distance";
import { WS_URL, getErrorMessage } from "@/services/Api";
import { ReportService } from "@/services/ReportService";

const CAMERA_HEIGHT = 400;

// ✅ BUG 4 FIX: Use actual screen width instead of hardcoded value
const CAMERA_WIDTH = Dimensions.get("window").width;

// Auto-report rules: a detection becomes a report in "Report status" when
// its best score reaches MIN_REPORT_SCORE, at most once per cooldown, and
// only after moving MIN_REPORT_DISTANCE_M from the last auto-reported spot
// (so standing in front of one pothole doesn't create dozens of reports).
const MIN_REPORT_SCORE = 0.5;
const REPORT_COOLDOWN_MS = 10000;
const MIN_REPORT_DISTANCE_M = 15;

// Connects to the Java backend (/ws), which bridges frames to the YOLO service.
// Configure host via EXPO_PUBLIC_BACKEND_URL (see services/Api.ts).

export default function RealtimeDetectionScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [threshold, setThreshold] = useState(0.25);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [detections, setDetections] = useState<any[]>([]);
  const [cameraReady, setCameraReady] = useState(false);
  const [wsConnected, setWsConnected] = useState(false); // ✅ Track WS status for UI
  const [autoReport, setAutoReport] = useState(true);
  const [reportedCount, setReportedCount] = useState(0);
  const [reportMsg, setReportMsg] = useState("");

  const cameraRef = useRef<any>(null);
  const ws = useRef<WebSocket | null>(null);
  const runningRef = useRef(false);
  const cameraReadyRef = useRef(false);
  const wsReadyRef = useRef(false);
  const awaitingRef = useRef(false);
  const lastSentRef = useRef(0);
  const frameUriRef = useRef<string | null>(null); // frame awaiting its answer
  const autoReportRef = useRef(true);
  const reportingRef = useRef(false);
  const lastReportAtRef = useRef(0);
  const lastReportPosRef = useRef<{ lat: number; lon: number } | null>(null);

  // ✅ BUG 3 FIX: Use a ref for threshold to avoid stale closure in the loop
  const thresholdRef = useRef(0.25);
  const latitudeRef = useRef<number | null>(null);
  const longitudeRef = useRef<number | null>(null);

  /* ---------- PERMISSIONS ---------- */
  useEffect(() => {
    let cancelled = false;
    let locationSub: Location.LocationSubscription | null = null;
    (async () => {
      if (!permission?.granted) {
        await requestPermission();
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({});
        setLatitude(loc.coords.latitude);
        setLongitude(loc.coords.longitude);
        latitudeRef.current = loc.coords.latitude;
        longitudeRef.current = loc.coords.longitude;

        // Keep position fresh while moving, so reports get the right spot
        locationSub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            distanceInterval: 5,
            timeInterval: 2000,
          },
          (l) => {
            if (cancelled) return;
            setLatitude(l.coords.latitude);
            setLongitude(l.coords.longitude);
            latitudeRef.current = l.coords.latitude;
            longitudeRef.current = l.coords.longitude;
          }
        );
      }
    })();

    return () => {
      cancelled = true;
      locationSub?.remove();
    };
  }, []);

  /* ---------- WEBSOCKET (with auto-reconnect) ---------- */
  useEffect(() => {
    let unmounted = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (unmounted) return;

      const socket = new WebSocket(WS_URL);
      ws.current = socket;

      socket.onopen = () => {
        console.log("✅ WebSocket connected:", WS_URL);
        awaitingRef.current = false;
        wsReadyRef.current = true;
        setWsConnected(true);
        maybeStart(); // camera may already be ready
      };

      socket.onmessage = (event) => {
        awaitingRef.current = false; // server answered -> OK to send next frame
        try {
          const parsed = JSON.parse(event.data);
          const list = Array.isArray(parsed) ? parsed : [];
          setDetections(list);
          maybeAutoReport(list, frameUriRef.current);
        } catch { }
      };

      socket.onclose = (e) => {
        console.log("🔌 WebSocket closed:", e.code, e.reason);
        wsReadyRef.current = false;
        runningRef.current = false;
        awaitingRef.current = false;
        setWsConnected(false);
        if (!unmounted) {
          reconnectTimer = setTimeout(connect, 2000);
        }
      };

      socket.onerror = (error) => {
        console.log("❌ WebSocket error:", error);
        setWsConnected(false);
      };
    };

    connect();

    return () => {
      unmounted = true;
      runningRef.current = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws.current?.close();
    };
  }, []);

  /* ---------- START STREAM WHEN CAMERA + SOCKET ARE BOTH READY ---------- */
  // Refs (not state) are used so that whichever of the two becomes ready
  // last can start the loop; closures would otherwise see stale values.
  const maybeStart = () => {
    if (cameraReadyRef.current && wsReadyRef.current) {
      startSendingFrames();
    }
  };

  const handleCameraReady = () => {
    cameraReadyRef.current = true;
    setCameraReady(true);
    maybeStart();
  };

  /* ---------- AUTO-REPORT ---------- */
  // Uploads the frame that produced the detections through the normal report
  // endpoint. The backend re-runs YOLO on it, stores the detections and the
  // photo, so it appears in Report History / admin like any other report.
  const maybeAutoReport = async (list: any[], frameUri: string | null) => {
    if (!autoReportRef.current || reportingRef.current || !frameUri) return;
    if (!list.length) return;

    const best = Math.max(...list.map((d) => Number(d.score) || 0));
    if (best < MIN_REPORT_SCORE) return;

    const lat = latitudeRef.current;
    const lon = longitudeRef.current;
    if (lat == null || lon == null) return;

    const now = Date.now();
    if (now - lastReportAtRef.current < REPORT_COOLDOWN_MS) return;

    const prev = lastReportPosRef.current;
    if (prev && haversine(prev, { lat, lon }) < MIN_REPORT_DISTANCE_M) return;

    reportingRef.current = true;
    lastReportAtRef.current = now;

    try {
      const formData = new FormData();
      formData.append("name", "Realtime detection");
      formData.append(
        "description",
        `Auto-reported by realtime detection: ${list.length} pothole(s), highest confidence ${(best * 100).toFixed(0)}%.`
      );
      formData.append("latitude", String(lat));
      formData.append("longitude", String(lon));
      formData.append("photo", {
        uri: frameUri,
        name: "realtime.jpg",
        type: "image/jpeg",
      } as any);

      await ReportService.registerReport(formData);

      lastReportPosRef.current = { lat, lon };
      setReportedCount((c) => c + 1);
      setReportMsg("✅ Reported - see Report Status");
    } catch (err: any) {
      console.log("Auto-report error:", err?.response?.data || err?.message);
      lastReportAtRef.current = 0; // allow a retry
      setReportMsg("⚠️ " + getErrorMessage(err, "Could not submit report"));
    } finally {
      reportingRef.current = false;
    }
  };

  const handleAutoReportToggle = (val: boolean) => {
    setAutoReport(val);
    autoReportRef.current = val;
  };

  /* ---------- SLIDER CHANGE ---------- */
  const handleThresholdChange = (val: number) => {
    setThreshold(val);
    thresholdRef.current = val;
  };

  /* ---------- FRAME SENDING LOOP ---------- */
  // Sends one frame, then waits for the server's answer before sending the
  // next, so frames never pile up when YOLO is slower than the camera.
  const startSendingFrames = async () => {
    if (runningRef.current) return;
    runningRef.current = true;

    while (runningRef.current) {
      const socket = ws.current;

      if (!cameraRef.current || !socket || socket.readyState !== WebSocket.OPEN) {
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }

      // Still waiting for the previous answer (give up after 5 s)
      if (awaitingRef.current) {
        if (Date.now() - lastSentRef.current > 5000) {
          awaitingRef.current = false;
        } else {
          await new Promise((r) => setTimeout(r, 50));
          continue;
        }
      }

      try {
        const photo = await cameraRef.current.takePictureAsync({
          base64: true,
          quality: 0.4,
          skipProcessing: true,
          shutterSound: false,
        });

        // Socket may have closed while the photo was being taken
        if (
          !runningRef.current ||
          socket.readyState !== WebSocket.OPEN ||
          !photo?.base64
        ) {
          continue;
        }

        // The YOLO service expects: 1) JSON metadata, 2) base64 image
        socket.send(
          JSON.stringify({
            threshold: thresholdRef.current,
            latitude: latitudeRef.current,
            longitude: longitudeRef.current,
          })
        );
        socket.send(photo.base64);

        frameUriRef.current = photo.uri ?? null;
        awaitingRef.current = true;
        lastSentRef.current = Date.now();
      } catch (err) {
        console.log("Frame send error:", err);
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

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 4,
        }}
      >
        <Text style={{ fontSize: 13, marginRight: 8 }}>
          Auto-report detections
        </Text>
        <Switch value={autoReport} onValueChange={handleAutoReportToggle} />
      </View>
      {autoReport && (
        <Text style={{ textAlign: "center", fontSize: 12, marginBottom: 4 }}>
          Reported this session: {reportedCount}
          {reportMsg ? `  ·  ${reportMsg}` : ""}
        </Text>
      )}

      {/* CAMERA + BOX OVERLAY */}
      <View style={{ width: "100%", height: CAMERA_HEIGHT, position: "relative" }}>
        <CameraView
          ref={cameraRef}
          style={{ width: "100%", height: "100%" }}
          facing="back"
          onCameraReady={handleCameraReady}
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