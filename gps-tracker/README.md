# ESP32 GPS Tracker

A complete, production-ready real-time GPS tracking system for an **ESP32 + NEO-6M** module.

The ESP32 reads NMEA data from the GPS module and `POST`s latitude, longitude, altitude,
satellite count and timestamp to your own backend. The backend stores every fix, broadcasts
it over WebSocket and serves a React dashboard that draws the live position and the travels
path on an OpenStreetMap map.

```
ESP32 + NEO-6M  ──HTTP POST /api/location──▶  Node/Express + SQLite  ──Socket.IO──▶  React + Leaflet
   (10s interval)         Bearer API key          stores history            live marker / route
```

- **Frontend:** React 18 + Vite, JavaScript, Tailwind CSS, Leaflet + React-Leaflet
- **Backend:** Node.js + Express, REST + Socket.IO, SQLite (dev) designed for PostgreSQL (prod)
- **Device:** ESP32-WROOM-32 + NEO-6M, HTTP upload, onboard LED status
- **Maps:** OpenStreetMap + Esri satellite tiles. **No Google Maps API.**

---

## Project structure

```
gps-tracker/
├── frontend/
│   ├── src/
│   │   ├── components/     Layout, MapView, StatusPill, RangeFilter, ui primitives, Icon
│   │   ├── pages/          Dashboard, LiveMap, History, Route, Device, Settings
│   │   ├── hooks/          useNow, useApiResource
│   │   ├── services/       api.js (REST), socket.js (Socket.IO)
│   │   ├── context/        ThemeContext (dark/light), TrackerContext (realtime state)
│   │   ├── utils/          format.js, range.js
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── package.json
│
├── backend/
│   ├── config/             env parsing + fail-fast validation
│   ├── controllers/        location, device, stats
│   ├── database/           index.js (SQLite+PG), migrate.js, schema.*.sql
│   ├── middleware/         auth, errorHandler, asyncHandler, rateLimit
│   ├── models/             deviceModel, locationModel
│   ├── realtime/           socket.js
│   ├── routes/             location, device, stats, index
│   ├── scripts/            smoke.js
│   ├── services/           trackerService.js
│   ├── utils/              geo, logger, range, time, validation
│   ├── server.js
│   └── package.json
│
├── esp32/
│   ├── gps_tracker.ino
│   └── secrets.h.example
│
├── .env.example
└── README.md
```

---

## 1. Install dependencies

Requires **Node.js >= 18.18** (uses the built-in `fetch`).

```bash
# Backend
cd backend
npm install

# Frontend (in a second terminal)
cd frontend
npm install
```

The ESP32 firmware needs the **Arduino IDE** with the ESP32 board package
(Boards Manager → "esp32 by Espressif Systems"). No extra Arduino libraries are
required — the firmware parses NMEA itself.

---

## 2. Create the database

SQLite needs no server: the file is created automatically. The schema is applied
on every backend boot, so this is optional, but `migrate` is handy for CI and
shows the migration in the `schema_migrations` table.

```bash
cd backend
cp .env.example .env          # then edit API_SECRET!
npm run migrate
```

Environment files:

```bash
cp .env.example   backend/.env            # backend secrets  (API_SECRET, PORT, DB)
cp frontend/.env.example frontend/.env    # optional
```

Generate a strong device key and paste it into `backend/.env`:

```bash
node -e "console.log('gps_live_'+require('crypto').randomBytes(24).toString('hex'))"
```

### Migrating to PostgreSQL later

The data layer speaks both engines, so switching is configuration only — no code
changes:

```bash
# backend/.env
DB_CLIENT=postgres
DATABASE_URL=postgres://user:password@localhost:5432/gps_tracker
```

```bash
createdb gps_tracker
cd backend && npm run migrate
```

`database/schema.sqlite.sql` and `database/schema.postgres.sql` mirror each other
column-for-column, and every query uses portable `?` placeholders.

---

## 3. Start the backend

```bash
cd backend
npm run dev      # nodemon, reloads on change
# or
npm start
```

```
ESP32 GPS Tracker backend (development)
REST API   : http://localhost:4000/api
Ingest     : POST http://localhost:4000/api/location
Health     : http://localhost:4000/api/health
WebSocket  : ws://localhost:4000/socket.io
Database   : sqlite
```

---

## 4. Start the frontend

The Vite dev server proxies `/api` and `/socket.io` to `http://localhost:4000`,
so the browser talks to one origin and CORS is a non-issue in development.

```bash
cd frontend
npm run dev
```

Open **http://localhost:5173**.

> If your backend runs on another host/port, set `VITE_PROXY_TARGET` when starting
> Vite, or set `VITE_API_URL` in `frontend/.env`.

---

## 5. Configure the ESP32

Wire the NEO-6M:

| NEO-6M | ESP32            |
| ------ | ---------------- |
| TX     | GPIO16 (UART RX) |
| RX     | GPIO17 (UART TX) |
| GND    | GND              |
| VCC    | 3V3 (not 5V)     |

Then create the private header:

```bash
cd esp32
cp secrets.h.example secrets.h
```

Edit `secrets.h`:

```c
#define WIFI_SSID       "YourWiFi"
#define WIFI_PASSWORD   "YourPassword"
#define API_BASE_URL    "http://192.168.1.50:4000"   // no trailing slash, no /api
#define API_SECRET      "the-same-value-as-backend-API_SECRET"
#define DEVICE_ID       "GPS_TRACKING"
```

Open `gps_tracker.ino`, select board **ESP32 Dev Module**, pick the COM port and upload.
`secrets.h` is gitignored, so credentials never reach the repository.

**LED behaviour (GPIO2):**

| State                    | Meaning                             |
| ------------------------ | ----------------------------------- |
| OFF                      | Wi-Fi disconnected                  |
| SOLID                    | Wi-Fi connected, no GPS fix          |
| BLINKING                 | Wi-Fi connected and GPS fix available |

---

## 6. Connect the ESP32 to the backend

1. Put the backend and the ESP32 on the **same network** (or expose the backend publicly).
2. Find your computer's LAN IP (`ipconfig` on Windows, `ip addr` on Linux/macOS).
3. Set `API_BASE_URL` in `secrets.h` to `http://<LAN-IP>:4000` — **not** `localhost`,
   because that would point back at the ESP32 itself.
4. Make sure `API_SECRET` in `secrets.h` is byte-for-byte identical to the one in `backend/.env`.
5. Allow inbound TCP 4000 through your firewall if needed.
6. Open the Serial Monitor at **115200 baud**. You should see:

```
[gps] fix lat=17.423450 lon=83.198760 alt=25.1m sats=7
[http] 201 ok - {"success":true,"message":"Location received", ...}
```

The dashboard marker moves as soon as the first upload lands — no refresh needed.

---

## 7. Test the API

With the backend running, the built-in smoke test covers health, auth, validation,
ingest, latest, history, route and stats:

```bash
cd backend
npm run smoke
```

Manual tests with `curl`:

```bash
# Health check
curl http://localhost:4000/api/health

# Current device status
curl http://localhost:4000/api/device

# POST a location (send your own real coordinates)
curl -X POST http://localhost:4000/api/location \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_SECRET" \
  -d '{
    "device_id": "GPS_TRACKING",
    "latitude": 17.423450,
    "longitude": 83.198760,
    "altitude": 25.4,
    "satellites": 7,
    "timestamp": "2026-09-30T21:30:00"
  }'
```

Expected responses:

```json
// 201 Created
{ "success": true, "message": "Location received", "location": { ... }, "device": { ... } }

// 401 Unauthorized   -> missing/wrong Authorization header
{ "success": false, "error": "Missing or invalid device API key" }

// 400 Bad Request    -> latitude 120
{ "success": false, "error": "Invalid location payload",
  "details": { "errors": ["latitude must be between -90 and 90"] } }

// 422 Unprocessable  -> (0,0) coordinates
{ "success": false, "error": "Rejected (0,0) coordinates - device most likely has no GPS fix" }
```

Read endpoints (PowerShell: use `curl.exe`):

```bash
curl "http://localhost:4000/api/locations?range=today&limit=20"
curl "http://localhost:4000/api/locations?from=2026-09-01T00:00:00Z&to=2026-09-30T23:59:59Z"
curl "http://localhost:4000/api/route?range=today"
curl "http://localhost:4000/api/stats?range=7d"
```

### Replacing test data with real ESP32 data

The dashboard **never** invents coordinates. Everything it shows comes from rows in
the `locations` table, which are only written by `POST /api/location`.

- The `curl` above is only for verifying the plumbing. Delete those rows if you want
  a clean history, then let the ESP32 be the sole writer:

  ```bash
  # SQLite
  sqlite3 backend/data/gps-tracker.db "DELETE FROM locations; DELETE FROM devices;"
  ```

- Once the ESP32 is uploading, every point is a real GPS fix — no code changes
  are needed. Stop sending curl requests and the history becomes purely yours.
- To confirm the data is real, compare `GET /api/locations/latest` with the
  coordinates on the Serial Monitor.

---

## 8. Deploy the application

### Backend (Render / Railway / Fly.io / any VPS)

1. Move to PostgreSQL: set `DB_CLIENT=postgres` and `DATABASE_URL`.
2. Set environment variables: `NODE_ENV=production`, `PORT`, `API_SECRET`,
   and (recommended) `DASHBOARD_API_KEY` + `CORS_ORIGINS=https://your-dashboard.example`.
3. Run `npm run migrate` once, then `npm start` (or build a Docker image from
   `backend/`).
4. Serve behind HTTPS so the device key isn't sent in clear text. Update
   `API_BASE_URL` in `secrets.h` to the `https://` URL and re-flash the ESP32.

### Frontend (Netlify / Vercel / Cloudflare Pages)

1. Set `VITE_API_URL=https://gps-api.example.com` and, if used,
   `VITE_DASHBOARD_API_KEY` (read-only key).
2. Build: `npm run build`, publish directory `dist`.
3. For client-side routing add a SPA fallback rewrite (`/* -> /index.html`).
4. Never put `API_SECRET` in the frontend environment — only the read-only key.

### Security checklist

- `API_SECRET` (device write key) lives only in `backend/.env` and `esp32/secrets.h`.
- The browser only ever receives an optional, separate **read-only** dashboard key.
- Ingest requires `Authorization: Bearer <API_SECRET>` and is rate limited.
- All payloads are validated (device id, latitude, longitude, satellites, altitude).
- `(0,0)` "null island" fixes are rejected.
- CORS is restricted via `CORS_ORIGINS` in production.

---

## API reference

| Method | Endpoint                | Auth          | Purpose                                   |
| ------ | ----------------------- | ------------- | ----------------------------------------- |
| GET    | `/api/health`           | —             | Liveness + database probe                 |
| GET    | `/api/config`           | —             | Public, non-secret frontend config        |
| POST   | `/api/location`         | Device key    | Store a fix and broadcast it              |
| GET    | `/api/locations`        | Dashboard key | History (`range`/`from`/`to`, `limit`, `offset`) |
| GET    | `/api/locations/latest` | Dashboard key | Most recent fix + device status           |
| GET    | `/api/route`            | Dashboard key | Polyline points + distance/duration       |
| GET    | `/api/export`           | Dashboard key | Full-range CSV download (every fix)       |
| GET    | `/api/device`           | Dashboard key | Online/offline status for one device      |
| GET    | `/api/devices`          | Dashboard key | All known devices                         |
| GET    | `/api/stats`            | Dashboard key | Dashboard aggregates                      |

Supported `range` values: `today`, `yesterday`, `7d`, `30d`, `all`, plus explicit
`from`/`to` ISO-8601 instants for custom ranges.

**WebSocket events** (`/socket.io`): `server:hello`, `location:new`, `device:status`.

---

## How device online/offline works

A device is **ONLINE** when the backend has received a valid update within
`OFFLINE_TIMEOUT_SECONDS` (default **30 s**); otherwise it is **OFFLINE**. The status
is computed from the server's `last_seen_at`, not from the browser's socket state, so
closing a tab can never make a disconnected device look online. The backend also
watches for the transition and pushes a `device:status` event so every open dashboard
flips to OFFLINE immediately.

---

## Troubleshooting

| Symptom | Fix |
| ------- | --- |
| `401 Missing or invalid device API key` | `API_SECRET` in `secrets.h` must equal `backend/.env`. |
| ESP32 logs `begin() failed` / connection refused | Use your PC's LAN IP in `API_BASE_URL`, allow port 4000 through the firewall. |
| Dashboard shows `Waiting for GPS data…` | No fix yet — give the NEO-6M a clear view of the sky (first fix can take a minute). |
| `Rejected (0,0) coordinates` | The module has no fix. Wait for ≥4 satellites. |
| Marker never moves | Confirm uploads in the Serial Monitor; check `/api/health`. |
| Wi-Fi keeps dropping | Ensure a 2.4 GHz network; the ESP32 cannot see 5 GHz. |
| Frontend can't reach the API | Backend not running, or wrong `VITE_API_URL`/`VITE_PROXY_TARGET`. |

---

Data is sourced exclusively from your own device. Maps use OpenStreetMap and Esri
satellite tiles via Leaflet.
