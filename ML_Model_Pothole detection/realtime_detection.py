from ultralytics import YOLO
import cv2

# Load the trained model
model = YOLO("best.pt")

# Path to your test image
image_path = "img.png"  # change this to your image name

# Run detection
results = model(image_path)

# Show the image with detections
annotated_image = results[0].plot()
cv2.imshow("Pothole Detection", annotated_image)
cv2.waitKey(0)
cv2.destroyAllWindows()
