import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addMeses, labelPeriodo } from '@/lib/utils'

export function MonthPicker({ value, onChange }: { value: string; onChange: (p: string) => void }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-2xl border border-white/10 bg-bg-800 p-1">
      <button className="rounded-xl p-2 text-white/70 hover:bg-white/10" onClick={() => onChange(addMeses(value, -1))} aria-label="Mes anterior">
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-36 text-center font-display font-semibold">{labelPeriodo(value)}</span>
      <button className="rounded-xl p-2 text-white/70 hover:bg-white/10" onClick={() => onChange(addMeses(value, 1))} aria-label="Mes siguiente">
        <ChevronRight className="size-4" />
      </button>
    </div>
  )
}

export function YearPicker({ value, onChange }: { value: number; onChange: (y: number) => void }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-2xl border border-white/10 bg-bg-800 p-1">
      <button className="rounded-xl p-2 text-white/70 hover:bg-white/10" onClick={() => onChange(value - 1)} aria-label="Año anterior">
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-16 text-center font-display font-semibold">{value}</span>
      <button className="rounded-xl p-2 text-white/70 hover:bg-white/10" onClick={() => onChange(value + 1)} aria-label="Año siguiente">
        <ChevronRight className="size-4" />
      </button>
    </div>
  )
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-display text-2xl font-bold sm:text-3xl">{title}</h1>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}
