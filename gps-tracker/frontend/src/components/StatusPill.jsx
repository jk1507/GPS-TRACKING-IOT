import { useTracker } from '../context/TrackerContext.jsx';

/**
 * The primary ONLINE / OFFLINE badge.
 * Online is decided by the SERVER's last_seen_at + offline timeout, not by the
 * browser socket state.
 */
export function DeviceStatusPill({ size = 'md' }) {
  const { status, deviceName } = useTracker();
  const { online, hasData } = status;

  const label = !hasData ? 'NO DATA' : online ? 'ONLINE' : 'OFFLINE';
  const tone = !hasData
    ? 'bg-slate-500/15 text-slate-500 dark:text-slate-400'
    : online
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
      : 'bg-rose-500/15 text-rose-700 dark:text-rose-300';

  const dot = !hasData ? 'bg-slate-400' : online ? 'bg-emerald-500' : 'bg-rose-500';

  return (
    <span
      className={`chip ${tone} ${size === 'lg' ? 'px-3 py-1.5 text-sm' : ''}`}
      title={`${deviceName} device status`}
    >
      <span className="relative flex h-2 w-2">
        {online ? (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${dot} opacity-75`} />
        ) : null}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${dot}`} />
      </span>
      {label}
    </span>
  );
}

/** Small "realtime link" indicator for the top bar. */
export function ConnectionPill() {
  const { connection } = useTracker();

  const map = {
    live: { label: 'LIVE', tone: 'bg-brand-500/15 text-brand-700 dark:text-brand-300', dot: 'bg-brand-500' },
    connecting: { label: 'SYNCING', tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
    offline: { label: 'RECONNECTING', tone: 'bg-rose-500/15 text-rose-700 dark:text-rose-300', dot: 'bg-rose-500' },
    error: { label: 'POLLING', tone: 'bg-slate-500/15 text-slate-500', dot: 'bg-slate-400' },
  };
  const state = map[connection] ?? map.connecting;

  return (
    <span className={`chip ${state.tone}`} title="Realtime (WebSocket) link">
      <span className={`h-2 w-2 rounded-full ${state.dot}`} />
      {state.label}
    </span>
  );
}

export default DeviceStatusPill;
