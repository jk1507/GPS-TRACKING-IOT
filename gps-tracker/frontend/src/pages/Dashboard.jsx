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

import { defaultRange, rangeToQuery } from '../utils/range.js';
import { appendLivePoint } from '../utils/track.js';
import { useState } from 'react';

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

  const {
    data: route,
    loading: routeLoading,
  } = useApiResource(
    () =>
      api.getRoute({
        range: range.preset === 'custom' ? undefined : range.preset,
        ...rangeToQuery(range),
        limit: 2000,
      }),
    [range.preset, range.from, range.to],
  );

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
    null;

  const retryAll = () => {
    refresh().catch(() => {});
    reloadStats();
    reloadHistory();
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
    hasCoordinates && !isNullIsland && gpsFix !== false;

  const nearby =
    route?.points?.slice(-300) ?? [];

  const markerPoint = hasFix
    ? {
        ...latest,
        latitude,
        longitude,
        timestamp: latest?.timestamp ?? device?.last_seen_at ?? null,
      }
    : null;

  // Grow the dotted trail with each fix that arrives over the socket.
  const nearbyPath = appendLivePoint(nearby, markerPoint);

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
          hint={describeRange(range)}
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
          hint={`${route?.count ?? 0} points tracked`}
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
          hint={describeRange(range)}
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
          hint="while moving"
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
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Live position
            </h2>

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