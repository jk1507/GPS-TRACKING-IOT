import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../services/api.js';
import { createSocket } from '../services/socket.js';
import { useNow } from '../hooks/useNow.js';

const TrackerContext = createContext(null);

/** How often we re-read device/latest even when the socket is healthy. */
const FALLBACK_POLL_MS = 15000;

const DEFAULT_CONFIG = {
  device_id: 'GPS_TRACKING',
  device_name: 'GPS TRACKING',
  offline_timeout_seconds: 30,
  dashboard_auth_required: false,
};

const FRONTEND_HISTORY_KEY = 'gps_tracker_frontend_history';
const SIMULATION_STORAGE_KEY = 'gps_tracker_simulation_active';

// Exact GITAM Visakhapatnam target coordinates (Nirman Bhavan / ICT Bhavan)
// Center target: 17.78023604, 83.37570539
export const GITAM_BASE_LAT = 17.78023604;
export const GITAM_BASE_LNG = 83.37570539;
export const GITAM_BASE_ALT = 49.46;

// Satellites sequence: 3 sats -> after 5s: 4 sats -> after 5s: 5 sats (max fix) -> blinks & updates/resets cycle
export const SATELLITE_CYCLE = [
  { sat: 3, acc: 4.8, speed: 0.0, heading: 42, alt: 49.1, gps_fix: true, hint: 'detecting 3 satellites...' },
  { sat: 4, acc: 2.6, speed: 0.8, heading: 45, alt: 49.3, gps_fix: true, hint: '4 satellites acquired' },
  { sat: 5, acc: 1.4, speed: 1.2, heading: 48, alt: 49.46, gps_fix: true, hint: '5 satellites (max lock)' },
];

function readFrontendHistoryFromStorage() {
  try {
    const data = localStorage.getItem(FRONTEND_HISTORY_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveFrontendHistoryToStorage(history) {
  try {
    localStorage.setItem(FRONTEND_HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Ignore storage quota errors
  }
}

export function TrackerProvider({ children }) {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [device, setDevice] = useState(null);
  const [latest, setLatest] = useState(null);
  const [connection, setConnection] = useState('connecting'); // connecting | live | offline | error
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastEventAt, setLastEventAt] = useState(null);
  const [frontendHistory, setFrontendHistory] = useState(() => readFrontendHistoryFromStorage());

  // Simulation mode: allows demonstrating exact coordinates, satellite, accuracy, and live flow
  const [simulationActive, setSimulationActive] = useState(() => {
    try {
      return localStorage.getItem(SIMULATION_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [simulationStep, setSimulationStep] = useState(0);

  const socketRef = useRef(null);
  const now = useNow(1000);

  const addFrontendPoint = useCallback((location) => {
    if (!location) return;
    const lat = Number(location.latitude);
    const lng = Number(location.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
      return;
    }

    const timestamp = location.timestamp || location.created_at || new Date().toISOString();
    const id = location.id ?? `fe_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const newPoint = {
      id: String(id),
      latitude: lat,
      longitude: lng,
      altitude: location.altitude != null ? Number(location.altitude) : null,
      satellites: location.satellites != null ? Number(location.satellites) : null,
      gps_fix: location.gps_fix ?? null,
      accuracy: location.accuracy != null ? Number(location.accuracy) : null,
      speed: location.speed != null ? Number(location.speed) : null,
      heading: location.heading != null ? Number(location.heading) : null,
      wifi_connected: location.wifi_connected ?? null,
      wifi_rssi: location.wifi_rssi != null ? Number(location.wifi_rssi) : null,
      geolinker_status: location.geolinker_status ?? null,
      render_status: location.render_status ?? null,
      timestamp,
    };

    setFrontendHistory((prev) => {
      // Check for exact duplicate timestamp or last item identical coordinates + time
      if (prev.length > 0) {
        const last = prev[prev.length - 1];
        if (
          last.timestamp === newPoint.timestamp &&
          last.latitude === newPoint.latitude &&
          last.longitude === newPoint.longitude
        ) {
          return prev;
        }
      }
      const updated = [...prev, newPoint];
      saveFrontendHistoryToStorage(updated);
      return updated;
    });
  }, []);

  const clearFrontendHistory = useCallback(() => {
    setFrontendHistory([]);
    try {
      localStorage.removeItem(FRONTEND_HISTORY_KEY);
    } catch {
      // Ignore
    }
  }, []);

  const toggleSimulation = useCallback(() => {
    setSimulationActive((prev) => {
      const next = !prev;
      try {
        if (next) {
          localStorage.setItem(SIMULATION_STORAGE_KEY, 'true');
        } else {
          localStorage.removeItem(SIMULATION_STORAGE_KEY);
        }
      } catch {
        // Ignore
      }
      return next;
    });
  }, []);

  // When simulation is activated, cycle satellites: 3 -> 4 -> 5 (max) -> blinks/resets every 5 seconds
  useEffect(() => {
    if (!simulationActive) return;

    let index = 0;

    const emitPoint = (i) => {
      const step = SATELLITE_CYCLE[i % SATELLITE_CYCLE.length];
      const nowIso = new Date().toISOString();
      // Very slight coordinate drift around GITAM Nirman / ICT Bhavan
      const latDrift = ((i % 5) - 2) * 0.0000015;
      const lngDrift = (((i + 1) % 5) - 2) * 0.0000018;

      const lat = Number((GITAM_BASE_LAT + latDrift).toFixed(8));
      const lng = Number((GITAM_BASE_LNG + lngDrift).toFixed(8));
      const alt = Number((step.alt).toFixed(2));

      const simPoint = {
        id: `sim_${Date.now()}_${i}`,
        device_id: 'GPS_TRACKING',
        latitude: lat,
        longitude: lng,
        altitude: alt,
        satellites: step.sat,
        accuracy: step.acc,
        speed: step.speed,
        heading: step.heading,
        gps_fix: step.gps_fix,
        wifi_connected: true,
        wifi_rssi: -58,
        geolinker_status: 'ACTIVE_LOCKED',
        render_status: 'HIGH_PRECISION_FIX',
        hint: step.hint,
        timestamp: nowIso,
        created_at: nowIso,
      };

      setLatest(simPoint);
      setConnection('live');
      setError(null);
      setDevice((prev) => ({
        ...(prev || {}),
        device_id: 'GPS_TRACKING',
        name: 'GPS TRACKING',
        online: true,
        last_seen_at: nowIso,
        last_latitude: lat,
        last_longitude: lng,
        last_altitude: alt,
        last_satellites: step.sat,
        last_gps_fix: true,
        last_wifi_connected: true,
        last_wifi_rssi: -58,
        satellites: step.sat,
        accuracy: step.acc,
        speed: step.speed,
        heading: step.heading,
        geolinker_status: 'ACTIVE_LOCKED',
        render_status: 'HIGH_PRECISION_FIX',
      }));
      setConnection('live');
      setLastEventAt(Date.now());
      addFrontendPoint(simPoint);
      setSimulationStep(i % SATELLITE_CYCLE.length);
    };

    // Emit initial fix (3 satellites) immediately upon activation
    emitPoint(0);
    index = 0;

    // Changes every 5 seconds: 3 -> 4 -> 5 -> blinks and repeats
    const intervalId = setInterval(() => {
      index = (index + 1) % SATELLITE_CYCLE.length;
      emitPoint(index);
    }, 5000);

    return () => clearInterval(intervalId);
  }, [simulationActive, addFrontendPoint]);

  /** Re-read the device + most recent fix (used on boot, on reconnect and as a poll). */
  const refresh = useCallback(async () => {
    const [deviceRes, latestRes] = await Promise.all([api.getDevice(), api.getLatest()]);
    setDevice(deviceRes.device ?? null);
    if (latestRes.location) {
      setLatest(latestRes.location);
      addFrontendPoint(latestRes.location);
    }
    setError(null);
    setLastEventAt(Date.now());
    return { device: deviceRes.device, location: latestRes.location };
  }, [addFrontendPoint]);

  // ---- boot: public config + first snapshot ---------------------------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await api.getConfig();
        if (!cancelled && response?.config) {
          setConfig({ ...DEFAULT_CONFIG, ...response.config });
        }
      } catch {
        // Keep defaults; the dashboard still works with device_id fallbacks.
      }

      try {
        await refresh();
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load tracker state');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // ---- realtime -------------------------------------------------------------
  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnection('live');
      setLastEventAt(Date.now());
      refresh().catch(() => {});
    });

    socket.on('disconnect', () => setConnection('offline'));
    socket.on('reconnect_attempt', () => setConnection('connecting'));

    socket.on('connect_error', (err) => {
      // If demo/simulation mode is active or fallback polling works, don't show scary error banners
      setConnection((prev) => (simulationActive ? 'live' : 'error'));
      if (!simulationActive) {
        setError(`Realtime connection failed: ${err.message}`);
      }
    });

    socket.on('server:hello', (payload) => {
      if (!payload) return;
      setConfig((prev) => ({
        ...prev,
        device_id: payload.device_id ?? prev.device_id,
        device_name: payload.name ?? prev.device_name,
        offline_timeout_seconds: payload.offline_timeout_seconds ?? prev.offline_timeout_seconds,
      }));
    });

    socket.on('location:new', ({ location, device: nextDevice }) => {
      if (location) {
        setLatest(location);
        addFrontendPoint(location);
      }
      if (nextDevice) setDevice(nextDevice);
      setConnection('live');
      setError(null);
      setLastEventAt(Date.now());
    });

    socket.on('device:status', ({ device: nextDevice }) => {
      if (nextDevice) setDevice(nextDevice);
      setLastEventAt(Date.now());
    });

    return () => {
      socket.removeAllListeners();
      socket.close();
      socketRef.current = null;
    };
  }, [refresh, addFrontendPoint]);

  // ---- polling fallback (works even if WebSocket is blocked) ----------------
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      refresh().catch(() => {});
    }, FALLBACK_POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  /**
   * Device online state is derived from the SERVER's last_seen_at, never from
   * the browser's socket state, so a dashboard tab cannot fake "online".
   */
  const status = useMemo(() => {
    const timeoutSeconds =
      device?.offline_timeout_seconds ?? config.offline_timeout_seconds ?? 30;
    const lastSeenAt = device?.last_seen_at ?? null;
    const lastMs = lastSeenAt ? new Date(lastSeenAt).getTime() : null;
    const ageSeconds = lastMs ? Math.max(0, Math.round((now - lastMs) / 1000)) : null;
    const online = ageSeconds !== null && ageSeconds <= timeoutSeconds;

    return {
      online,
      lastSeenAt,
      ageSeconds,
      timeoutSeconds,
      hasData: Boolean(device?.last_seen_at || latest),
    };
  }, [device, latest, config, now]);

  const value = useMemo(
    () => ({
      config,
      device,
      latest,
      status,
      connection,
      error,
      loading,
      lastEventAt,
      refresh,
      frontendHistory,
      addFrontendPoint,
      clearFrontendHistory,
      deviceId: device?.device_id ?? config.device_id,
      deviceName: device?.name ?? config.device_name,
      simulationActive,
      toggleSimulation,
      simulationStep,
    }),
    [
      config,
      device,
      latest,
      status,
      connection,
      error,
      loading,
      lastEventAt,
      refresh,
      frontendHistory,
      addFrontendPoint,
      clearFrontendHistory,
      simulationActive,
      toggleSimulation,
      simulationStep,
    ],
  );

  return <TrackerContext.Provider value={value}>{children}</TrackerContext.Provider>;
}

export function useTracker() {
  const ctx = useContext(TrackerContext);
  if (!ctx) throw new Error('useTracker must be used inside <TrackerProvider>');
  return ctx;
}
