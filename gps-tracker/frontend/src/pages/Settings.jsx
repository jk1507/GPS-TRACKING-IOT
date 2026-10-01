import { useState } from 'react';

import { API_BASE_URL, HAS_DASHBOARD_KEY } from '../services/api.js';
import { useTheme } from '../context/ThemeContext.jsx';
import { useTracker } from '../context/TrackerContext.jsx';
import Icon from '../components/Icon.jsx';
import { InfoRow, PageHeader } from '../components/ui.jsx';
import { formatDateTime } from '../utils/format.js';

function CopyBlock({ title, children }) {
  const [copied, setCopied] = useState(false);
  const text = typeof children === 'string' ? children : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {title}
        </span>
        <button type="button" onClick={copy} className="btn btn-ghost btn-sm">
          <Icon name={copied ? 'activity' : 'list'} size={13} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto bg-slate-950 px-3 py-3 font-mono text-[11px] leading-relaxed text-slate-300">
        {children}
      </pre>
    </div>
  );
}

export default function Settings() {
  const { theme, isDark, toggle } = useTheme();
  const { config, device, status } = useTracker();

  const origin = API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  const curl = `curl -X POST "${origin}/api/location" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $API_SECRET" \\
  -d '{
    "device_id": "${config.device_id}",
    "latitude": 17.423450,
    "longitude": 83.198760,
    "altitude": 25.4,
    "satellites": 7,
    "timestamp": "${new Date().toISOString()}"
  }'`;

  return (
    <div>
      <PageHeader title="Settings" subtitle="Appearance, connection details and API testing" />

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Appearance</h2>
          <div className="flex items-center justify-between gap-4 py-2">
            <span className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <Icon name={isDark ? 'moon' : 'sun'} size={16} />
              Theme
            </span>
            <button type="button" onClick={toggle} className="btn btn-outline btn-sm">
              {isDark ? 'Dark' : 'Light'} &middot; switch
            </button>
          </div>
          <InfoRow label="Stored preference" value={theme} icon="settings" />
          <InfoRow label="Auto-refresh" value="every 15s (plus WebSocket)" icon="refresh" />
        </div>

        <div className="card p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Connection</h2>
          <InfoRow label="API base URL" value={origin || 'same origin'} icon="link" />
          <InfoRow
            label="Dashboard key"
            value={HAS_DASHBOARD_KEY ? 'configured' : 'not set (public reads)'}
            icon="shield"
            mono={false}
          />
          <InfoRow label="Device ID" value={config.device_id} icon="device" />
          <InfoRow label="Offline timeout" value={`${status.timeoutSeconds}s`} icon="clock" />
          <InfoRow label="Device status" value={device?.online ? 'ONLINE' : 'OFFLINE'} icon="wifi" mono={false} />
          <InfoRow label="Server time" value={formatDateTime(device?.server_time)} icon="clock" />
        </div>

        <div className="card p-4 lg:col-span-2">
          <h2 className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">Test the ingest API</h2>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            Run this to insert a single test fix. Replace the coordinates with real values - the dashboard never
            invents positions. Only your ESP32 and your shell should know <code>API_SECRET</code>.
          </p>
          <CopyBlock title="POST /api/location">{curl}</CopyBlock>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800">
              <p className="mb-1 font-semibold text-slate-700 dark:text-slate-200">Read endpoints</p>
              <ul className="space-y-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                <li>GET /api/device</li>
                <li>GET /api/locations/latest</li>
                <li>GET /api/locations?range=today</li>
                <li>GET /api/route?range=today</li>
                <li>GET /api/stats?range=7d</li>
                <li>GET /api/health</li>
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800">
              <p className="mb-1 font-semibold text-slate-700 dark:text-slate-200">Security notes</p>
              <ul className="list-inside list-disc space-y-1 text-slate-500 dark:text-slate-400">
                <li>
                  <code>API_SECRET</code> lives only in <code>backend/.env</code> and on the ESP32.
                </li>
                <li>The browser only ever sees an optional read-only dashboard key.</li>
                <li>Ingest is rate limited and validates every field.</li>
                <li>(0,0) coordinates are rejected as &quot;no fix&quot;.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
