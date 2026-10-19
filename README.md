# SafePath

AI-assisted pothole reporting. Citizens photograph or live-scan a road with their phone, a YOLO model detects potholes, and the report goes to city staff who review, assign and resolve it from a web dashboard. Users see the outcome in the app.

## Architecture

```
                    ┌──────────────────────────────┐
                    │   Expo / React Native App    │
                    │                              │
                    │  Camera · GPS · Maps · JWT   │
                    └──────────────┬───────────────┘
                                   │
                         HTTP / WebSocket
                                   │
                    ┌──────────────▼───────────────┐
                    │      Spring Boot Backend     │
                    │          Port 8080           │
                    │                              │
                    │  REST APIs · JWT Security    │
                    │  WebSocket Bridge            │
                    │  Report Management           │
                    └───────┬────────────┬─────────┘
                            │            │
                            ▼            ▼
                    ┌────────────┐  ┌────────────┐
                    │  MongoDB   │  │ Cloudinary │
                    │  Reports   │  │   Photos   │
                    │   Users    │  └────────────┘
                    └────────────┘
                            │
                            │ HTTP / WebSocket
                            ▼
                    ┌──────────────────────────────┐
                    │       FastAPI + YOLO         │
                    │          Port 9001           │
                    │                              │
                    │  Image Detection             │
                    │  Real-Time Frame Processing  │
                    └──────────────────────────────┘

                    ┌──────────────────────────────┐
                    │     Admin Web Dashboard      │
                    │  backend static resources    │
                    │          /admin/             │
                    └──────────────────────────────┘

```

| Folder | What it is |
| --- | --- |
| `client/` | Expo SDK 52 / React Native app (expo-router, axios, expo-camera, Leaflet maps in a WebView) |
| `backend/` | Spring Boot 4 · Java 21 · Spring Security (JWT) · Spring Data MongoDB · WebSocket bridge |
| `yolo_service/` | FastAPI + Ultralytics YOLO (`best.pt`), image and realtime detection |
| `backend/src/main/resources/static/admin/` | The admin dashboard (plain HTML/CSS/JS, no build step) |

## Features

**Citizens (mobile app)**
- Sign up with name, email, phone and password; log in with JWT (24 h)
- Report a pothole from a photo; the YOLO result and confidence scores are stored with the report
- Realtime camera detection that can auto-report confirmed potholes (confidence, cooldown and distance limits to avoid duplicates)
- Map of open potholes nearby
- "Your Reports" with **Active / Resolved / Rejected** tabs, status badges and the admin's note or rejection reason
- Profile with editable name and phone
- Forgot password: a 6-digit code is emailed (valid 15 min, 5 tries) and the new password signs out older sessions
- Push notifications when a report starts being handled, is resolved or is rejected (Expo push; tap to open "Your Reports")

**Staff (web dashboard at `/admin/`)**
- Access only for role `admin` **and** an `@safepath.com` email, enforced on the server for every request
- Overview: open, unassigned and overdue counts, average time to resolve, 30-day trend, priority split, what needs attention
- Reports: search, filters, status tabs, bulk actions, CSV export; detail drawer with photo, detection scores, map, possible-duplicate warning, timeline and internal notes
- Workflow: pending → in progress → resolved / rejected (a reason is required to reject); priority and assignment
- Map and Areas: reports coloured by status, tracked zones with per-zone stats, auto-detected hotspots
- Team: invite staff, change your password; forgot-password on the sign-in page

## Setup

Follow these steps to run SafePath locally on Windows. Each service should run in a separate terminal.

### Prerequisites

Install the following before starting:

- **Java 21** — required by the Spring Boot backend.
- **Node.js 18+ and npm** — required by the Expo mobile app.
- **Python 3.10+** — required by the YOLO service.
- **MongoDB** — a local instance or a MongoDB Atlas cluster.
- **Expo Go** — install it on your phone to test the mobile app.
- **Cloudinary account** — required for image storage.

Clone the repository and open its root directory in VS Code:

```powershell
git clone <YOUR_REPOSITORY_URL>
cd Safe_Path
```

Replace `<YOUR_REPOSITORY_URL>` with your GitHub repository URL. If you have already downloaded the project, open its existing root folder instead.

### 1. Configure MongoDB

Use either a local MongoDB instance or MongoDB Atlas.

- For local MongoDB, use `mongodb://localhost:27017` as the connection URI.
- For MongoDB Atlas, create a cluster, configure database access and network access, and copy the connection URI.

Keep your database credentials private.

### 2. Set up the YOLO detection service

Open a terminal at the project root and run:

```powershell
cd yolo_service

python -m venv .venv
.\.venv\Scripts\Activate.ps1

python -m pip install --upgrade pip
pip install -r requirements.txt
```

Ensure that `best.pt` is present inside `yolo_service/`. This model is required for pothole detection.

Start the service:

```powershell
uvicorn app:app --host 0.0.0.0 --port 9001
```

Keep this terminal running. If PowerShell blocks virtual-environment activation, use `.\.venv\Scripts\python.exe -m pip install -r requirements.txt` and `.\.venv\Scripts\python.exe -m uvicorn app:app --host 0.0.0.0 --port 9001` instead.

### 3. Configure and start the Spring Boot backend

Open a **new terminal** at the project root.

Before starting the backend, configure its local settings. Create `backend/src/main/resources/application-example.properties` as a safe template containing the required property names but no real credentials. Copy it to `application.properties`:

```powershell
Copy-Item backend/src/main/resources/application-example.properties backend/src/main/resources/application.properties
```

Edit `backend/src/main/resources/application.properties` and configure the values required by the application, including:

- MongoDB connection URI
- A strong, unique JWT secret
- Cloudinary credentials
- Initial administrator email and password
- YOLO service URL
- SMTP settings, if email-based password reset is required

Use the property names expected by the backend configuration. Never commit real credentials or local configuration files.

Start the backend from the repository root:

```powershell
cd backend
.\mvnw.cmd spring-boot:run
```

The backend runs on port `8080` by default.

### 4. Configure email and push notifications

**Email configuration**

Configure the SMTP properties in `backend/src/main/resources/application-local.properties` using your email provider's SMTP settings. Set the sender address and credentials required by the backend. These settings are used to deliver password-reset codes.

**Push notification configuration**

Configure the Expo/EAS project ID as required by your Expo setup. Push notifications require a supported physical device and a compatible Expo SDK/build configuration.

Keep SMTP credentials and other secrets in `application-local.properties`, which must remain excluded from Git.

### 5. Access the admin dashboard

Once the backend is running, open `http://localhost:8080/admin/` and sign in with the administrator account configured for the backend. Change the password after signing in.

Additional staff accounts can be managed from the dashboard's **Team** section.

### 6. Set up the Expo mobile app

Open another terminal at the repository root:

```powershell
cd client
npm install
Copy-Item .env.example .env
```

Open `client/.env` and set `EXPO_PUBLIC_BACKEND_URL` to the computer's LAN IP address, for example:

```dotenv
EXPO_PUBLIC_BACKEND_URL=http://192.168.1.20:8080
```

Replace the example IP with your computer's actual IPv4 address. Find it by running `ipconfig` in PowerShell and checking the active network adapter.

**Important:** When using Expo Go on a physical phone, `localhost` refers to the phone itself, not your computer. Keep both devices on the same Wi-Fi network and allow the backend port through Windows Firewall if necessary.

Start Expo:

```powershell
npx expo start -c
```

Scan the QR code with Expo Go to launch the app.

### Startup order

Start the services in this order:

1. MongoDB
2. YOLO detection service
3. Spring Boot backend
4. Expo mobile app

Keep each service running in its own terminal while testing SafePath.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| App says it can't reach the server | Check the IP in `.env`, same Wi-Fi, and allow port 8080 through Windows Firewall. Restart Expo with `-c` after changing `.env` |
| `/admin` shows a blank page | Open `/admin/` (with the trailing slash) and hard-refresh (Ctrl+F5) |
| 401 on first launch | Expected before login for protected endpoints; the home map feed `GET /api/report` is public |
| 403 / "session expired" | JWT lasts 24 h; the app signs you out and returns to login |
| Report upload fails with 413 | Raise `spring.servlet.multipart.*` limits |
| Realtime detection disconnects | Make sure the YOLO service is running on port 9001 and `yolo.service-url` matches |
| Can't log in as admin | The password is the value of `admin.bootstrap.password` when the account was *first* created. To reset, delete the user document in Mongo and restart |

## API overview

| Area | Endpoints |
| --- | --- |
| Auth | `POST /api/auth/signup`, `/login`, `/forgot-password`, `/reset-password`, `GET /api/auth/me`, `PUT /api/auth/update`, `POST /api/auth/push-token` (+ `/push-token/remove`) |
| Reports (citizen) | `POST /api/report/register` (multipart), `GET /api/report` (public, open reports only), `GET /api/report/user/{id}`, `GET /api/report/{id}` |
| Admin (role `admin` + `@safepath.com`) | `/api/admin/me`, `/stats`, `/reports` (+ `/export`, `/bulk`, `/{id}`, `/{id}/status`, `/{id}/assign`, `/{id}/priority`, `/{id}/notes`), `/hotspots`, `/zones`, `/staff`, `/me/password` |
| Realtime | WebSocket `/ws` (bridged to the YOLO service) |

## Authors

- Tanya Kudaisya
- Shreya Porwal
- Shreya Singh
