# Architecture

File-by-file map of **gps-tracker**, grouped by layer, with one-line responsibilities
and how the pieces connect.

## Data flow (the spine)

```
ESP32 (NEO-6M, NMEA) ──HTTP POST /api/location (Bearer key)──▶ Express
   └─ validate → trackerService → models → database (SQLite/PG)
                                       └─ broadcast ─▶ Socket.IO ─▶ React dashboard
React reads history/route/stats via REST ──▶ same Express routes
```

One direction for writes (device -> DB -> socket), one for reads (browser -> REST + socket).

---

## ESP32 (device)

- **`esp32/gps_tracker.ino`** — Reads NMEA over UART1, parses GGA/RMC, builds JSON, POSTs
  a fix every 10s (only with a valid fix and >=4 satellites), drives the LED, retries and
  reconnects Wi-Fi. The sole producer of real data.
- **`esp32/secrets.h.example`** — Template for Wi-Fi / `API_BASE_URL` / `API_SECRET` /
  `DEVICE_ID`; copied to the gitignored `secrets.h`.

## Backend — entry & wiring

- **`server.js`** — Boots everything: builds the Express app (helmet/cors/morgan), mounts
  `/api`, creates the HTTP server + Socket.IO, starts the offline-watcher, handles graceful
  shutdown. The assembly point.
- **`config/index.js`** — Parses `.env` into a single `config` object; `assertConfig()`
  fails fast on bad/missing secrets. Every module imports this.
- **`routes/index.js`** — Builds the `/api` router: `/health`, `/config`, then mounts the
  location/device/stats route files.

## Backend — HTTP layer

- **`routes/locationRoutes.js`** — Maps ingest `POST /location` (+`ingestLimiter`,
  `requireDeviceAuth`) and reads `GET /locations`, `/locations/latest`, `/route`
  (`requireDashboardAuth`).
- **`routes/deviceRoutes.js`** — `GET /device`, `GET /devices` (dashboard-auth).
- **`routes/statsRoutes.js`** — `GET /stats` (dashboard-auth).
- **`controllers/locationController.js`** — Parses/validates the ingest body, calls
  `trackerService`, returns 201; serves history/route/latest reads.
- **`controllers/deviceController.js`** — Returns one device's live status or all devices'
  statuses.
- **`controllers/statsController.js`** — Dashboard aggregates + public non-secret `/config`.

## Backend — business logic

- **`services/trackerService.js`** — The core: computes device ONLINE/OFFLINE,
  `ingestLocation` (ensure device -> insert -> touch -> broadcast), `getHistory`,
  `getRoute`, `getDashboardStats`. Controllers never touch models directly for logic.

## Backend — data layer

- **`models/deviceModel.js`** — CRUD for the `devices` table (ensure/touch/get/list + first
  fix time). Caches the last-known position for fast reads.
- **`models/locationModel.js`** — Insert/list/count/aggregate queries on `locations`, shared
  range filter, engine-agnostic `?` placeholders.
- **`database/index.js`** — Single data-access abstraction over SQLite & PostgreSQL
  (`query`, `queryOne`, `transaction`, schema apply). The only module that talks to a DB
  driver.
- **`database/migrate.js`** — CLI that applies the schema and records `schema_migrations`.
- **`database/schema.sqlite.sql` / `schema.postgres.sql`** — Mirror-image table definitions
  (`devices`, `locations`, `schema_migrations`).

## Backend — middleware & utils

- **`middleware/auth.js`** — `requireDeviceAuth` (write key) and `requireDashboardAuth`
  (optional read key), constant-time compare.
- **`middleware/asyncHandler.js`** — Wraps async routes so rejected promises reach the error
  handler.
- **`middleware/errorHandler.js`** — `ApiError` class, 404 handler, central error responder,
  request meta.
- **`middleware/rateLimit.js`** — Global + tighter ingest rate limiters.
- **`utils/validation.js`** — Validates the ingest payload, normalizes fields, rejects (0,0).
- **`utils/range.js`** — Turns `range`/`from`/`to` query params into concrete ISO ranges;
  clamps ints.
- **`utils/time.js`** — Timestamp normalization (naive -> UTC), seconds-between, number
  coercion.
- **`utils/geo.js`** — Haversine distance + path length.
- **`utils/logger.js`** — Tiny timestamped logger used across the backend.
- **`realtime/socket.js`** — Creates Socket.IO, optional auth, emits `server:hello`,
  `location:new`, `device:status`. The bridge to the browser.
- **`scripts/smoke.js`** — End-to-end REST test against a running backend.

## Frontend — entry & plumbing

- **`main.jsx`** — React root; wraps
  `<BrowserRouter><ThemeProvider><TrackerProvider><App/></TrackerProvider></ThemeProvider></BrowserRouter>`.
- **`App.jsx`** — Route table mapping pages under `<Layout>`.
- **`services/api.js`** — `fetch` wrapper for all REST reads; injects the optional dashboard
  key, defines `ApiError`.
- **`services/socket.js`** — Creates the Socket.IO client (same base URL, auth token).
- **`context/TrackerContext.jsx`** — The heart: boot config + snapshot, subscribe to socket
  events, 15s polling fallback, derives ONLINE/OFFLINE from server `last_seen_at`. Every
  page consumes `useTracker`.
- **`context/ThemeContext.jsx`** — Dark/light theme in `localStorage`.

## Frontend — hooks & utils

- **`hooks/useApiResource.js`** — Generic fetch-with-deps/loading/error/reload hook used by
  pages.
- **`hooks/useNow.js`** — Ticking clock so offline status re-evaluates.
- **`utils/format.js`** — Date/duration/distance/coord formatters.
- **`utils/range.js`** — Range presets + converting a UI range into an API query.
- **`utils/track.js`** — Travel analysis: haversine distance, stop detection (splits the
  track into legs between stops) and appending live socket fixes to the drawn trail.

## Frontend — components

- **`components/Layout.jsx`** — Sidebar/nav/header shell, wraps pages via `<Outlet>`; theme
  toggle + refresh + status pills.
- **`components/MapView.jsx`** — Leaflet map (OSM/Esri only): dotted travel-flow trail
  split into legs between detected stops, start/stop/current pins with popups, accuracy
  circle, follow/fit controls, legend, and four detail layers (street, terrain, satellite,
  hybrid). Used by Dashboard, LiveMap, History, Route, Device.
- **`components/StatusPill.jsx`** — ONLINE/OFFLINE badge and realtime-connection pill.
- **`components/RangeFilter.jsx`** — Preset/custom date-range picker.
- **`components/ui.jsx`** — Shared primitives (`StatCard`, `PageHeader`, `InfoRow`,
  `EmptyState`, `ErrorBanner`, `Spinner`, `Badge`).
- **`components/Icon.jsx`** — Inline SVG icon set.

## Frontend — pages

All pages consume `TrackerContext` and/or `useApiResource`.

- **`pages/Dashboard.jsx`** — Stat cards + live map + recent fixes.
- **`pages/LiveMap.jsx`** — Big live map + current-fix/route side panels.
- **`pages/History.jsx`** — Paginated table, CSV export, optional map.
- **`pages/Route.jsx`** — Track polyline + distance/duration stats.
- **`pages/Device.jsx`** — Device identity, connectivity, records, mini map.
- **`pages/Settings.jsx`** — Theme, connection info, copyable ingest `curl`.

## Config & build

- **`vite.config.js`** — Dev server proxies `/api` + `/socket.io` to `:4000` (single origin,
  no CORS). Pages reach the backend through it.
- **`tailwind.config.js` / `postcss.config.js` / `index.css`** — Styling system (brand
  palette, dark mode, Leaflet theming, marker animation).
- **`index.html`** — SPA shell; applies the saved theme before first paint.
- **`.env.example` files, `.gitignore`, `README.md`** — Setup templates, secret exclusions,
  docs.

---

## Key interconnection rule

- **Backend:** `server.js` -> `routes` -> `controllers` -> `services` -> `models` ->
  `database`.
- **Frontend:** `main.jsx` -> providers -> `App` -> pages -> (`services` / `components`).
- **Cross-cutting:** Socket.IO is the only shortcut — backend `realtime/socket.js` pushes,
  frontend `TrackerContext` receives.
