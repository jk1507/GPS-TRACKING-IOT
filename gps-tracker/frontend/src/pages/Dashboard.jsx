import { Link } from 'react-router-dom';

import * as api from '../services/api.js';
import { useTracker } from '../context/TrackerContext.jsx';
import { useApiResource } from '../hooks/useApiResource.js';
import MapView from '../components/MapView.jsx';
import Icon from '../components/Icon.jsx';
import RangeFilter from '../components/RangeFilter.jsx';
import { DeviceStatusPill } from '../components/StatusPill.jsx';
import { EmptyState, ErrorBanner, PageHeader, Spinner, StatCard } from '../components/ui.jsx';
import {
  describeRange,
  formatCoord,
  formatDateTime,
  formatDistance,
  formatDuration,
  formatNumber,
  formatRelative,
  formatTime,
} from '../utils/format.js';
import { defaultRange, rangeToQuery } from '../utils/range.js';
import { useState } from 'react';

export default function Dashboard() {
  const { latest, device, status, loading: trackerLoading, error: trackerError, refresh } = useTracker();
  const [range, setRange] = useState(defaultRange);

  const {
    data: stats,
    loading: statsLoading,
    error: statsError,
    reload: reloadStats,
  } = useApiResource(() => api.getStats(rangeToQuery(range)), [range.preset, range.from, range.to]);

  const {
    data: history,
    loading: historyLoading,
    error: historyError,
    reload: reloadHistory,
  } = useApiResource(
    () => api.getHistory({ range: range.preset === 'custom' ? undefined : range.preset, ...rangeToQuery(range), limit: 6 }),
    [range.preset, range.from, range.to],
  );

  const {
    data: route,
    loading: routeLoading,
  } = useApiResource(
    () => api.getRoute({ range: range.preset === 'custom' ? undefined : range.preset, ...rangeToQuery(range), limit: 2000 }),
    [range.preset, range.from, range.to],
  );

  const latitude = latest?.latitude ?? device?.last_latitude ?? null;
  const longitude = latest?.longitude ?? device?.last_longitude ?? null;
  const satellites = latest?.satellites ?? device?.last_satellites ?? null;
  const altitude = latest?.altitude ?? device?.last_altitude ?? null;

  const error = trackerError || statsError?.message || historyError?.message || null;
  const retryAll = () => {
    refresh().catch(() => {});
    reloadStats();
    reloadHistory();
  };

  const hasFix = Number.isFinite(latitude) && Number.isFinite(longitude);
  const nearby = route?.points?.slice(-300) ?? [];

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
            <RangeFilter value={range} onChange={setRange} />
          </>
        }
      />

      <ErrorBanner message={error} onRetry={retryAll} className="mb-4" />

      {/* Offline / no-data notices */}
      {!error && status.hasData && !status.online ? (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          <Icon name="wifiOff" size={18} />
          <p>
            <span className="font-semibold">Device Offline</span> - last update{' '}
            {formatRelative(status.lastSeenAt)} (timeout {status.timeoutSeconds}s).
          </p>
        </div>
      ) : null}

      {!error && !status.hasData && !trackerLoading ? (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
          <Icon name="radio" size={18} className="animate-pulse" />
          <p>Waiting for GPS data&hellip; Start the ESP32 and POST a fix to /api/location.</p>
        </div>
      ) : null}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Latitude" value={formatCoord(latitude)} icon="navigation" tone="brand" loading={trackerLoading} hint={hasFix ? 'decimal degrees' : undefined} />
        <StatCard label="Longitude" value={formatCoord(longitude)} icon="navigation" tone="brand" loading={trackerLoading} hint={hasFix ? 'decimal degrees' : undefined} />
        <StatCard label="Satellites" value={satellites ?? null} unit="sats" icon="satellite" loading={trackerLoading} hint={satellites != null ? (satellites >= 4 ? 'valid fix' : 'weak fix') : undefined} />
        <StatCard label="Altitude" value={altitude != null ? Number(altitude).toFixed(1) : null} unit="m" icon="altitude" loading={trackerLoading} />

        <StatCard label="Last Update" value={status.lastSeenAt ? formatRelative(status.lastSeenAt) : null} icon="clock" loading={trackerLoading} hint={status.lastSeenAt ? formatDateTime(status.lastSeenAt) : undefined} />
        <StatCard label="Tracking Time" value={formatDuration(stats?.tracking_duration_seconds)} icon="activity" loading={statsLoading} hint="since first fix" />
        <StatCard label="Locations Recorded" value={formatNumber(stats?.locations_recorded)} icon="list" loading={statsLoading} hint={describeRange(range)} />
        <StatCard label="Distance" value={route?.distance_meters != null ? formatDistance(route.distance_meters) : null} icon="route" loading={routeLoading} hint={`${route?.count ?? 0} points tracked`} />
      </div>

      {/* Map + recent */}
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Live position</h2>
            <Link to="/map" className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">
              Open live map &rarr;
            </Link>
          </div>
          <MapView
            marker={hasFix ? { ...latest, latitude, longitude } : null}
            path={nearby}
            online={status.online}
            follow
            loading={trackerLoading}
            className="h-[46vh] min-h-[320px]"
          />
        </div>

        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Recent fixes</h2>
            <Link to="/history" className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">
              All history &rarr;
            </Link>
          </div>

          {historyLoading ? (
            <div className="flex items-center justify-center py-10 text-slate-400">
              <Spinner />
            </div>
          ) : (history?.locations ?? []).length === 0 ? (
            <EmptyState icon="history" title="No locations yet" description="Fixes will appear here once the device starts posting." />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {(history?.locations ?? []).map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-slate-700 dark:text-slate-200">
                      {formatCoord(item.latitude, 5)}, {formatCoord(item.longitude, 5)}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {item.satellites ?? '\u2014'} sats &middot; {item.altitude != null ? `${Number(item.altitude).toFixed(0)} m` : 'n/a'}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-slate-400">{formatTime(item.timestamp)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
