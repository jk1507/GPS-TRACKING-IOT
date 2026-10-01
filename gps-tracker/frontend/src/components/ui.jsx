import Icon from './Icon.jsx';

export function Spinner({ size = 22, className = '' }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    />
  );
}

export function EmptyState({ title, description, icon = 'info', action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
        <Icon name={icon} size={22} />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
        {description ? (
          <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorBanner({ message, onRetry, className = '' }) {
  if (!message) return null;
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300 ${className}`}
      role="alert"
    >
      <Icon name="alert" size={18} className="mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="font-medium">{message}</p>
      </div>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="btn btn-sm btn-outline shrink-0">
          <Icon name="refresh" size={14} />
          Retry
        </button>
      ) : null}
    </div>
  );
}

const TONES = {
  default: 'text-slate-900 dark:text-white',
  brand: 'text-brand-600 dark:text-brand-400',
  success: 'text-emerald-600 dark:text-emerald-400',
  danger: 'text-rose-600 dark:text-rose-400',
  warning: 'text-amber-600 dark:text-amber-400',
};

export function StatCard({ label, value, unit, hint, icon, tone = 'default', loading = false }) {
  return (
    <div className="card card-hover p-4 transition-shadow animate-fade-in-up">
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </span>
        {icon ? (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <Icon name={icon} size={16} />
          </span>
        ) : null}
      </div>

      <div className={`mt-2 flex items-baseline gap-1 font-mono text-2xl font-semibold tabular-nums ${TONES[tone]}`}>
        {loading ? <span className="text-slate-400">...</span> : value ?? '\u2014'}
        {unit && !loading ? <span className="text-sm font-medium text-slate-400">{unit}</span> : null}
      </div>

      {hint ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
          {title}
        </h1>
        {subtitle ? <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function InfoRow({ label, value, mono = true, icon }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-2.5 last:border-0 dark:border-slate-800">
      <span className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        {icon ? <Icon name={icon} size={15} /> : null}
        {label}
      </span>
      <span
        className={`text-right text-sm font-medium text-slate-800 dark:text-slate-100 ${mono ? 'font-mono tabular-nums' : ''}`}
      >
        {value ?? '\u2014'}
      </span>
    </div>
  );
}

export function Badge({ children, tone = 'default', className = '' }) {
  const tones = {
    default: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    brand: 'bg-brand-500/15 text-brand-700 dark:text-brand-300',
    success: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    danger: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
    warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  };
  return <span className={`chip ${tones[tone]} ${className}`}>{children}</span>;
}
