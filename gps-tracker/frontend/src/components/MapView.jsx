import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Circle,
  ScaleControl,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';

import Icon from './Icon.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import {
  formatCoord,
  formatDateTime,
  formatDistance,
  formatDuration,
} from '../utils/format.js';
import { analyzeTrack, haversineMeters, pathDistanceMeters } from '../utils/track.js';

/*
 * Detailed base maps - OSM + Esri only, no Google Maps anywhere.
 *   map      standard street map with road/place labels
 *   terrain  Esri topographic map: contours, trails, elevation shading
 *   satellite Esri imagery
 *   hybrid   Esri imagery with a labels overlay on top
 */
const TILES = {
  map: {
    label: 'Map',
    icon: 'map',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    invertInDark: true,
  },
  terrain: {
    label: 'Terrain',
    icon: 'altitude',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Esri, USGS, NAVTEQ, Intermap, NRCAN, Esri Japan, Esri China',
    maxZoom: 19,
    invertInDark: true,
  },
  satellite: {
    label: 'Satellite',
    icon: 'satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
    invertInDark: false,
  },
  hybrid: {
    label: 'Hybrid',
    icon: 'layers',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    overlay:
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Imagery &copy; Esri, Maxar, Earthstar Geographics &middot; Labels &copy; Esri',
    maxZoom: 19,
    invertInDark: false,
  },
};

const DEFAULT_CENTER = [20.5937, 78.9629]; // neutral fallback, never a fake fix
const DEFAULT_ZOOM = 4;

// Re-center only after the device really moved this far since the last pan.
// Keeps the map still while parked (GPS jitter is typically 5-15 m).
const FOLLOW_MIN_METERS = 25;

// The dotted "flow" line: a soft casing underneath keeps the dots readable
// on top of both street maps and satellite imagery.
const CASING_STYLE = {
  color: '#0f172a',
  weight: 10,
  opacity: 0.2,
  lineCap: 'round',
  lineJoin: 'round',
};

const FLOW_STYLE = {
  color: '#22d3ee',
  weight: 5,
  opacity: 0.95,
  dashArray: '0.5, 12', // round dots = the travelled flow
  lineCap: 'round',
  lineJoin: 'round',
};

function createDeviceIcon(online) {
  const color = online ? '#10b981' : '#ef4444';
  return L.divIcon({
    className: 'device-marker',
    html: `<span class="device-dot${online ? '' : ' is-offline'}" style="--dot:${color}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -14],
  });
}

function createEndpointIcon(color) {
  return L.divIcon({
    className: 'device-marker',
    html: `<span style="display:block;width:12px;height:12px;border-radius:9999px;background:${color};box-shadow:0 0 0 3px #fff,0 2px 6px rgb(0 0 0 / 0.35)"></span>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
    popupAnchor: [0, -10],
  });
}

function createStopIcon() {
  return L.divIcon({
    className: 'device-marker',
    html: '<span class="stop-pin"></span>',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10],
  });
}

function MapBridge({ mapRef, onReady }) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
    onReady?.(map);
  }, [map, mapRef, onReady]);
  return null;
}

const toLatLngs = (points) =>
  points.map((p) => [Number(p.latitude), Number(p.longitude)]);

/**
 * @param marker   latest fix: { latitude, longitude, altitude, satellites, accuracy, timestamp }
 * @param path     array of { latitude, longitude, timestamp?, speed? } for the route.
 *                 When timestamps are present the trail is split into legs
 *                 between detected stops and every stop is pinned.
 * @param online   device online state (drives marker colour)
 * @param follow   pan the map to the marker as it moves (default true)
 * @param autoFit  fit the map to `path` whenever the route changes
 * @param loading  show a "waiting for data" overlay
 */
export default function MapView({
  marker = null,
  path = [],
  online = false,
  follow = true,
  autoFit = false,
  loading = false,
  emptyMessage = 'Waiting for GPS data\u2026',
  className = 'h-[60vh]',
  zoom = 15,
}) {
  const { isDark } = useTheme();
  const mapRef = useRef(null);
  const lastFocusKey = useRef(null);
  const lastFollowPoint = useRef(null);
  const lastFitKey = useRef(null);
  const [layer, setLayer] = useState('map');
  const [ready, setReady] = useState(false);

  const points = useMemo(
    () =>
      (path || []).filter(
        (p) => Number.isFinite(Number(p?.latitude)) && Number.isFinite(Number(p?.longitude)),
      ),
    [path],
  );

  const positions = useMemo(
    () => points.map((p) => [Number(p.latitude), Number(p.longitude)]),
    [points],
  );

  // Dotted legs + detected stops (start -> stop -> start -> ...).
  const track = useMemo(() => analyzeTrack(points), [points]);
  const segments = useMemo(
    () => track.segments.map(toLatLngs),
    [track],
  );
  const stops = track.stops;

  const markerPosition = useMemo(
    () =>
      marker && Number.isFinite(Number(marker.latitude)) && Number.isFinite(Number(marker.longitude))
        ? [marker.latitude, marker.longitude]
        : null,
    [marker],
  );

  const icon = useMemo(() => createDeviceIcon(online), [online]);
  const startIcon = useMemo(() => createEndpointIcon('#10b981'), []);
  const endIcon = useMemo(() => createEndpointIcon('#06b6d4'), []);
  const stopIcon = useMemo(() => createStopIcon(), []);

  const tiles = TILES[layer] ?? TILES.map;

  const centerOnDevice = () => {
    const map = mapRef.current;
    if (!map || !markerPosition) return;
    map.flyTo(markerPosition, Math.max(map.getZoom(), zoom), { duration: 0.8 });
  };

  const fitRoute = () => {
    const map = mapRef.current;
    if (!map || positions.length < 2) return;
    map.fitBounds(positions, { padding: [40, 40] });
  };

  // Pan to new fixes (but stop fighting the user after they drag the map).
  // GPS jitter makes a parked device "move" a few metres between uploads, so
  // we only re-center when the device genuinely travelled since the last pan.
  // Without this the map visibly slides on every upload cycle.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !markerPosition || !follow) return;
    const key = `${markerPosition[0].toFixed(5)},${markerPosition[1].toFixed(5)}`;
    if (lastFocusKey.current === key) return;

    const last = lastFollowPoint.current;
    if (last) {
      const moved = haversineMeters(
        { latitude: last[0], longitude: last[1] },
        { latitude: markerPosition[0], longitude: markerPosition[1] },
      );
      if (moved != null && moved < FOLLOW_MIN_METERS) return;
    }

    lastFocusKey.current = key;
    lastFollowPoint.current = markerPosition;
    map.panTo(markerPosition, { animate: true, duration: 0.6 });
  }, [markerPosition, follow]);

  // Fit to the route when it loads / changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !autoFit || positions.length < 2) return;
    const key = `${positions.length}:${positions[0].join(',')}:${positions[positions.length - 1].join(',')}`;
    if (lastFitKey.current === key) return;
    lastFitKey.current = key;
    map.fitBounds(positions, { padding: [40, 40] });
  }, [positions, autoFit]);

  // Keep the map's zoom range in sync with the selected tile layer so we
  // never zoom past what the provider serves (gray tiles beyond it).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setMaxZoom(tiles.maxZoom);
    if (map.getZoom() > tiles.maxZoom) map.setZoom(tiles.maxZoom);
  }, [tiles.maxZoom, ready]);

  const trailLength = pathDistanceMeters(points);
  const endPoint = positions.length ? positions[positions.length - 1] : null;

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 ${className}`}>
      <MapContainer
        center={markerPosition ?? DEFAULT_CENTER}
        zoom={markerPosition ? zoom : DEFAULT_ZOOM}
        scrollWheelZoom
        // We render our own +/- buttons below: Leaflet's default control
        // sits top-left, underneath the overlay buttons, so it was invisible.
        zoomControl={false}
        className={`h-full w-full ${isDark && tiles.invertInDark ? 'map-dark' : ''}`}
        worldCopyJump
      >
        <MapBridge mapRef={mapRef} onReady={() => setReady(true)} />
        <TileLayer key={layer} url={tiles.url} attribution={tiles.attribution} maxZoom={tiles.maxZoom} />
        {tiles.overlay ? (
          <TileLayer
            key={`${layer}-overlay`}
            url={tiles.overlay}
            maxZoom={tiles.maxZoom}
            opacity={0.95}
          />
        ) : null}
        <ScaleControl position="bottomleft" imperial={false} />

        {/* Dotted travel flow: one leg per start -> stop stretch */}
        {segments.map((segment, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <Fragment key={`leg-${index}`}>
            <Polyline positions={segment} pathOptions={CASING_STYLE} />
            <Polyline positions={segment} pathOptions={FLOW_STYLE} />
          </Fragment>
        ))}

        {/* Journey endpoints */}
        {positions.length > 1 ? (
          <Marker position={positions[0]} icon={startIcon}>
            <Popup>
              <div className="space-y-0.5">
                <p className="font-semibold text-slate-900 dark:text-white">Start of route</p>
                <p className="text-slate-500">{formatDateTime(points[0]?.timestamp)}</p>
              </div>
            </Popup>
          </Marker>
        ) : null}

        {!markerPosition && endPoint && positions.length > 1 ? (
          <Marker position={endPoint} icon={endIcon}>
            <Popup>
              <div className="space-y-0.5">
                <p className="font-semibold text-slate-900 dark:text-white">End of route</p>
                <p className="text-slate-500">{formatDateTime(points[points.length - 1]?.timestamp)}</p>
              </div>
            </Popup>
          </Marker>
        ) : null}

        {/* Stops: where the device came to a halt */}
        {stops.map((stop, index) => (
          <Marker
            key={`${stop.arrivedAt}-${stop.latitude}`}
            position={[stop.latitude, stop.longitude]}
            icon={stopIcon}
          >
            <Popup>
              <div className="space-y-0.5">
                <p className="font-semibold text-slate-900 dark:text-white">
                  Stop {index + 1}
                  {stops.length ? ` of ${stops.length}` : ''}
                </p>
                <p>Arrived: {formatDateTime(stop.arrivedAt)}</p>
                <p>Left: {formatDateTime(stop.leftAt)}</p>
                <p>Stayed: {formatDuration(stop.durationSeconds)}</p>
              </div>
            </Popup>
          </Marker>
        ))}

        {markerPosition ? (
          <>
            {Number.isFinite(marker?.accuracy) && marker.accuracy > 0 && marker.accuracy < 5000 ? (
              <Circle
                center={markerPosition}
                radius={marker.accuracy}
                pathOptions={{ color: '#06b6d4', weight: 1, fillOpacity: 0.08 }}
              />
            ) : null}

            <Marker position={markerPosition} icon={icon}>
              <Popup>
                <div className="space-y-0.5">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {online ? 'Device online' : 'Device offline'}
                  </p>
                  <p>
                    Lat: {formatCoord(marker.latitude)} <br />
                    Lng: {formatCoord(marker.longitude)}
                  </p>
                  <p>
                    Satellites: {marker.satellites ?? '\u2014'} &middot; Alt:{' '}
                    {marker.altitude != null ? `${Number(marker.altitude).toFixed(1)} m` : '\u2014'}
                  </p>
                  <p className="text-slate-500">{formatDateTime(marker.timestamp)}</p>
                </div>
              </Popup>
            </Marker>
          </>
        ) : null}
      </MapContainer>

      {/* Controls */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[400] flex items-start justify-between gap-2 p-3">
        <div className="pointer-events-none flex flex-col gap-2">
          <button
            type="button"
            onClick={centerOnDevice}
            disabled={!markerPosition}
            className="btn btn-sm btn-outline pointer-events-auto bg-white/90 backdrop-blur disabled:opacity-40 dark:bg-slate-900/90"
            title="Center on device"
          >
            <Icon name="crosshair" size={14} />
            <span className="hidden sm:inline">Center on Device</span>
          </button>

          {positions.length > 1 ? (
            <button
              type="button"
              onClick={fitRoute}
              className="btn btn-sm btn-outline pointer-events-auto bg-white/90 backdrop-blur dark:bg-slate-900/90"
              title="Fit route"
            >
              <Icon name="route" size={14} />
              <span className="hidden sm:inline">Fit Route</span>
            </button>
          ) : null}

          {/* Legend */}
          {positions.length > 1 ? (
            <div className="pointer-events-auto w-max rounded-xl border border-slate-200 bg-white/90 p-2 text-[11px] text-slate-600 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-300">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Travel flow
              </p>
              <ul className="space-y-1">
                <li className="flex items-center gap-2">
                  <span className="legend-dots" />
                  Travelled route
                </li>
                <li className="flex items-center gap-2">
                  <span className="legend-dot" style={{ background: '#10b981' }} />
                  Start
                </li>
                <li className="flex items-center gap-2">
                  <span className="legend-dot" style={{ background: '#f59e0b' }} />
                  Stop {stops.length ? `(${stops.length})` : ''}
                </li>
                <li className="flex items-center gap-2">
                  <span className="legend-dot" style={{ background: '#06b6d4' }} />
                  {markerPosition ? 'Current position' : 'End'}
                </li>
              </ul>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col items-end gap-2">
          {/* Zoom in / out - always visible on every layer */}
          <div className="pointer-events-auto flex flex-col gap-1 rounded-xl border border-slate-200 bg-white/90 p-1 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
            <button
              type="button"
              onClick={() => mapRef.current?.zoomIn()}
              className="rounded-lg px-2.5 py-1.5 text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              title="Zoom in"
              aria-label="Zoom in"
            >
              <Icon name="plus" size={14} />
            </button>

            <button
              type="button"
              onClick={() => mapRef.current?.zoomOut()}
              className="rounded-lg px-2.5 py-1.5 text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              title="Zoom out"
              aria-label="Zoom out"
            >
              <Icon name="minus" size={14} />
            </button>
          </div>

          <div className="pointer-events-auto flex gap-1 rounded-xl border border-slate-200 bg-white/90 p-1 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
          {Object.entries(TILES).map(([key, value]) => (
            <button
              key={key}
              type="button"
              onClick={() => setLayer(key)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                layer === key ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300'
              }`}
              title={`${value.label} layer`}
            >
              <Icon name={value.icon} size={14} className="sm:mr-1 inline" />
              <span className="hidden sm:inline">{value.label}</span>
            </button>
          ))}
          </div>
        </div>
      </div>

      {/* Empty / loading overlay */}
      {!markerPosition && (loading || ready) ? (
        <div className="pointer-events-none absolute inset-0 z-[350] flex flex-col items-center justify-center bg-slate-950/40 backdrop-blur-[1px]">
          <div className="pointer-events-auto flex flex-col items-center gap-2 rounded-xl bg-white/95 px-5 py-4 text-center shadow-lg dark:bg-slate-900/95">
            {loading ? (
              <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            ) : (
              <Icon name="radio" size={22} className="animate-pulse text-brand-500" />
            )}
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {loading ? 'Loading location\u2026' : emptyMessage}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              The marker will appear as soon as the ESP32 posts a fix.
            </p>
          </div>
        </div>
      ) : null}

      {/* Route summary chip */}
      {positions.length > 1 ? (
        <div className="pointer-events-none absolute bottom-3 right-3 z-[400] flex flex-col items-end gap-1">
          <span className="chip bg-white/90 text-slate-600 backdrop-blur dark:bg-slate-900/90 dark:text-slate-300">
            <Icon name="route" size={13} />
            {positions.length} points &middot; {formatDistance(trailLength)}
          </span>
          {stops.length > 0 ? (
            <span className="chip bg-white/90 text-slate-600 backdrop-blur dark:bg-slate-900/90 dark:text-slate-300">
              <Icon name="clock" size={13} />
              {stops.length} stop{stops.length === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
