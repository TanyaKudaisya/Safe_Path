from ultralytics import YOLO
import cv2
import torch

# Load your trained model
model = YOLO("best.pt")

# Use GPU if available (for faster detection)
device = 'cuda' if torch.cuda.is_available() else 'cpu'
model.to(device)

# Path to your input video
video_path = "ruralRoad_potHoles.mp4"  # change this to your video file
cap = cv2.VideoCapture(video_path)

# Get video details
frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
fps = int(cap.get(cv2.CAP_PROP_FPS))

# Output video writer to save results
out = cv2.VideoWriter('pothole_output.mp4',
                      cv2.VideoWriter_fourcc(*'mp4v'),
                      fps, (frame_width, frame_height))

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    # Run YOLO detection
    results = model(frame)

    # Draw detections on frame
    annotated_frame = results[0].plot()

    # Display the frame
    cv2.imshow("Pothole Detection - Video", annotated_frame)

    # Write the annotated frame to output file
    out.write(annotated_frame)

    # Press 'q' to quit early
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
out.release()
cv2.destroyAllWindows()

print("✅ Detection complete! Output saved as 'pothole_output.mp4'")
