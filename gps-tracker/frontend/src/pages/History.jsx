import { useState } from 'react';

import * as api from '../services/api.js';
import { useApiResource } from '../hooks/useApiResource.js';
import RangeFilter from '../components/RangeFilter.jsx';
import MapView from '../components/MapView.jsx';
import Icon from '../components/Icon.jsx';
import { EmptyState, ErrorBanner, PageHeader, Spinner } from '../components/ui.jsx';
import { describeRange, formatCoord, formatDate, formatDateTime, formatTime } from '../utils/format.js';
import { defaultRange, rangeToQuery, RANGE_PRESETS } from '../utils/range.js';

const PAGE_SIZE = 50;

function downloadCsv(rows, filename) {
  const header = ['date', 'time', 'latitude', 'longitude', 'altitude', 'satellites', 'timestamp'];
  const body = rows.map((r) =>
    [
      formatDate(r.timestamp),
      formatTime(r.timestamp),
      r.latitude,
      r.longitude,
      r.altitude ?? '',
      r.satellites ?? '',
      r.timestamp,
    ].join(','),
  );
  const blob = new Blob([[header.join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function History() {
  const [range, setRange] = useState(defaultRange);
  const [page, setPage] = useState(0);
  const [showMap, setShowMap] = useState(false);
  const [exporting, setExporting] = useState(false);

  const query = rangeToQuery(range);
  const deps = [range.preset, range.from, range.to, page];

  const { data, loading, error, reload } = useApiResource(
    () => api.getHistory({ ...query, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    deps,
  );

  const rows = data?.locations ?? [];
  const total = data?.pagination?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const changeRange = (next) => {
    setRange(next);
    setPage(0);
  };

  const exportAll = async () => {
    setExporting(true);
    try {
      const res = await api.getHistory({ ...query, limit: 1000, offset: 0 });
      downloadCsv(res.locations ?? [], `gps-history-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (err) {
      // eslint-disable-next-line no-alert
      window.alert(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const mapPath = [...rows].reverse().map((r) => ({ latitude: r.latitude, longitude: r.longitude }));

  const rangeLabel =
    range.preset === 'custom'
      ? describeRange({ from: range.from || null, to: range.to || null })
      : (RANGE_PRESETS.find((p) => p.value === range.preset)?.label ?? range.preset);

  return (
    <div>
      <PageHeader
        title="Location History"
        subtitle="Every valid GPS fix stored by the backend"
        actions={
          <>
            <RangeFilter value={range} onChange={changeRange} />
            <button type="button" onClick={exportAll} className="btn btn-outline btn-sm" disabled={exporting || total === 0}>
              <Icon name="download" size={14} />
              {exporting ? 'Exporting\u2026' : 'CSV'}
            </button>
          </>
        }
      />

      <ErrorBanner message={error?.message} onRetry={reload} className="mb-4" />

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-700 dark:text-slate-200">{total}</span> records &middot;{' '}
            {rangeLabel}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowMap((v) => !v)} className="btn btn-ghost btn-sm">
              <Icon name="map" size={14} />
              {showMap ? 'Hide map' : 'Show map'}
            </button>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="btn btn-outline btn-sm"
                aria-label="Previous page"
              >
                <Icon name="chevronLeft" size={14} />
              </button>
              <span className="px-2 font-mono text-xs text-slate-500 dark:text-slate-400">
                {page + 1} / {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={page + 1 >= pageCount}
                className="btn btn-outline btn-sm"
                aria-label="Next page"
              >
                <Icon name="chevronRight" size={14} />
              </button>
            </div>
          </div>
        </div>

        {showMap ? (
          <div className="border-b border-slate-200 p-4 dark:border-slate-800">
            <MapView marker={null} path={mapPath} autoFit className="h-[42vh]" emptyMessage="No points in this range" />
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon="history"
            title="No locations in this range"
            description="Try a wider date range, or wait for the ESP32 to post a new fix."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Time</th>
                  <th className="px-4 py-3 font-semibold">Latitude</th>
                  <th className="px-4 py-3 font-semibold">Longitude</th>
                  <th className="px-4 py-3 font-semibold">Altitude</th>
                  <th className="px-4 py-3 font-semibold">Satellites</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="table-row">
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{formatDate(row.timestamp)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                      {formatTime(row.timestamp)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-800 dark:text-slate-100">
                      {formatCoord(row.latitude)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-800 dark:text-slate-100">
                      {formatCoord(row.longitude)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-300">
                      {row.altitude != null ? `${Number(row.altitude).toFixed(1)} m` : '\u2014'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {row.satellites ?? '\u2014'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-3 text-center text-xs text-slate-400">
        Timestamps are shown in your local timezone &middot; stored as UTC
      </p>
    </div>
  );
}
