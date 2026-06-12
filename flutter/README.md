mkdir -p assets/icons

# PRAEM Driver — Flutter Mobile Terminal
# ========================================
# Part of the PRAEM_FLOW monorepo.

## Getting started

### Prerequisites

- Flutter SDK >= 3.13 (https://docs.flutter.dev/get-started/install)

### Setup

```bash
cd flutter
cp .env.example .env
# Edit .env with your API URLs

flutter pub get
flutter run
```

### Build APK (Android tablet)

```bash
flutter build apk --release --split-per-abi
```

### Environment Variables

| Variable       | Description                              |
|----------------|------------------------------------------|
| `API_BASE_URL` | REST API base URL (`/api` included)      |
| `WS_BASE_URL`  | Socket.IO server URL (no namespace)      |
| `APP_ENV`      | `development` or `production`            |

---

## Architecture

```
lib/
├── main.dart           — entry point, MultiProvider setup
├── config/             — AppConfig (env vars, constants)
├── core/               — route names, colours, app router
├── auth/               — JWT auth, secure storage, login screen
├── driver/             — DriverState (vehicle, route, patients)
├── tracking/           — GpsTrackingService (10s heartbeat)
├── websocket/          — WsService (Socket.IO /operations)
├── qr/                 — QR scanner screen (mobile_scanner)
├── trips/              — HomeScreen + TripScreen
├── vehicles/           — Vehicle selection screen
├── offline/            — OfflineQueue (Hive, GPS + QR pending)
└── shared/widgets/     — OperationalButton, StatusBadge
```

## Key flows

### GPS Heartbeat
- Reads GPS every ~10 seconds (configurable)
- Sends `vehicle.heartbeat` via Socket.IO if connected
- Falls back to `POST /tracking/heartbeat` (REST) with `X-Device-Token`
- Queues in Hive when offline; auto-flushes on reconnect

### QR Scanner
- Scans patient QR token with camera
- Sends to `POST /patients/qr/scan` with `vehicleId`, `routeId`, `deviceId`
- Shows `name`, `destination`, `priority` — NEVER CPF or sensitive data
- Queues scan when offline; syncs when back online

### WebSocket events received
- `queue.updated` / `queue.delayed` — operational updates
- `patient.boarded` / `patient.arrived`
- `trip.started` / `trip.completed`
- `vehicle.offline` — triggers alert banner
- `operational.alert` — shows SnackBar

### Offline mode
- Hive boxes: `offline_gps`, `offline_qr`
- Max 500 items each (oldest trimmed)
- Auto-sync when WebSocket reconnects
