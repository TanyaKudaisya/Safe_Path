# 🚧 SafeRoadsAI – AI-Powered Pothole Detection & Management System

SafeRoadsAI is a full-stack mobile application designed to improve road safety by enabling users to report potholes using images and location data. The system integrates AI-based detection (YOLO/OpenCV) with a role-based admin dashboard, allowing authorities to efficiently monitor, prioritize, and resolve road issues.

---

## 🎯 Project Objective

- Detect potholes using computer vision  
- Enable users to report road issues easily  
- Provide an admin dashboard to manage reports  
- Build a scalable real-world solution  

---

## 🧠 System Workflow

1. User uploads pothole image  
2. Location (latitude & longitude) is captured  
3. Backend stores report in MongoDB  
4. Image is sent to AI model for detection  
5. Detection result is stored  
6. Admin views all reports  
7. Admin can resolve, delete, or prioritize reports  

---

## 🚀 Features

### 👤 User Features
- Upload pothole images or Real-Time Pothole Detection
- Automatic location tagging  
- AI-based pothole detection  
- View report history  
- Detection status (Detected / Not Detected)  

### 👨‍💼 Admin Features
- View all reports  
- Mark reports as resolved  
- Delete reports  
- Set priority (Low / Medium / High)  
- Secure role-based access  

---

## 🏗️ Tech Stack

### Frontend
- React Native (Expo)
- TypeScript
- Expo Router
- Axios
- SecureStore

### Backend
- Node.js
- Express.js
- MongoDB (Mongoose)
- JWT Authentication
- Multer

### AI / ML
- YOLO / OpenCV
- Python-based detection API

---

## 🔐 Authentication & Security

- JWT-based authentication  
- Role-based access control (RBAC)  
- Admin-protected APIs  
- Secure token storage  

---

## ⚙️ Setup Instructions

### 1. Clone Repository

```
git clone https://github.com/rishvant/Pothole-App
cd Pothole-App
```

### 2. Backend Setup

```
cd server
npm install
```

Create `.env` file:

```
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_secret_key
```

Run backend:

```
node server.js
```

### 3. Create Admin User

```
node createAdmin.js
```

Default credentials:

```
Email: admin@gmail.com
Password: admin123
```

### 4. Frontend Setup

```
cd client
npm install
npx expo start
```

---

## 📡 API Endpoints

### Auth
- POST /auth/signup  
- POST /auth/login  

### Reports
- POST /report/register  
- GET /report/user/:user_id  

### Admin
- GET /report  
- DELETE /report/:id  
- PUT /report/:id/resolve  
- PUT /report/:id/priority  

---

## 🧪 Testing Flow

1. Login as user  
2. Submit pothole report  
3. Login as admin  
4. View reports  
5. Resolve / Delete / Prioritize  

---

## 📌 Highlights

- Full-stack mobile + backend + AI integration  
- Real-world problem solving  
- Role-based system  
- Secure API design  
- Clean architecture  

---

## 🚀 Future Enhancements

- Map clustering  
- Notifications  
- Analytics dashboard  
- Web admin panel  

---


## 📄 License

For academic and demonstration purposes.

