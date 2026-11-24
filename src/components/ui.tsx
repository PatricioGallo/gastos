import { useEffect, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from 'react'
import { Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('glass-panel p-5 sm:p-6', className)} {...props} />
}

export function CardTitle({ children, sub, right }: { children: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="font-display text-base font-semibold text-white sm:text-lg">{children}</h2>
        {sub && <p className="mt-0.5 text-sm text-white/50">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  loading?: boolean
}

const variants = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost:
    'inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 font-medium text-white/70 transition hover:bg-white/5 hover:text-white disabled:opacity-50',
  danger:
    'inline-flex items-center justify-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50',
}

export function Button({ variant = 'primary', loading, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button className={cn(variants[variant], className)} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  )
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-white/50">{label}</span>
      {children}
    </label>
  )
}

/** Indicador de variación: sube = rojo (gasto), baja = verde. `invertir` para ingresos. */
export function Delta({ value, invertir, className }: { value: number | null; invertir?: boolean; className?: string }) {
  if (value == null || !Number.isFinite(value)) return <span className={cn('text-white/40', className)}>—</span>
  const malo = invertir ? value < 0 : value > 0
  const s = value.toLocaleString('es-AR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })
  return (
    <span
      className={cn(
        'tabular inline-flex items-center gap-0.5 font-semibold',
        Math.abs(value) < 0.05 ? 'text-white/50' : malo ? 'text-up' : 'text-down',
        className,
      )}
    >
      {value > 0 ? '▲' : value < 0 ? '▼' : '•'} {value > 0 ? '+' : ''}
      {s}%
    </span>
  )
}

export function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('glass-panel flex flex-col gap-1 p-4 sm:p-5', className)}>
      <span className="text-xs font-medium uppercase tracking-wide text-white/50">{label}</span>
      <span className="tabular font-display text-xl font-semibold text-white sm:text-2xl">{value}</span>
      {hint && <span className="text-xs text-white/55">{hint}</span>}
    </div>
  )
}

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-2 text-white/50">
      <Loader2 className="size-5 animate-spin" /> {label}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-white/50">{children}</div>
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        className={cn(
          'max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-surface-800 p-5 shadow-2xl sm:rounded-3xl sm:p-6',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-md',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10" aria-label="Cerrar">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div className={cn('inline-flex rounded-xl border border-white/10 bg-bg-800 p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-[10px] px-3 py-1.5 text-sm font-medium transition',
            value === o.value ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Dot({ color, className }: { color: string; className?: string }) {
  return <span className={cn('inline-block size-2.5 shrink-0 rounded-full', className)} style={{ background: color }} />
}
