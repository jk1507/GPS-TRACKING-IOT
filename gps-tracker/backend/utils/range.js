import { ApiError } from '../middleware/errorHandler.js';

/**
 * Turns query params into a concrete [from, to] instant range.
 *
 * The frontend always sends explicit `from`/`to` ISO instants (so the user's
 * browser timezone wins), but bare `?range=today` also works for curl testing.
 */
export function resolveDateRange(query = {}) {
  const { range, from, to } = query;

  if (from || to) {
    const fromDate = from ? parseInstant(from, 'from') : new Date(0);
    const toDate = to ? parseInstant(to, 'to') : new Date();
    if (fromDate > toDate) {
      throw new ApiError(400, '`from` must be earlier than `to`');
    }
    return { from: fromDate.toISOString(), to: toDate.toISOString() };
  }

  if (!range) return { from: null, to: null };

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  switch (String(range).toLowerCase()) {
    case 'today':
      return { from: startOfToday.toISOString(), to: now.toISOString() };

    case 'yesterday': {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 1);
      const end = new Date(startOfToday.getTime() - 1);
      return { from: start.toISOString(), to: end.toISOString() };
    }

    case '7d':
    case 'last7days': {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 6);
      return { from: start.toISOString(), to: now.toISOString() };
    }

    case '30d': {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 29);
      return { from: start.toISOString(), to: now.toISOString() };
    }

    case 'all':
      return { from: null, to: null };

    default:
      throw new ApiError(
        400,
        `Unknown range "${range}". Use today | yesterday | 7d | 30d | all, or pass from/to.`,
      );
  }
}

function parseInstant(value, field) {
  const text = String(value);
  // Bare "YYYY-MM-DD" means midnight UTC of that day.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T00:00:00.000Z`) : new Date(text);

  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, `\`${field}\` is not a valid ISO 8601 date (got "${value}")`);
  }
  return date;
}

/** Clamp a numeric query param. */
export function clampInt(value, { min, max, fallback }) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
