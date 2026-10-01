export const RANGE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom' },
];

/**
 * The UI stores `{ preset, from, to }` where from/to are
 * <input type="datetime-local"> strings. The backend accepts either
 * `range=<preset>` or explicit ISO `from`/`to` instants, so the user's browser
 * timezone is what gets applied.
 */
export function rangeToQuery({ preset, from, to } = {}) {
  if (preset === 'custom') {
    const query = {};
    if (from) query.from = new Date(from).toISOString();
    if (to) query.to = new Date(to).toISOString();
    return query;
  }
  return { range: preset || 'today' };
}

export function defaultRange() {
  return { preset: 'today', from: '', to: '' };
}
