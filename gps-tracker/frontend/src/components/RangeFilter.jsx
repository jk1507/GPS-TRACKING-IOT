import { toDateTimeLocal } from '../utils/format.js';
import { RANGE_PRESETS } from '../utils/range.js';
import Icon from './Icon.jsx';

/**
 * Controlled range picker.
 *
 * value:    { preset, from, to }   (from/to are datetime-local strings)
 * onChange: (nextValue) => void
 */
export default function RangeFilter({ value, onChange, extra, showCustom = true }) {
  const { preset = 'today', from = '', to = '' } = value;

  const selectPreset = (next) => {
    if (next === 'custom') {
      onChange({
        preset: 'custom',
        from: from || toDateTimeLocal(new Date(Date.now() - 24 * 3600 * 1000)),
        to: to || toDateTimeLocal(new Date()),
      });
      return;
    }
    onChange({ preset: next, from: '', to: '' });
  };

  const presets = showCustom ? RANGE_PRESETS : RANGE_PRESETS.filter((p) => p.value !== 'custom');

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
        {presets.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => selectPreset(item.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              preset === item.value
                ? 'bg-brand-600 text-white'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {preset === 'custom' ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-800 dark:bg-slate-900">
          <Icon name="clock" size={14} className="text-slate-400" />
          <input
            type="datetime-local"
            className="input w-auto border-0 bg-transparent px-1 py-0.5 text-xs focus:ring-0 dark:bg-transparent"
            value={from}
            onChange={(e) => onChange({ preset: 'custom', from: e.target.value, to })}
            aria-label="From"
          />
          <span className="text-xs text-slate-400">to</span>
          <input
            type="datetime-local"
            className="input w-auto border-0 bg-transparent px-1 py-0.5 text-xs focus:ring-0 dark:bg-transparent"
            value={to}
            onChange={(e) => onChange({ preset: 'custom', from, to: e.target.value })}
            aria-label="To"
          />
        </div>
      ) : null}

      {extra}
    </div>
  );
}
