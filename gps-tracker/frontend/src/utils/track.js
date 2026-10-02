/**
 * Travel analysis for the map.
 *
 * `analyzeTrack()` splits a list of GPS fixes into the legs the device
 * actually travelled (start -> stop -> start -> ...) and detects the places
 * where it came to a halt for a while. The map draws each leg as a dotted
 * "flow" line and pins every stop.
 *
 * A fix counts as stationary when its speed is at or below STOP_SPEED_MPS.
 * Speed comes straight from the GPS fix when present, otherwise it is derived
 * from the distance between consecutive fixes.
 */

const STOP_SPEED_MPS = 1; // <= 1 m/s (3.6 km/h) means the device is parked
const MIN_DWELL_SECONDS = 30; // a stop only counts after 30s in place
const STOP_RADIUS_METERS = 40; // tolerate GPS jitter around the stop centre
const GAP_SECONDS = 300; // a >5 min hole in the data ends the current leg
const MERGE_GAP_SECONDS = 90; // stops closer than this in time/space merge

function toMs(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function isValidPoint(point) {
  return (
    point != null &&
    Number.isFinite(Number(point.latitude)) &&
    Number.isFinite(Number(point.longitude))
  );
}

/** Great-circle distance in metres between two {latitude, longitude} points. */
export function haversineMeters(a, b) {
  const lat1 = Number(a.latitude);
  const lon1 = Number(a.longitude);
  const lat2 = Number(b.latitude);
  const lon2 = Number(b.longitude);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;

  const R = 6371008.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Polyline length in metres (same maths the summary chip uses). */
export function pathDistanceMeters(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += haversineMeters(points[i - 1], points[i]) ?? 0;
  }
  return total;
}

/** Merge overlapping / back-to-back stop episodes into one another. */
function mergeStops(stops) {
  const merged = [];
  for (const stop of stops) {
    const prev = merged[merged.length - 1];
    const gap =
      prev && toMs(stop.arrivedAt) !== null && toMs(prev.leftAt) !== null
        ? (toMs(stop.arrivedAt) - toMs(prev.leftAt)) / 1000
        : null;

    if (
      prev &&
      gap !== null &&
      gap < MERGE_GAP_SECONDS &&
      gap >= 0 &&
      haversineMeters(prev, stop) < STOP_RADIUS_METERS
    ) {
      prev.leftAt = stop.leftAt;
      prev.lastIndex = stop.lastIndex;
      prev.durationSeconds = (toMs(prev.leftAt) - toMs(prev.arrivedAt)) / 1000;
      prev.radius = Math.max(prev.radius, stop.radius);
    } else {
      merged.push({ ...stop });
    }
  }
  return merged;
}

/**
 * Analyse an ordered list of fixes.
 *
 * @param  points raw fixes: { latitude, longitude, timestamp?, speed? }
 * @return { segments, stops }
 *         segments — array of point arrays, each running from the start of the
 *                    journey (or a stop) to the next stop
 *         stops    — array of { latitude, longitude, arrivedAt, leftAt,
 *                    durationSeconds, radius } in time order
 */
export function analyzeTrack(points) {
  const pts = (points || []).filter(isValidPoint);
  if (pts.length === 0) return { segments: [], stops: [] };
  if (pts.length === 1) return { segments: [pts], stops: [] };

  // Without timestamps we cannot reason about dwell time - draw one leg.
  if (!pts.every((p) => toMs(p.timestamp) !== null)) {
    return { segments: [pts], stops: [] };
  }

  const stops = [];
  const gaps = [];
  let run = null; // active stationary run

  const speedAt = (i) => {
    const p = pts[i];
    if (Number.isFinite(p.speed)) return p.speed; // reported by the GPS
    const prev = pts[i - 1];
    const dt = (toMs(p.timestamp) - toMs(prev.timestamp)) / 1000;
    if (dt <= 0) return null;
    return (haversineMeters(prev, p) ?? 0) / dt;
  };

  const flushRun = () => {
    if (!run) return;
    const arrivedAt = pts[run.firstIndex].timestamp;
    const leftAt = pts[run.lastIndex].timestamp;
    const durationSeconds = (toMs(leftAt) - toMs(arrivedAt)) / 1000;

    if (durationSeconds >= MIN_DWELL_SECONDS && run.radius <= STOP_RADIUS_METERS) {
      stops.push({
        latitude: run.latitude,
        longitude: run.longitude,
        arrivedAt,
        leftAt,
        durationSeconds,
        radius: run.radius,
        firstIndex: run.firstIndex,
        lastIndex: run.lastIndex,
      });
    }
    run = null;
  };

  for (let i = 1; i < pts.length; i += 1) {
    const prev = pts[i - 1];
    const gap = (toMs(pts[i].timestamp) - toMs(prev.timestamp)) / 1000;

    // A long recording hole (device off / out of range) ends the leg.
    if (gap > GAP_SECONDS) {
      flushRun();
      gaps.push(i);
      continue;
    }

    const speed = speedAt(i);
    const stationary = speed !== null && speed <= STOP_SPEED_MPS;

    if (stationary) {
      if (!run) {
        run = {
          firstIndex: i - 1,
          lastIndex: i - 1,
          sumLat: Number(prev.latitude),
          sumLng: Number(prev.longitude),
          n: 1,
          radius: 0,
          latitude: Number(prev.latitude),
          longitude: Number(prev.longitude),
        };
      }
      run.lastIndex = i;
      run.sumLat += Number(pts[i].latitude);
      run.sumLng += Number(pts[i].longitude);
      run.n += 1;
      run.latitude = run.sumLat / run.n;
      run.longitude = run.sumLng / run.n;
      run.radius = Math.max(
        run.radius,
        haversineMeters(pts[i], { latitude: run.latitude, longitude: run.longitude }) ?? 0,
      );
    } else {
      flushRun(); // moving again (or speed unknown) closes the stop
    }
  }
  flushRun();

  const merged = mergeStops(stops);

  // Cut the trail into legs at every stop and every recording gap.
  const cuts = [
    ...merged.map((s) => ({ first: s.firstIndex, last: s.lastIndex })),
    ...gaps.map((i) => ({ first: i - 1, last: i })),
  ].sort((a, b) => a.first - b.first);

  const segments = [];
  let cursor = 0;
  for (const cut of cuts) {
    if (cut.last <= cursor) continue;
    if (cut.first > cursor) segments.push(pts.slice(cursor, cut.first + 1));
    cursor = cut.last;
  }
  if (cursor < pts.length) segments.push(pts.slice(cursor));

  return {
    segments: segments.filter((s) => s.length >= 2),
    stops: merged,
  };
}

/**
 * Extend a downloaded route with a fix that just arrived over the socket so
 * the dotted trail grows while the device is moving. Returns the SAME array
 * reference when there is nothing new, so memoised renders stay stable.
 */
export function appendLivePoint(points, latest) {
  const list = Array.isArray(points) ? points : [];
  if (!isValidPoint(latest)) return list;

  const point = {
    ...latest,
    latitude: Number(latest.latitude),
    longitude: Number(latest.longitude),
  };

  if (list.length === 0) return [point];

  const last = list[list.length - 1];
  const lastMs = toMs(last.timestamp);
  const nextMs = toMs(point.timestamp);

  if (lastMs !== null && nextMs !== null) {
    if (nextMs < lastMs) return list; // older than what we already drew
    if (nextMs === lastMs) return [...list.slice(0, -1), point]; // telemetry refresh
    return [...list, point];
  }

  // No timestamps: only extend the trail when the device really moved.
  if ((haversineMeters(last, point) ?? 0) < 1) return list;
  return [...list, point];
}
