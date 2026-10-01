import { useEffect, useMemo, useRef, useState } from 'react';
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
import { formatCoord, formatDateTime, formatDistance } from '../utils/format.js';

/* OpenStreetMap + Esri satellite only - no Google Maps anywhere. */
const TILES = {
  map: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
  },
};

const DEFAULT_CENTER = [20.5937, 78.9629]; // neutral fallback, never a fake fix
const DEFAULT_ZOOM = 4;

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
    html: `<span style="display:block;width:10px;height:10px;border-radius:9999px;background:${color};box-shadow:0 0 0 2px #fff"></span>`,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
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

/**
 * @param marker   latest fix: { latitude, longitude, altitude, satellites, accuracy, timestamp }
 * @param path     array of { latitude, longitude } for the route polyline
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
  const lastFitKey = useRef(null);
  const [layer, setLayer] = useState('map');
  const [ready, setReady] = useState(false);

  const positions = useMemo(
    () =>
      (path || [])
        .filter((p) => Number.isFinite(p?.latitude) && Number.isFinite(p?.longitude))
        .map((p) => [p.latitude, p.longitude]),
    [path],
  );

  const markerPosition = useMemo(
    () =>
      marker && Number.isFinite(marker.latitude) && Number.isFinite(marker.longitude)
        ? [marker.latitude, marker.longitude]
        : null,
    [marker],
  );

  const icon = useMemo(() => createDeviceIcon(online), [online]);
  const startIcon = useMemo(() => createEndpointIcon('#10b981'), []);
  const endIcon = useMemo(() => createEndpointIcon('#06b6d4'), []);

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
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !markerPosition || !follow) return;
    const key = `${markerPosition[0].toFixed(5)},${markerPosition[1].toFixed(5)}`;
    if (lastFocusKey.current === key) return;
    lastFocusKey.current = key;
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

  const tiles = TILES[layer];

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 ${className}`}>
      <MapContainer
        center={markerPosition ?? DEFAULT_CENTER}
        zoom={markerPosition ? zoom : DEFAULT_ZOOM}
        scrollWheelZoom
        className={`h-full w-full ${isDark && layer === 'map' ? 'map-dark' : ''}`}
        worldCopyJump
      >
        <MapBridge mapRef={mapRef} onReady={() => setReady(true)} />
        <TileLayer key={layer} url={tiles.url} attribution={tiles.attribution} maxZoom={tiles.maxZoom} />
        <ScaleControl position="bottomleft" imperial={false} />

        {positions.length > 1 ? (
          <>
            <Polyline positions={positions} pathOptions={{ color: '#06b6d4', weight: 3, opacity: 0.9 }} />
            <Marker position={positions[0]} icon={startIcon} />
            <Marker position={positions[positions.length - 1]} icon={endIcon} />
          </>
        ) : null}

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
        <div className="pointer-events-auto flex flex-col gap-2">
          <button
            type="button"
            onClick={centerOnDevice}
            disabled={!markerPosition}
            className="btn btn-sm btn-outline bg-white/90 backdrop-blur disabled:opacity-40 dark:bg-slate-900/90"
            title="Center on device"
          >
            <Icon name="crosshair" size={14} />
            <span className="hidden sm:inline">Center on Device</span>
          </button>

          {positions.length > 1 ? (
            <button
              type="button"
              onClick={fitRoute}
              className="btn btn-sm btn-outline bg-white/90 backdrop-blur dark:bg-slate-900/90"
              title="Fit route"
            >
              <Icon name="route" size={14} />
              <span className="hidden sm:inline">Fit Route</span>
            </button>
          ) : null}
        </div>

        <div className="pointer-events-auto flex gap-1 rounded-xl border border-slate-200 bg-white/90 p-1 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
          <button
            type="button"
            onClick={() => setLayer('map')}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
              layer === 'map' ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300'
            }`}
            title="Street map"
          >
            <Icon name="map" size={14} className="sm:mr-1 inline" />
            <span className="hidden sm:inline">Map</span>
          </button>
          <button
            type="button"
            onClick={() => setLayer('satellite')}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
              layer === 'satellite' ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300'
            }`}
            title="Satellite imagery"
          >
            <Icon name="satellite" size={14} className="sm:mr-1 inline" />
            <span className="hidden sm:inline">Satellite</span>
          </button>
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
        <div className="pointer-events-none absolute bottom-3 right-3 z-[400]">
          <span className="chip bg-white/90 text-slate-600 backdrop-blur dark:bg-slate-900/90 dark:text-slate-300">
            <Icon name="route" size={13} />
            {positions.length} points &middot; {formatDistance(routeDistance(positions))}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** Rough polyline length for the summary chip (metres). */
function routeDistance(positions) {
  let total = 0;
  for (let i = 1; i < positions.length; i += 1) {
    const [lat1, lon1] = positions[i - 1];
    const [lat2, lon2] = positions[i];
    const R = 6371008.8;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    total += 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  return total;
}
