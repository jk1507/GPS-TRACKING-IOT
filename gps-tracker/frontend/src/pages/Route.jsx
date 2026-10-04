import { useMemo } from 'react';

import { useTracker } from '../context/TrackerContext.jsx';
import MapView from '../components/MapView.jsx';
import Icon from '../components/Icon.jsx';
import { DeviceStatusPill } from '../components/StatusPill.jsx';
import { EmptyState, PageHeader, StatCard } from '../components/ui.jsx';
import { formatDateTime, formatDistance, formatDuration } from '../utils/format.js';
import { pathDistanceMeters } from '../utils/track.js';

export default function RoutePlanner() {
  const { frontendHistory, latest, status, clearFrontendHistory } = useTracker();

  const path = useMemo(() => {
    return (frontendHistory || []).filter(
      (p) => Number.isFinite(Number(p?.latitude)) && Number.isFinite(Number(p?.longitude)),
    );
  }, [frontendHistory]);

  const distanceMeters = useMemo(() => pathDistanceMeters(path), [path]);

  const durationSeconds = useMemo(() => {
    if (path.length < 2) return 0;
    const firstMs = new Date(path[0].timestamp).getTime();
    const lastMs = new Date(path[path.length - 1].timestamp).getTime();
    if (Number.isNaN(firstMs) || Number.isNaN(lastMs)) return 0;
    return Math.max(0, Math.round((lastMs - firstMs) / 1000));
  }, [path]);

  const firstAt = path.length ? path[0].timestamp : null;
  const lastAt = path.length ? path[path.length - 1].timestamp : null;

  return (
    <div>
      <PageHeader
        title="Frontend Route & Path"
        subtitle="Realtime GPS points connected chronologically on the map"
        actions={
          path.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Clear stored frontend route history?')) {
                  clearFrontendHistory();
                }
              }}
              className="btn btn-outline btn-sm text-rose-600 border-rose-200 hover:bg-rose-50 dark:border-rose-900/50 dark:hover:bg-rose-950/30"
            >
              <Icon name="trash" size={14} />
              Clear Route
            </button>
          ) : null
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Total Points" value={path.length} icon="route" />
        <StatCard
          label="Distance"
          value={distanceMeters > 0 ? formatDistance(distanceMeters) : '0 m'}
          icon="activity"
          tone="brand"
        />
        <StatCard
          label="Duration"
          value={formatDuration(durationSeconds)}
          icon="clock"
        />
        <StatCard
          label="Last Fix"
          value={lastAt ? formatDateTime(lastAt) : null}
          icon="navigation"
        />
      </div>

      {path.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="route"
            title="No frontend GPS route points recorded yet"
            description="As soon as GPS fixes are received from the ESP32, they will appear as visible markers connected by a route line in realtime."
          />
        </div>
      ) : (
        <>
          <MapView
            marker={latest || (path.length ? path[path.length - 1] : null)}
            path={path}
            online={status.online}
            showPointMarkers
            autoFit
            className="h-[62vh] min-h-[400px]"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span>
              {formatDateTime(firstAt)} &rarr; {formatDateTime(lastAt)}
            </span>
            <span className="inline-flex items-center gap-2">
              <DeviceStatusPill />
            </span>
          </div>
        </>
      )}
    </div>
  );
}
