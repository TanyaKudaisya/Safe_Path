import dotenv from "dotenv";
dotenv.config();

import express from "express";
import http from "http";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import { WebSocketServer } from "ws";

import connectDB from "./db/index.js";
import authRoutes from "./routes/authRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

const app = express();
connectDB();

app.use(express.json());
app.use(cors());

app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api/auth", authRoutes);
app.use("/api", reportRoutes);

const server = http.createServer(app);

/* =======================
   WEBSOCKET FOR REALTIME
======================= */
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("WebSocket client connected");

  let metadata = {};

  ws.on("message", async (data) => {
    try {
      // 1️⃣ Receive metadata (threshold, lat, long)
      if (typeof data === "string") {
        metadata = JSON.parse(data);
        return;
      }

      // 2️⃣ Send frame to YOLO Python service
      const response = await fetch("http://192.168.1.29:9000/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: data.toString(),
          threshold: metadata.threshold || 0.5,
        }),
      });

      const detections = await response.json();

      // 3️⃣ Send detections back to mobile
      ws.send(JSON.stringify(detections));
    } catch (err) {
      console.error("WebSocket error:", err.message);
    }
  });

  ws.on("close", () => {
    console.log("WebSocket client disconnected");
  });
});

/* ======================= */

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
