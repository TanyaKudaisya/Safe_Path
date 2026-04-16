from fastapi import FastAPI, WebSocket, UploadFile, File
from fastapi.responses import JSONResponse
from ultralytics import YOLO
import base64
import cv2
import numpy as np
import json

app = FastAPI()

# --------------------------------------------------
# LOAD YOLO MODEL ONCE
# --------------------------------------------------
model = YOLO("best.pt")


# ==================================================
# 1️⃣ REALTIME DETECTION (WEBSOCKET)
# ==================================================
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("✅ WebSocket client connected")

    try:
        while True:
            # Receive metadata
            meta = json.loads(await websocket.receive_text())
            threshold = meta.get("threshold", 0.25)

            # Receive image (base64)
            img_b64 = await websocket.receive_text()
            img_bytes = base64.b64decode(img_b64)

            # Decode image
            np_arr = np.frombuffer(img_bytes, np.uint8)
            img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

            if img is None:
                await websocket.send_text("[]")
                continue

            h, w, _ = img.shape

            # YOLO inference
            results = model(img, conf=threshold)[0]

            detections = []
            for box in results.boxes:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                conf = float(box.conf[0])

                detections.append({
                    "label": model.names[int(box.cls[0])],
                    "score": conf,
                    "box": {
                        "x1": x1 / w,
                        "y1": y1 / h,
                        "x2": x2 / w,
                        "y2": y2 / h
                    }
                })

            # Send detections back to mobile
            await websocket.send_text(json.dumps(detections))

    except Exception as e:
        print("❌ WebSocket error:", e)
    finally:
        print("🔌 WebSocket disconnected")


# ==================================================
# 2️⃣ IMAGE UPLOAD DETECTION (HTTP API)
# ==================================================
@app.post("/detect-image")
async def detect_image(
    file: UploadFile = File(...),
    threshold: float = 0.25
):
    image_bytes = await file.read()

    np_arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    if img is None:
        return JSONResponse(
            status_code=400,
            content={"detected": False, "count": 0}
        )

    results = model(img, conf=threshold)[0]

    detections = []
    for box in results.boxes:
        detections.append({
            "label": model.names[int(box.cls[0])],
            "score": float(box.conf[0])
        })

    return {
        "detected": len(detections) > 0,
        "count": len(detections),
        "detections": detections
    }
