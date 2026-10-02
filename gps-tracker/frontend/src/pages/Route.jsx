import { useState } from 'react';

import * as api from '../services/api.js';
import { useApiResource } from '../hooks/useApiResource.js';
import RangeFilter from '../components/RangeFilter.jsx';
import MapView from '../components/MapView.jsx';
import Icon from '../components/Icon.jsx';
import { DeviceStatusPill } from '../components/StatusPill.jsx';
import { EmptyState, ErrorBanner, PageHeader, Spinner, StatCard } from '../components/ui.jsx';
import { formatDateTime, formatDistance, formatDuration } from '../utils/format.js';
import { defaultRange, rangeToQuery } from '../utils/range.js';

export default function RoutePlanner() {
  const [range, setRange] = useState(() => ({ preset: 'today', from: '', to: '' }));

  const { data, loading, error, reload } = useApiResource(
    () => api.getRoute({ ...rangeToQuery(range), limit: 5000 }),
    [range.preset, range.from, range.to],
  );

  const points = data?.points ?? [];
  // Keep timestamp + speed so MapView can split the trail at stops.
  const path = points;

  const showToday = () => {
    setRange({ preset: 'today', from: '', to: '' });
    // Force a refetch even if the preset was already "today".
    reload();
  };

  return (
    <div>
      <PageHeader
        title="Tracking Path"
        subtitle="Where your device travelled over the selected period"
        actions={
          <>
            <button type="button" onClick={showToday} className="btn btn-primary btn-sm">
              <Icon name="route" size={14} />
              Show Today&apos;s Route
            </button>
            <RangeFilter value={range} onChange={setRange} />
          </>
        }
      />

      <ErrorBanner message={error?.message} onRetry={reload} className="mb-4" />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Points" value={data?.count ?? 0} icon="route" loading={loading} />
        <StatCard
          label="Distance"
          value={data?.distance_meters != null ? formatDistance(data.distance_meters) : null}
          icon="activity"
          tone="brand"
          loading={loading}
        />
        <StatCard
          label="Duration"
          value={formatDuration(data?.duration_seconds ?? 0)}
          icon="clock"
          loading={loading}
        />
        <StatCard
          label="Last Point"
          value={data?.last_at ? formatDateTime(data.last_at) : null}
          icon="navigation"
          loading={loading}
        />
      </div>

      {loading ? (
        <div className="card flex items-center justify-center py-24 text-slate-400">
          <Spinner />
        </div>
      ) : points.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="route"
            title="No route in this range"
            description="Pick a wider range or record some movement first. The path is drawn from the GPS fixes stored in the database."
            action={
              <button type="button" onClick={showToday} className="btn btn-outline btn-sm mt-1">
                Show Today&apos;s Route
              </button>
            }
          />
        </div>
      ) : (
        <>
          <MapView marker={null} path={path} autoFit className="h-[58vh] min-h-[380px]" />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span>
              {formatDateTime(data.first_at)} &rarr; {formatDateTime(data.last_at)}
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
