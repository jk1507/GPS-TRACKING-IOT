import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

import Icon from './Icon.jsx';
import { ConnectionPill, DeviceStatusPill } from './StatusPill.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { useTracker } from '../context/TrackerContext.jsx';
import { formatRelative } from '../utils/format.js';

const NAV = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/map', label: 'Live Map', icon: 'map' },
  { to: '/history', label: 'History', icon: 'history' },
  { to: '/route', label: 'Route', icon: 'route' },
  { to: '/device', label: 'Device', icon: 'device' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/15 text-brand-600 dark:text-brand-400">
        <Icon name="logo" size={20} />
      </span>
      <div className="leading-tight">
        <p className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">ESP32 GPS</p>
        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Tracker</p>
      </div>
    </div>
  );
}

function NavItems({ onNavigate }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
        >
          <Icon name={item.icon} size={17} />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

function ThemeToggle() {
  const { isDark, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      className="btn btn-ghost btn-sm"
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label="Toggle theme"
    >
      <Icon name={isDark ? 'sun' : 'moon'} size={16} />
    </button>
  );
}

function RefreshButton() {
  const { refresh } = useTracker();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await refresh();
    } catch {
      /* surfaced through the global error banner */
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" onClick={run} className="btn btn-ghost btn-sm" title="Refresh now" aria-label="Refresh">
      <Icon name="refresh" size={16} className={busy ? 'animate-spin' : ''} />
      <span className="hidden sm:inline">Refresh</span>
    </button>
  );
}

export default function Layout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { pathname } = useLocation();
  const { lastEventAt, deviceName } = useTracker();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setDrawerOpen(false), [pathname]);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white px-4 py-5 dark:border-slate-800 dark:bg-slate-900 lg:flex">
        <Brand />
        <div className="mt-6 flex-1">
          <NavItems />
        </div>
        <div className="rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800">
          <p className="font-medium text-slate-600 dark:text-slate-300">{deviceName}</p>
          <p className="mt-0.5 text-slate-400">
            Last packet {lastEventAt ? formatRelative(lastEventAt) : '\u2014'}
          </p>
        </div>
      </aside>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-slate-200 bg-white px-4 py-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <Brand />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="btn btn-ghost btn-sm"
                aria-label="Close menu"
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="mt-6 flex-1">
              <NavItems onNavigate={() => setDrawerOpen(false)} />
            </div>
          </div>
        </div>
      ) : null}

      {/* Content column */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-900/85">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="btn btn-ghost btn-sm lg:hidden"
              aria-label="Open menu"
            >
              <Icon name="menu" size={18} />
            </button>

            <div className="flex items-center gap-2 lg:hidden">
              <Icon name="logo" size={18} className="text-brand-500" />
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">GPS Tracker</span>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <ConnectionPill />
              <DeviceStatusPill />
              <RefreshButton />
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-6">
          <Outlet />
        </main>

        <footer className="mx-auto w-full max-w-7xl px-4 pb-8 pt-2 text-center text-xs text-slate-400 sm:px-6">
          ESP32 + NEO-6M GPS Tracker &middot; Leaflet / OpenStreetMap &middot; data straight from your device
        </footer>
      </div>
    </div>
  );
}
