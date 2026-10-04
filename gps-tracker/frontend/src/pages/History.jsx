import { useEffect, useMemo, useState } from 'react';

import { useTracker } from '../context/TrackerContext.jsx';
import * as api from '../services/api.js';
import MapView from '../components/MapView.jsx';
import Icon from '../components/Icon.jsx';

import {
  EmptyState,
  PageHeader,
} from '../components/ui.jsx';

import {
  formatCoord,
  formatDate,
  formatTime,
} from '../utils/format.js';

const PAGE_SIZE = 50;

function formatBoolean(value) {
  if (value === true) return 'YES';
  if (value === false) return 'NO';
  return '—';
}

function downloadCsv(rows, filename) {
  const header = [
    'date',
    'time',
    'latitude',
    'longitude',
    'altitude',
    'satellites',
    'gps_fix',
    'accuracy',
    'speed',
    'heading',
    'wifi_connected',
    'wifi_rssi',
    'geolinker_status',
    'render_status',
    'timestamp',
  ];

  const escapeCsv = (value) => {
    if (value === null || value === undefined) {
      return '';
    }

    const stringValue = String(value);

    if (
      stringValue.includes(',') ||
      stringValue.includes('"') ||
      stringValue.includes('\n')
    ) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
  };

  const body = rows.map((row) =>
    [
      formatDate(row.timestamp),
      formatTime(row.timestamp),
      row.latitude,
      row.longitude,
      row.altitude ?? '',
      row.satellites ?? '',
      row.gps_fix ?? '',
      row.accuracy ?? '',
      row.speed ?? '',
      row.heading ?? '',
      row.wifi_connected ?? '',
      row.wifi_rssi ?? '',
      row.geolinker_status ?? '',
      row.render_status ?? '',
      row.timestamp,
    ]
      .map(escapeCsv)
      .join(','),
  );

  const csv = [header.join(','), ...body].join('\n');

  const blob = new Blob([csv], {
    type: 'text/csv;charset=utf-8',
  });

  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

export default function History() {
  const { frontendHistory, clearFrontendHistory, addFrontendPoint } = useTracker();
  const [page, setPage] = useState(0);
  const [showMap, setShowMap] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Seed frontend history with backend locations if available on load
  useEffect(() => {
    (async () => {
      try {
        const res = await api.getHistory({ limit: 100 });
        if (res?.locations && Array.isArray(res.locations)) {
          // Add in chronological order
          const sorted = [...res.locations].reverse();
          sorted.forEach((loc) => addFrontendPoint(loc));
        }
      } catch {
        // Ignore API fetch error, frontend history will rely on live socket + localStorage
      }
    })();
  }, [addFrontendPoint]);

  // Display newest fixes first in table
  const reversedHistory = useMemo(() => {
    return [...frontendHistory].reverse();
  }, [frontendHistory]);

  const total = reversedHistory.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPageRows = useMemo(() => {
    const start = page * PAGE_SIZE;
    return reversedHistory.slice(start, start + PAGE_SIZE);
  }, [reversedHistory, page]);

  /*
   * Clear only the frontend history.
   * Does NOT delete or modify anything in the backend/database.
   */
  const handleClearHistory = () => {
    if (frontendHistory.length === 0) return;

    const confirmed = window.confirm(
      'Clear the frontend GPS history?\n\n' +
        'This will clear stored points from your browser (localStorage). ' +
        'It will NOT delete or modify anything in the backend or database.',
    );

    if (!confirmed) return;

    clearFrontendHistory();
    setPage(0);
  };

  /*
   * Download the entire frontend history as a CSV file.
   */
  const exportFrontendCsv = () => {
    if (frontendHistory.length === 0) return;

    try {
      setExporting(true);
      downloadCsv(
        reversedHistory,
        `frontend-gps-history-${new Date().toISOString().slice(0, 10)}.csv`,
      );
    } finally {
      setExporting(false);
    }
  };

  const mapPath = useMemo(() => {
    return frontendHistory
      .filter(
        (row) =>
          Number.isFinite(Number(row.latitude)) &&
          Number.isFinite(Number(row.longitude)),
      )
      .map((row) => ({
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        timestamp: row.timestamp,
        speed: row.speed,
      }));
  }, [frontendHistory]);

  return (
    <div>
      <PageHeader
        title="Frontend GPS History"
        subtitle="Realtime GPS coordinates stored locally in your browser"
        actions={
          <>
            <button
              type="button"
              onClick={exportFrontendCsv}
              className="btn btn-outline btn-sm"
              disabled={exporting || frontendHistory.length === 0}
            >
              <Icon name="download" size={14} />
              {exporting ? 'Exporting…' : 'Download CSV'}
            </button>

            <button
              type="button"
              onClick={handleClearHistory}
              className="btn btn-outline btn-sm text-rose-600 border-rose-200 hover:bg-rose-50 dark:border-rose-900/50 dark:hover:bg-rose-950/30"
              disabled={frontendHistory.length === 0}
            >
              <Icon name="trash" size={14} />
              Clear History
            </button>
          </>
        }
      />

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {total}
              </span>{' '}
              frontend-stored GPS points
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              Persisted in localStorage &middot; Automatically updates live as new fixes arrive
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowMap((val) => !val)}
              className="btn btn-ghost btn-sm"
            >
              <Icon name="map" size={14} />
              {showMap ? 'Hide Map' : 'Show Map'}
            </button>

            {pageCount > 1 ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((v) => Math.max(0, v - 1))}
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
                  onClick={() => setPage((v) => Math.min(pageCount - 1, v + 1))}
                  disabled={page + 1 >= pageCount}
                  className="btn btn-outline btn-sm"
                  aria-label="Next page"
                >
                  <Icon name="chevronRight" size={14} />
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {showMap ? (
          <div className="border-b border-slate-200 p-4 dark:border-slate-800">
            <MapView
              marker={mapPath.length ? mapPath[mapPath.length - 1] : null}
              path={mapPath}
              autoFit
              showPointMarkers
              className="h-[42vh]"
              emptyMessage="No frontend GPS history recorded yet"
            />
          </div>
        ) : null}

        {total === 0 ? (
          <EmptyState
            icon="history"
            title="No frontend GPS points recorded yet"
            description="Whenever a location fix is received from the ESP32 via realtime Socket.IO, it will automatically save and appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Time</th>
                  <th className="px-4 py-3 font-semibold">Latitude</th>
                  <th className="px-4 py-3 font-semibold">Longitude</th>
                  <th className="px-4 py-3 font-semibold">Altitude</th>
                  <th className="px-4 py-3 font-semibold">Satellites</th>
                  <th className="px-4 py-3 font-semibold">GPS Fix</th>
                  <th className="px-4 py-3 font-semibold">Accuracy</th>
                  <th className="px-4 py-3 font-semibold">Speed</th>
                  <th className="px-4 py-3 font-semibold">Heading</th>
                  <th className="px-4 py-3 font-semibold">Wi-Fi</th>
                  <th className="px-4 py-3 font-semibold">RSSI</th>
                  <th className="px-4 py-3 font-semibold">GeoLinker</th>
                  <th className="px-4 py-3 font-semibold">Render</th>
                </tr>
              </thead>

              <tbody>
                {currentPageRows.map((row) => (
                  <tr key={row.id} className="table-row">
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                      {formatDate(row.timestamp)}
                    </td>

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
                      {row.altitude != null
                        ? `${Number(row.altitude).toFixed(1)} m`
                        : '—'}
                    </td>

                    <td className="px-4 py-2.5">
                      <span className="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {row.satellites ?? '—'}
                      </span>
                    </td>

                    <td className="px-4 py-2.5">
                      <span
                        className={
                          row.gps_fix === true
                            ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                            : row.gps_fix === false
                              ? 'text-rose-600 dark:text-rose-400 font-medium'
                              : 'text-slate-400'
                        }
                      >
                        {formatBoolean(row.gps_fix)}
                      </span>
                    </td>

                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-300">
                      {row.accuracy != null
                        ? `${Number(row.accuracy).toFixed(1)} m`
                        : '—'}
                    </td>

                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-300">
                      {row.speed != null
                        ? Number(row.speed).toFixed(2)
                        : '—'}
                    </td>

                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-300">
                      {row.heading != null
                        ? `${Number(row.heading).toFixed(1)}°`
                        : '—'}
                    </td>

                    <td className="px-4 py-2.5">
                      {formatBoolean(row.wifi_connected)}
                    </td>

                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-300">
                      {row.wifi_rssi != null
                        ? `${Number(row.wifi_rssi)} dBm`
                        : '—'}
                    </td>

                    <td className="px-4 py-2.5 text-xs">
                      {row.geolinker_status ?? '—'}
                    </td>

                    <td className="px-4 py-2.5 text-xs">
                      {row.render_status ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-3 text-center text-xs text-slate-400">
        Timestamps are displayed in your local timezone &middot; Stored persistently in browser localStorage
      </p>
    </div>
  );
}