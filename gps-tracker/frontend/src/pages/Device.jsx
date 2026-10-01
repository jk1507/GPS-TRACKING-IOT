import * as api from '../services/api.js';
import { useTracker } from '../context/TrackerContext.jsx';
import { useApiResource } from '../hooks/useApiResource.js';
import MapView from '../components/MapView.jsx';
import Icon from '../components/Icon.jsx';
import { DeviceStatusPill, ConnectionPill } from '../components/StatusPill.jsx';
import { ErrorBanner, InfoRow, PageHeader, Spinner } from '../components/ui.jsx';
import {
  formatCoord,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatRelative,
} from '../utils/format.js';

export default function Device() {
  const { device, latest, status, config, refresh } = useTracker();

  const {
    data,
    loading,
    error,
    reload,
  } = useApiResource(() => api.getDevice(), []);

  const info = data?.device ?? device;

  const latitude =
    info?.latitude ??
    latest?.latitude ??
    info?.last_latitude;

  const longitude =
    info?.longitude ??
    latest?.longitude ??
    info?.last_longitude;

  const hasFix =
    Number.isFinite(Number(latitude)) &&
    Number.isFinite(Number(longitude));

  /*
   * Latest telemetry can come from the latest location record.
   * Device values are used as a fallback because the backend also keeps
   * the latest telemetry snapshot in the devices table.
   */
  const gpsFix =
    latest?.gps_fix ??
    info?.gps_fix ??
    null;

  const wifiConnected =
    latest?.wifi_connected ??
    info?.wifi_connected ??
    null;

  const wifiRssi =
    latest?.wifi_rssi ??
    info?.wifi_rssi ??
    null;

  const geolinkerStatus =
    latest?.geolinker_status ??
    info?.geolinker_status ??
    null;

  const renderStatus =
    latest?.render_status ??
    info?.render_status ??
    null;

  const speed =
    latest?.speed ??
    null;

  const heading =
    latest?.heading ??
    null;

  return (
    <div>
      <PageHeader
        title="Device"
        subtitle="Tracker identity, connectivity and last known state"
        actions={
          <>
            <ConnectionPill />
            <DeviceStatusPill />
          </>
        }
      />

      <ErrorBanner
        message={error?.message}
        onRetry={reload}
        className="mb-4"
      />

      <div className="grid gap-5 lg:grid-cols-2">

        {/* ---------------------------------------------------------
            DEVICE STATUS
        --------------------------------------------------------- */}
        <div className="card p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Status
          </h2>

          {loading && !info ? (
            <div className="flex justify-center py-8 text-slate-400">
              <Spinner />
            </div>
          ) : (
            <>
              <InfoRow
                label="Device ID"
                value={info?.device_id ?? config.device_id}
                icon="device"
              />

              <InfoRow
                label="Name"
                value={info?.name ?? config.device_name}
                mono={false}
                icon="logo"
              />

              <InfoRow
                label="Online"
                value={info?.online ? 'YES' : 'NO'}
                mono={false}
                icon={info?.online ? 'wifi' : 'wifiOff'}
              />

              <InfoRow
                label="GPS Fix"
                value={
                  gpsFix === true
                    ? 'VALID'
                    : gpsFix === false
                      ? 'NO FIX'
                      : '—'
                }
                mono={false}
                icon="satellite"
              />

              <InfoRow
                label="Wi-Fi"
                value={
                  wifiConnected === true
                    ? 'CONNECTED'
                    : wifiConnected === false
                      ? 'DISCONNECTED'
                      : '—'
                }
                mono={false}
                icon={wifiConnected ? 'wifi' : 'wifiOff'}
              />

              <InfoRow
                label="Wi-Fi RSSI"
                value={
                  wifiRssi != null
                    ? `${Number(wifiRssi)} dBm`
                    : '—'
                }
                icon="wifi"
              />

              <InfoRow
                label="Last seen"
                value={formatDateTime(
                  info?.last_seen_at ?? status.lastSeenAt,
                )}
                icon="clock"
              />

              <InfoRow
                label="Age"
                value={
                  info?.age_seconds != null
                    ? `${info.age_seconds}s`
                    : '—'
                }
                icon="activity"
              />

              <InfoRow
                label="Offline timeout"
                value={`${status.timeoutSeconds}s`}
                icon="clock"
              />

              <InfoRow
                label="IP address"
                value={info?.ip_address ?? '—'}
                icon="radio"
              />

              <InfoRow
                label="Firmware"
                value={info?.firmware ?? '—'}
                icon="shield"
              />
            </>
          )}
        </div>

        {/* ---------------------------------------------------------
            LATEST GPS FIX
        --------------------------------------------------------- */}
        <div className="card p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Latest fix
          </h2>

          <InfoRow
            label="Latitude"
            value={formatCoord(latitude)}
            icon="navigation"
          />

          <InfoRow
            label="Longitude"
            value={formatCoord(longitude)}
            icon="navigation"
          />

          <InfoRow
            label="Altitude"
            value={
              latest?.altitude != null ||
              info?.altitude != null
                ? `${Number(
                    latest?.altitude ?? info?.altitude,
                  ).toFixed(1)} m`
                : '—'
            }
            icon="altitude"
          />

          <InfoRow
            label="Satellites"
            value={
              latest?.satellites ??
              info?.satellites ??
              '—'
            }
            icon="satellite"
          />

          <InfoRow
            label="Accuracy"
            value={
              latest?.accuracy != null
                ? `${Number(latest.accuracy).toFixed(1)} m`
                : '—'
            }
            icon="crosshair"
          />

          <InfoRow
            label="Speed"
            value={
              speed != null
                ? `${Number(speed).toFixed(2)}`
                : '—'
            }
            icon="activity"
          />

          <InfoRow
            label="Heading"
            value={
              heading != null
                ? `${Number(heading).toFixed(1)}°`
                : '—'
            }
            icon="navigation"
          />

          <InfoRow
            label="Fix timestamp"
            value={formatDateTime(latest?.timestamp)}
            icon="clock"
          />

          <InfoRow
            label="Received"
            value={formatRelative(
              info?.last_seen_at,
              Date.now(),
            )}
            icon="radio"
          />
        </div>

        {/* ---------------------------------------------------------
            UPLOAD STATUS
        --------------------------------------------------------- */}
        <div className="card p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Upload Status
          </h2>

          <InfoRow
            label="GeoLinker"
            value={geolinkerStatus ?? '—'}
            mono={false}
            icon="radio"
          />

          <InfoRow
            label="Render API"
            value={renderStatus ?? '—'}
            mono={false}
            icon="server"
          />

          <InfoRow
            label="Wi-Fi Connected"
            value={
              wifiConnected === true
                ? 'YES'
                : wifiConnected === false
                  ? 'NO'
                  : '—'
            }
            mono={false}
            icon={wifiConnected ? 'wifi' : 'wifiOff'}
          />

          <InfoRow
            label="Wi-Fi RSSI"
            value={
              wifiRssi != null
                ? `${Number(wifiRssi)} dBm`
                : '—'
            }
            icon="wifi"
          />
        </div>

        {/* ---------------------------------------------------------
            RECORDS
        --------------------------------------------------------- */}
        <div className="card p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Records
          </h2>

          <InfoRow
            label="Locations stored"
            value={formatNumber(info?.location_count)}
            icon="database"
          />

          <InfoRow
            label="First fix"
            value={formatDateTime(info?.first_location_at)}
            icon="clock"
          />

          <InfoRow
            label="Tracking duration"
            value={formatDuration(
              info?.tracking_duration_seconds,
            )}
            icon="activity"
          />

          <InfoRow
            label="Server time"
            value={formatDateTime(info?.server_time)}
            icon="clock"
          />

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                refresh().catch(() => {});
                reload();
              }}
              className="btn btn-outline btn-sm"
            >
              <Icon name="refresh" size={14} />
              Refresh
            </button>
          </div>
        </div>

        {/* ---------------------------------------------------------
            MAP
        --------------------------------------------------------- */}
        <div className="lg:col-span-2">
          <MapView
            marker={
              hasFix
                ? {
                    ...latest,
                    latitude,
                    longitude,
                  }
                : null
            }
            online={status.online}
            follow={false}
            className="h-[420px]"
            emptyMessage="No fix recorded yet"
          />
        </div>
      </div>
    </div>
  );
}