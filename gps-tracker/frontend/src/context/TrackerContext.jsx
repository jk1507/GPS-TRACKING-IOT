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

export function TrackerProvider({ children }) {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [device, setDevice] = useState(null);
  const [latest, setLatest] = useState(null);
  const [connection, setConnection] = useState('connecting'); // connecting | live | offline | error
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastEventAt, setLastEventAt] = useState(null);

  const socketRef = useRef(null);
  const now = useNow(1000);

  /** Re-read the device + most recent fix (used on boot, on reconnect and as a poll). */
  const refresh = useCallback(async () => {
    const [deviceRes, latestRes] = await Promise.all([api.getDevice(), api.getLatest()]);
    setDevice(deviceRes.device ?? null);
    setLatest(latestRes.location ?? null);
    setError(null);
    setLastEventAt(Date.now());
    return { device: deviceRes.device, location: latestRes.location };
  }, []);

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
      if (location) setLatest(location);
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
  }, [refresh]);

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
      deviceId: device?.device_id ?? config.device_id,
      deviceName: device?.name ?? config.device_name,
    }),
    [config, device, latest, status, connection, error, loading, lastEventAt, refresh],
  );

  return <TrackerContext.Provider value={value}>{children}</TrackerContext.Provider>;
}

export function useTracker() {
  const ctx = useContext(TrackerContext);
  if (!ctx) throw new Error('useTracker must be used inside <TrackerProvider>');
  return ctx;
}
