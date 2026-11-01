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

// High-precision coordinates at GITAM Vizag (Nirman Bhavan / ICT Bhavan)
// Matching 17.78023604, 83.37570539
export const GITAM_DUMMY_ROUTE = [
  { lat: 17.780180, lng: 83.375620, alt: 48.2, speed: 0.0, heading: 45, sat: 9, acc: 2.1, desc: 'Nirman Bhavan Parking (Stationary)' },
  { lat: 17.780210, lng: 83.375665, alt: 48.8, speed: 1.8, heading: 50, sat: 10, acc: 1.8, desc: 'Moving towards ICT Bhavan' },
  { lat: 17.78023604, lng: 83.37570539, alt: 49.46, speed: 3.4, heading: 55, sat: 11, acc: 1.4, desc: 'Exact GITAM Target Pin (Nirman Bhavan / ICT Bhavan)' },
  { lat: 17.780275, lng: 83.375765, alt: 49.8, speed: 4.2, heading: 58, sat: 11, acc: 1.5, desc: 'Passing Nirman Bhavan Walkway' },
  { lat: 17.780315, lng: 83.375830, alt: 50.1, speed: 4.6, heading: 60, sat: 12, acc: 1.2, desc: 'ICT Bhavan Entrance Road' },
  { lat: 17.780360, lng: 83.375910, alt: 50.5, speed: 5.1, heading: 62, sat: 12, acc: 1.1, desc: 'ICT Bhavan Courtyard' },
  { lat: 17.780410, lng: 83.376000, alt: 50.9, speed: 4.0, heading: 65, sat: 12, acc: 1.2, desc: 'ICT Bhavan Main Portico' },
  { lat: 17.780445, lng: 83.376080, alt: 51.2, speed: 2.1, heading: 70, sat: 11, acc: 1.3, desc: 'Campus Boulevard' },
  { lat: 17.780470, lng: 83.376135, alt: 51.4, speed: 0.0, heading: 70, sat: 12, acc: 1.1, desc: 'Campus Plaza (Arrived)' }
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

  // When simulation is activated, periodically push high-accuracy GITAM coordinates
  useEffect(() => {
    if (!simulationActive) return;

    let index = 0;

    const emitPoint = (i) => {
      const pt = GITAM_DUMMY_ROUTE[i % GITAM_DUMMY_ROUTE.length];
      const nowIso = new Date().toISOString();
      const simPoint = {
        id: `sim_${Date.now()}_${i}`,
        device_id: 'GPS_TRACKING',
        latitude: pt.lat,
        longitude: pt.lng,
        altitude: pt.alt,
        satellites: pt.sat,
        accuracy: pt.acc,
        speed: pt.speed,
        heading: pt.heading,
        gps_fix: true,
        wifi_connected: true,
        wifi_rssi: -58,
        geolinker_status: 'ACTIVE_LOCKED',
        render_status: 'HIGH_PRECISION_FIX',
        timestamp: nowIso,
        created_at: nowIso,
        note: pt.desc,
      };

      setLatest(simPoint);
      setDevice((prev) => ({
        ...(prev || {}),
        device_id: 'GPS_TRACKING',
        name: 'GPS TRACKING (GITAM VIZAG DEMO)',
        online: true,
        last_seen_at: nowIso,
        last_latitude: pt.lat,
        last_longitude: pt.lng,
        last_altitude: pt.alt,
        last_satellites: pt.sat,
        last_gps_fix: true,
        last_wifi_connected: true,
        last_wifi_rssi: -58,
        satellites: pt.sat,
        accuracy: pt.acc,
        speed: pt.speed,
        heading: pt.heading,
        geolinker_status: 'ACTIVE_LOCKED',
        render_status: 'HIGH_PRECISION_FIX',
      }));
      setConnection('live');
      setLastEventAt(Date.now());
      addFrontendPoint(simPoint);
      setSimulationStep(i % GITAM_DUMMY_ROUTE.length);
    };

    // Emit target point immediately upon activation
    emitPoint(2); // Index 2 is the exact 17.78023604, 83.37570539 coordinate!
    index = 2;

    const intervalId = setInterval(() => {
      index = (index + 1) % GITAM_DUMMY_ROUTE.length;
      emitPoint(index);
    }, 4000);

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
      setConnection('error');
      setError(`Realtime connection failed: ${err.message}`);
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
