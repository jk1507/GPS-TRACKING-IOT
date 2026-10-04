import { Link } from 'react-router-dom';

import * as api from '../services/api.js';
import { useTracker } from '../context/TrackerContext.jsx';
import { useApiResource } from '../hooks/useApiResource.js';
import MapView from '../components/MapView.jsx';
import Icon from '../components/Icon.jsx';
import RangeFilter from '../components/RangeFilter.jsx';
import { DeviceStatusPill } from '../components/StatusPill.jsx';
import {
  EmptyState,
  ErrorBanner,
  PageHeader,
  Spinner,
  StatCard,
} from '../components/ui.jsx';

import {
  describeRange,
  formatCoord,
  formatDateTime,
  formatDistance,
  formatDuration,
  formatNumber,
  formatRelative,
  formatSpeed,
  formatTime,
} from '../utils/format.js';

import {
  defaultRange,
  rangeToQuery,
  RANGE_PRESETS,
} from '../utils/range.js';
import { appendLivePoint } from '../utils/track.js';
import { useNow } from '../hooks/useNow.js';
import { useEffect, useState } from 'react';

// Fixes that are flagged as broken, sit on (0,0), or carry a wildly
// inaccurate reading only add spikes to the trail - never draw them, so the
// dotted line keeps following the path the device really travelled.
const MAX_TRUSTED_ACCURACY_M = 75;

function isPlottable(point) {
  if (!point) return false;
  const lat = Number(point.latitude);
  const lng = Number(point.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false; // "null island" = no fix
  if (point.gps_fix === false) return false;
  const accuracy = Number(point.accuracy);
  if (Number.isFinite(accuracy) && accuracy > MAX_TRUSTED_ACCURACY_M) return false;
  return true;
}

// Is this fix inside the open tracking session? Also applied client-side so
// the previous range trail never flashes in while the session fetch is in
// flight right after Start is clicked.
function inSession(point, session) {
  if (!session) return true;
  if (!point) return false;
  const ts = new Date(point.timestamp).getTime();
  if (!Number.isFinite(ts)) return false;
  if (ts < session.from) return false;
  if (session.to != null && ts > session.to) return false;
  return true;
}

export default function Dashboard() {
  const {
    latest,
    device,
    status,
    loading: trackerLoading,
    error: trackerError,
    refresh,
  } = useTracker();

  const [range, setRange] = useState(defaultRange);

  // Tracking session: { from, to } epoch ms. `to: null` = currently recording.
  // While a session exists the map trail is scoped to Start -> Stop instead
  // of the selected date range.
  const [session, setSession] = useState(null);
  const [routeTick, setRouteTick] = useState(0);
  const [exporting, setExporting] = useState(false);

  const now = useNow(1000);
  const tracking = session != null && session.to == null;

  const {
    data: stats,
    loading: statsLoading,
    error: statsError,
    reload: reloadStats,
  } = useApiResource(
    () => api.getStats(rangeToQuery(range)),
    [range.preset, range.from, range.to],
  );

  const {
    data: history,
    loading: historyLoading,
    error: historyError,
    reload: reloadHistory,
  } = useApiResource(
    () =>
      api.getHistory({
        range: range.preset === 'custom' ? undefined : range.preset,
        ...rangeToQuery(range),
        limit: 6,
      }),
    [range.preset, range.from, range.to],
  );

  // While a session is open the route is fetched with from=Start / to=Stop so
  // only THIS trip is drawn; otherwise the selected range applies.
  const routeQuery = session
    ? {
        from: new Date(session.from).toISOString(),
        ...(session.to ? { to: new Date(session.to).toISOString() } : {}),
        limit: 2000,
      }
    : { ...rangeToQuery(range), limit: 2000 };

  const {
    data: route,
    loading: routeLoading,
    error: routeError,
    reload: reloadRoute,
  } = useApiResource(
    () => api.getRoute(routeQuery),
    [
      session?.from ?? null,
      session?.to ?? null,
      range.preset,
      range.from,
      range.to,
      routeTick,
    ],
  );

  // While recording, re-sync the session trail with the server every few
  // seconds - covers missed socket pushes without waiting for a page change.
  useEffect(() => {
    if (!tracking) return undefined;
    const id = setInterval(
      () => setRouteTick((tick) => tick + 1),
      5000,
    );
    return () => clearInterval(id);
  }, [tracking]);

  // ---------------------------------------------------------
  // Latest GPS values
  // ---------------------------------------------------------

  const latitude =
    latest?.latitude ??
    device?.last_latitude ??
    null;

  const longitude =
    latest?.longitude ??
    device?.last_longitude ??
    null;

  const satellites =
    latest?.satellites ??
    device?.last_satellites ??
    null;

  const altitude =
    latest?.altitude ??
    device?.last_altitude ??
    null;

  // ---------------------------------------------------------
  // Latest telemetry
  // ---------------------------------------------------------

  const gpsFix =
    latest?.gps_fix ??
    device?.gps_fix ??
    null;

  const wifiConnected =
    latest?.wifi_connected ??
    device?.wifi_connected ??
    null;

  const wifiRssi =
    latest?.wifi_rssi ??
    device?.wifi_rssi ??
    null;

  const geolinkerStatus =
    latest?.geolinker_status ??
    device?.geolinker_status ??
    null;

  const renderStatus =
    latest?.render_status ??
    device?.render_status ??
    null;

  const speed =
    latest?.speed ??
    null;

  const heading =
    latest?.heading ??
    null;

  const accuracy =
    latest?.accuracy ??
    null;

  const error =
    trackerError ||
    statsError?.message ||
    historyError?.message ||
    routeError?.message ||
    null;

  const retryAll = () => {
    refresh().catch(() => {});
    reloadStats();
    reloadHistory();
    reloadRoute();
  };

  // (0,0) is "null island": the ESP32 reports it when there is no fix, so it
  // must never be plotted as a real position.
  const hasCoordinates =
    latitude != null &&
    longitude != null &&
    Number.isFinite(Number(latitude)) &&
    Number.isFinite(Number(longitude));

  const isNullIsland =
    Number(latitude) === 0 && Number(longitude) === 0;

  // Explicit `gps_fix: false` from the device, or the tell-tale (0,0) pair.
  const noGpsFix =
    gpsFix === false || (hasCoordinates && isNullIsland);

  const hasFix =
    hasCoordinates && !isNullIsland && gpsFix !== false;  const nearby = (route?.points ?? [])
    .filter((point) => isPlottable(point) && inSession(point, session))
    .slice(-300);

  const markerPoint = hasFix
    ? {
        ...latest,
        latitude,
        longitude,
        timestamp: latest?.timestamp ?? device?.last_seen_at ?? null,
      }
    : null;

  // Grow the dotted trail with each fix that arrives over the socket - but
  // only while recording; a stopped session stays frozen so the completed
  // route can be reviewed. (No session = classic range trail + live growth.)
  const livePoint = inSession(markerPoint, session)
    ? markerPoint
    : null;

  const nearbyPath = tracking || !session
    ? appendLivePoint(nearby, livePoint)
    : nearby;

  const startTracking = () =>
    setSession({ from: Date.now(), to: null });

  const stopTracking = () =>
    setSession((prev) =>
      prev ? { ...prev, to: Date.now() } : prev,
    );

  const clearSession = () => setSession(null);

  // Streams the whole selected range as CSV (same endpoint as the
  // History page, so you can export straight from the dashboard).
  const exportCsv = async () => {
    setExporting(true);
    try {
      await api.downloadHistoryCsv(rangeToQuery(range));
    } catch (err) {
      // eslint-disable-next-line no-alert
      window.alert(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const sessionSeconds = session
    ? Math.max(
        0,
        Math.floor(
          ((session.to ?? now) - session.from) / 1000,
        ),
      )
    : 0;

  // Stat cards follow the map's scope: trip stats while a session is open,
  // otherwise the selected range (presets get their friendly label).
  const rangeLabel =
    range.preset === 'custom'
      ? describeRange({ from: range.from || null, to: range.to || null })
      : RANGE_PRESETS.find((preset) => preset.value === range.preset)
          ?.label ?? describeRange(range);

  const scopeLabel = session ? 'this trip' : rangeLabel;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Live telemetry from your ESP32 + NEO-6M tracker"
        actions={
          <>
            <span className="hidden sm:inline-flex">
              <DeviceStatusPill />
            </span>

            {session ? (
              <span
                className={`chip ${
                  tracking
                    ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    tracking
                      ? 'animate-pulse bg-rose-500'
                      : 'bg-slate-400'
                  }`}
                />
                {tracking
                  ? `Tracking ${formatDuration(sessionSeconds)}`
                  : `Trip ${formatDuration(sessionSeconds)}`}
              </span>
            ) : null}

            <button
              type="button"
              onClick={tracking ? stopTracking : startTracking}
              className={`btn btn-sm ${
                tracking
                  ? 'bg-rose-500 text-white hover:bg-rose-400'
                  : 'btn-outline'
              }`}
              title={
                tracking
                  ? 'Stop recording this trip'
                  : 'Start recording the route'
              }
            >
              <Icon
                name={tracking ? 'stop' : 'play'}
                size={12}
              />
              {tracking ? 'Stop' : 'Start tracking'}
            </button>

            {!tracking && session ? (
              <button
                type="button"
                onClick={clearSession}
                className="btn btn-ghost btn-sm"
                title="Clear the trip and show the selected range again"
              >
                <Icon name="refresh" size={13} />
                Clear
              </button>
            ) : null}

            <button
              type="button"
              onClick={exportCsv}
              className="btn btn-outline btn-sm"
              disabled={
                exporting ||
                (stats != null && !(stats.locations_recorded > 0))
              }
              title="Download every fix in the selected range as CSV"
            >
              <Icon name="download" size={14} />
              {exporting ? 'Exporting…' : 'CSV'}
            </button>

            <RangeFilter
              value={range}
              onChange={setRange}
            />
          </>
        }
      />

      <ErrorBanner
        message={error}
        onRetry={retryAll}
        className="mb-4"
      />

      {/* ---------------------------------------------------------
          Offline / no-data notices
      --------------------------------------------------------- */}

      {!error &&
      status.hasData &&
      !status.online ? (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          <Icon
            name="wifiOff"
            size={18}
          />

          <p>
            <span className="font-semibold">
              Device Offline
            </span>{' '}
            - last update{' '}
            {formatRelative(status.lastSeenAt)}
            {' '}
            (timeout {status.timeoutSeconds}s).
          </p>
        </div>
      ) : null}

      {!error &&
      !status.hasData &&
      !trackerLoading ? (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
          <Icon
            name="radio"
            size={18}
            className="animate-pulse"
          />

          <p>
            Waiting for GPS data&hellip; Start the ESP32
            and POST a fix to /api/location.
          </p>
        </div>
      ) : null}

      {!error &&
      !trackerLoading &&
      status.hasData &&
      noGpsFix ? (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
          <Icon
            name="crosshair"
            size={18}
            className="mt-0.5 shrink-0 animate-pulse"
          />

          <div>
            <p className="font-semibold">
              No GPS fix
            </p>

            <p className="mt-0.5">
              The tracker is reporting, but has not locked onto
              satellites yet
              {satellites != null
                ? ` (${satellites} sats)`
                : ''}
              . Position data is unavailable until it acquires a
              fix &mdash; move it outdoors or near a window.
            </p>
          </div>
        </div>
      ) : null}

      {/* ---------------------------------------------------------
          Main stat cards
      --------------------------------------------------------- */}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Latitude"
          value={hasFix ? formatCoord(latitude) : null}
          icon="navigation"
          tone="brand"
          loading={trackerLoading}
          hint={
            hasFix
              ? 'decimal degrees'
              : noGpsFix
                ? 'no fix'
                : undefined
          }
        />

        <StatCard
          label="Longitude"
          value={hasFix ? formatCoord(longitude) : null}
          icon="navigation"
          tone="brand"
          loading={trackerLoading}
          hint={
            hasFix
              ? 'decimal degrees'
              : noGpsFix
                ? 'no fix'
                : undefined
          }
        />

        <StatCard
          label="Satellites"
          value={satellites ?? null}
          unit="sats"
          icon="satellite"
          loading={trackerLoading}
          hint={
            noGpsFix
              ? 'no fix'
              : satellites != null
                ? satellites >= 4
                  ? 'valid fix'
                  : 'weak fix'
                : undefined
          }
        />

        <StatCard
          label="Altitude"
          value={
            altitude != null
              ? Number(altitude).toFixed(1)
              : null
          }
          unit="m"
          icon="altitude"
          loading={trackerLoading}
        />

        <StatCard
          label="Last Update"
          value={
            status.lastSeenAt
              ? formatRelative(status.lastSeenAt)
              : null
          }
          icon="clock"
          loading={trackerLoading}
          hint={
            status.lastSeenAt
              ? formatDateTime(status.lastSeenAt)
              : undefined
          }
        />

        <StatCard
          label="Tracking Time"
          value={formatDuration(
            stats?.tracking_duration_seconds,
          )}
          icon="activity"
          loading={statsLoading}
          hint="since first fix"
        />

        <StatCard
          label="Locations Recorded"
          value={formatNumber(
            stats?.locations_recorded,
          )}
          icon="list"
          loading={statsLoading}
          hint={rangeLabel}
        />

        <StatCard
          label="Distance"
          value={
            route?.distance_meters != null
              ? formatDistance(
                  route.distance_meters,
                )
              : null
          }
          icon="route"
          loading={routeLoading}
          hint={`${route?.count ?? 0} points · ${scopeLabel}`}
        />

        <StatCard
          label="Speed"
          value={speed != null ? formatSpeed(speed) : null}
          icon="bolt"
          tone="brand"
          loading={trackerLoading}
          hint={
            heading != null
              ? `heading ${Math.round(heading)}\u00b0`
              : 'live GPS speed'
          }
        />

        <StatCard
          label="Max Speed"
          value={
            route?.max_speed_mps != null
              ? formatSpeed(route.max_speed_mps)
              : null
          }
          icon="activity"
          loading={routeLoading}
          hint={scopeLabel}
        />

        <StatCard
          label="Avg Speed"
          value={
            route?.avg_speed_mps != null
              ? formatSpeed(route.avg_speed_mps)
              : null
          }
          icon="activity"
          loading={routeLoading}
          hint={
            route?.avg_speed_mps != null
              ? 'while moving'
              : scopeLabel
          }
        />
      </div>

      {/* ---------------------------------------------------------
          LIVE TELEMETRY
      --------------------------------------------------------- */}

      <div className="mt-5 card p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Live Telemetry
            </h2>

            <p className="mt-0.5 text-xs text-slate-400">
              Current ESP32 and GPS status
            </p>
          </div>

          <Link
            to="/device"
            className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            Full device details &rarr;
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">

          {/* GPS FIX */}
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-[11px] text-slate-400">
              GPS Fix
            </p>

            <p
              className={`mt-1 text-sm font-semibold ${
                gpsFix === true
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : gpsFix === false
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-400'
              }`}
            >
              {gpsFix === true
                ? 'VALID'
                : gpsFix === false
                  ? 'NO FIX'
                  : '—'}
            </p>
          </div>

          {/* WIFI */}
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-[11px] text-slate-400">
              Wi-Fi
            </p>

            <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
              {wifiConnected === true
                ? 'CONNECTED'
                : wifiConnected === false
                  ? 'OFFLINE'
                  : '—'}
            </p>
          </div>

          {/* RSSI */}
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-[11px] text-slate-400">
              Wi-Fi RSSI
            </p>

            <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
              {wifiRssi != null
                ? `${Number(wifiRssi)} dBm`
                : '—'}
            </p>
          </div>

          {/* ACCURACY */}
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-[11px] text-slate-400">
              Accuracy
            </p>

            <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
              {accuracy != null
                ? `${Number(accuracy).toFixed(1)} m`
                : '—'}
            </p>
          </div>

          {/* SPEED */}
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-[11px] text-slate-400">
              Speed
            </p>

            <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
              {formatSpeed(speed)}
            </p>
          </div>

          {/* GEO LINKER */}
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-[11px] text-slate-400">
              GeoLinker
            </p>

            <p className="mt-1 truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
              {geolinkerStatus ?? '—'}
            </p>
          </div>

          {/* RENDER */}
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-[11px] text-slate-400">
              Render API
            </p>

            <p className="mt-1 truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
              {renderStatus ?? '—'}
            </p>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------
          MAP + RECENT FIXES
      --------------------------------------------------------- */}

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Live position
              </h2>

              {tracking && nearbyPath.length < 2 ? (
                <span className="chip bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
                  Recording &mdash; waiting for fixes
                </span>
              ) : null}
            </div>

            <Link
              to="/map"
              className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              Open live map &rarr;
            </Link>
          </div>

          <MapView
            marker={markerPoint}
            path={nearbyPath}
            online={status.online}
            follow
            loading={trackerLoading}
            emptyMessage={
              noGpsFix
                ? 'No GPS fix yet'
                : undefined
            }
            className="h-[46vh] min-h-[320px]"
          />
        </div>

        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Recent fixes
            </h2>

            <Link
              to="/history"
              className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              All history &rarr;
            </Link>
          </div>

          {historyLoading ? (
            <div className="flex items-center justify-center py-10 text-slate-400">
              <Spinner />
            </div>
          ) : (history?.locations ?? []).length === 0 ? (
            <EmptyState
              icon="history"
              title="No locations yet"
              description="Fixes will appear here once the device starts posting."
            />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {(history?.locations ?? []).map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-slate-700 dark:text-slate-200">
                      {formatCoord(
                        item.latitude,
                        5,
                      )}
                      ,{' '}
                      {formatCoord(
                        item.longitude,
                        5,
                      )}
                    </p>

                    <p className="text-[11px] text-slate-400">
                      {item.satellites ?? '—'} sats
                      {' · '}
                      {item.altitude != null
                        ? `${Number(
                            item.altitude,
                          ).toFixed(0)} m`
                        : 'n/a'}
                    </p>
                  </div>

                  <span className="shrink-0 font-mono text-[11px] text-slate-400">
                    {formatTime(item.timestamp)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}