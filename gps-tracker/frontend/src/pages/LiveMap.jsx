import { useState } from 'react';

import * as api from '../services/api.js';
import { useTracker } from '../context/TrackerContext.jsx';
import { useApiResource } from '../hooks/useApiResource.js';
import MapView from '../components/MapView.jsx';
import RangeFilter from '../components/RangeFilter.jsx';
import { InfoRow } from '../components/ui.jsx';
import { DeviceStatusPill, ConnectionPill } from '../components/StatusPill.jsx';
import { formatCoord, formatDateTime, formatRelative, formatDistance } from '../utils/format.js';
import { rangeToQuery } from '../utils/range.js';
import { appendLivePoint } from '../utils/track.js';

export default function LiveMap() {
  const { latest, device, status, loading } = useTracker();
  const [range, setRange] = useState(() => ({ preset: 'today', from: '', to: '' }));

  const { data: route } = useApiResource(
    () => api.getRoute({ ...rangeToQuery(range), limit: 3000 }),
    [range.preset, range.from, range.to],
  );

  const latitude = latest?.latitude ?? device?.last_latitude ?? null;
  const longitude = latest?.longitude ?? device?.last_longitude ?? null;
  const hasFix = Number.isFinite(latitude) && Number.isFinite(longitude);

  const marker = hasFix
    ? {
        ...latest,
        latitude,
        longitude,
        satellites: latest?.satellites ?? device?.last_satellites,
        altitude: latest?.altitude ?? device?.last_altitude,
        timestamp: latest?.timestamp ?? device?.last_seen_at,
      }
    : null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-2xl">Live Map</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Marker updates automatically as fixes arrive - no refresh needed.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ConnectionPill />
          <DeviceStatusPill />
          <RangeFilter value={range} onChange={setRange} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <MapView
          marker={marker}
          path={appendLivePoint((route?.points ?? []).slice(-500), marker)}
          online={status.online}
          follow
          loading={loading}
          className="h-[calc(100vh-14rem)] min-h-[420px]"
        />

        <div className="space-y-4">
          <div className="card p-4">
            <h2 className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">Current fix</h2>
            <InfoRow label="Device" value={device?.name ?? '\u2014'} mono={false} icon="device" />
            <InfoRow label="Latitude" value={formatCoord(latitude)} icon="navigation" />
            <InfoRow label="Longitude" value={formatCoord(longitude)} icon="navigation" />
            <InfoRow
              label="Satellites"
              value={device?.satellites ?? marker?.satellites ?? '\u2014'}
              icon="satellite"
            />
            <InfoRow
              label="Altitude"
              value={marker?.altitude != null ? `${Number(marker.altitude).toFixed(1)} m` : '\u2014'}
              icon="altitude"
            />
            <InfoRow
              label="Accuracy"
              value={marker?.accuracy != null ? `${Number(marker.accuracy).toFixed(0)} m` : '\u2014'}
              icon="crosshair"
            />
            <InfoRow label="Last update" value={formatDateTime(status.lastSeenAt)} icon="clock" />
            <InfoRow
              label="Age"
              value={status.ageSeconds != null ? `${status.ageSeconds}s ago` : '\u2014'}
              icon="activity"
            />
          </div>

          <div className="card p-4">
            <h2 className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">Route over range</h2>
            <InfoRow label="Points" value={route?.count ?? 0} icon="route" />
            <InfoRow
              label="Distance"
              value={route?.distance_meters != null ? formatDistance(route.distance_meters) : '\u2014'}
              icon="activity"
            />
            <InfoRow
              label="First fix"
              value={route?.first_at ? formatRelative(route.first_at) : '\u2014'}
              icon="clock"
            />
            {route?.truncated ? (
              <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
                Showing the most recent points only.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
