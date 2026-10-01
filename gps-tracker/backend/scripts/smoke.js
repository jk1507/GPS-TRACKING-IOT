/**
 * End-to-end smoke test against a running backend.
 *
 *   npm run smoke
 *   BASE_URL=http://localhost:4000 API_SECRET=... npm run smoke
 */
import 'dotenv/config';

const BASE_URL = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, '');
const API_SECRET = process.env.API_SECRET;
const DEVICE_ID = process.env.DEVICE_ID || 'GPS_TRACKING';

let failures = 0;

function check(label, ok, extra = '') {
  console.log(`${ok ? '  \u2713' : '  \u2717'} ${label}${extra ? ` -> ${extra}` : ''}`);
  if (!ok) failures += 1;
}

async function request(method, path, { body, token } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, json };
}

async function main() {
  if (!API_SECRET) {
    console.error('API_SECRET is required (put it in backend/.env or pass it inline).');
    process.exit(1);
  }

  console.log(`Smoke test against ${BASE_URL}\n`);

  const health = await request('GET', '/api/health');
  check('GET /api/health', health.status === 200 && health.json?.status === 'ok', `HTTP ${health.status}`);

  const unauth = await request('POST', '/api/location', {
    body: { device_id: DEVICE_ID, latitude: 17.4, longitude: 83.2, satellites: 7 },
  });
  check('POST /api/location without key is rejected', unauth.status === 401, `HTTP ${unauth.status}`);

  const invalid = await request('POST', '/api/location', {
    token: API_SECRET,
    body: { device_id: DEVICE_ID, latitude: 120, longitude: 83.2, satellites: 7 },
  });
  check('POST /api/location with bad latitude is rejected', invalid.status === 400, `HTTP ${invalid.status}`);

  const payload = {
    device_id: DEVICE_ID,
    latitude: 17.42345,
    longitude: 83.19876,
    altitude: 25.4,
    satellites: 7,
    timestamp: new Date().toISOString(),
  };
  const ingest = await request('POST', '/api/location', { token: API_SECRET, body: payload });
  check(
    'POST /api/location with key succeeds',
    ingest.status === 201 && ingest.json?.success === true && ingest.json?.message === 'Location received',
    `HTTP ${ingest.status}`,
  );

  const latest = await request('GET', `/api/locations/latest?device_id=${DEVICE_ID}`);
  check(
    'GET /api/locations/latest returns the fix',
    latest.status === 200 && Math.abs(latest.json?.location?.latitude - payload.latitude) < 1e-6,
    `HTTP ${latest.status}`,
  );

  const history = await request('GET', `/api/locations?device_id=${DEVICE_ID}&range=today&limit=5`);
  check(
    'GET /api/locations returns history',
    history.status === 200 && history.json?.locations?.length >= 1,
    `HTTP ${history.status}, ${history.json?.locations?.length ?? 0} rows`,
  );

  const route = await request('GET', `/api/route?device_id=${DEVICE_ID}&range=today`);
  check('GET /api/route returns points', route.status === 200 && route.json?.points?.length >= 1, `HTTP ${route.status}`);

  const device = await request('GET', `/api/device?device_id=${DEVICE_ID}`);
  check(
    'GET /api/device reports ONLINE',
    device.status === 200 && device.json?.device?.online === true,
    `HTTP ${device.status}, online=${device.json?.device?.online}`,
  );

  const stats = await request('GET', `/api/stats?device_id=${DEVICE_ID}&range=today`);
  check('GET /api/stats returns aggregates', stats.status === 200 && stats.json?.locations_recorded >= 1, `HTTP ${stats.status}`);

  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nSmoke test crashed:', err.message);
  console.error('Is the backend running?  npm run dev');
  process.exit(1);
});
