import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ReactNode } from 'react'
import { Dot } from './ui'

export interface Serie {
  key: string
  name: string
  color: string
}

type Fmt = (n: number) => string

const SURFACE = '#131829'
const AXIS = { stroke: 'rgba(255,255,255,0.35)', fontSize: 11, tickLine: false, axisLine: false } as const
const GRID = <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />

function TooltipBox({
  active,
  payload,
  label,
  fmt,
  total,
}: {
  active?: boolean
  payload?: { name: string; value: number; color: string; dataKey: string }[]
  label?: string
  fmt: Fmt
  total?: boolean
}) {
  if (!active || !payload?.length) return null
  const rows = payload.filter((p) => p.value != null && p.value !== 0)
  const suma = rows.reduce((s, p) => s + (Number(p.value) || 0), 0)
  return (
    <div className="min-w-44 rounded-xl border border-white/10 bg-bg-950/95 px-3 py-2 text-xs shadow-xl">
      {label && <div className="mb-1.5 font-semibold text-white">{label}</div>}
      <div className="space-y-1">
        {[...rows].reverse().map((p) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-white/70">
              <Dot color={p.color} /> {p.name}
            </span>
            <span className="tabular text-white">{fmt(Number(p.value))}</span>
          </div>
        ))}
      </div>
      {total && rows.length > 1 && (
        <div className="mt-1.5 flex justify-between border-t border-white/10 pt-1.5 font-semibold">
          <span className="text-white/70">Total</span>
          <span className="tabular text-white">{fmt(suma)}</span>
        </div>
      )}
    </div>
  )
}

function LegendRow({ series }: { series: Serie[] }) {
  return (
    <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-white/70">
      {series.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5">
          <Dot color={s.color} /> {s.name}
        </span>
      ))}
    </div>
  )
}

export function StackedBars({
  data,
  series,
  fmt,
  fmtAxis,
  height = 280,
}: {
  data: Record<string, string | number>[]
  series: Serie[]
  fmt: Fmt
  fmtAxis: Fmt
  height?: number
}) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          {GRID}
          <XAxis dataKey="label" {...AXIS} />
          <YAxis {...AXIS} width={56} tickFormatter={fmtAxis} />
          <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<TooltipBox fmt={fmt} total />} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              stackId="a"
              fill={s.color}
              stroke={SURFACE}
              strokeWidth={2}
              maxBarSize={44}
              radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      {series.length > 1 && <LegendRow series={series} />}
    </div>
  )
}

export function GroupedBars({
  data,
  series,
  fmt,
  fmtAxis,
  height = 260,
}: {
  data: Record<string, string | number | null>[]
  series: Serie[]
  fmt: Fmt
  fmtAxis: Fmt
  height?: number
}) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={2}>
          {GRID}
          <XAxis dataKey="label" {...AXIS} />
          <YAxis {...AXIS} width={48} tickFormatter={fmtAxis} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" />
          <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<TooltipBox fmt={fmt} />} />
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} maxBarSize={22} radius={[4, 4, 0, 0]} />
          ))}
          <Legend content={() => <LegendRow series={series} />} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function Lines({
  data,
  series,
  fmt,
  fmtAxis,
  height = 260,
}: {
  data: Record<string, string | number | null>[]
  series: Serie[]
  fmt: Fmt
  fmtAxis: Fmt
  height?: number
}) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          {GRID}
          <XAxis dataKey="label" {...AXIS} />
          <YAxis {...AXIS} width={56} tickFormatter={fmtAxis} domain={['auto', 'auto']} />
          <Tooltip cursor={{ stroke: 'rgba(255,255,255,0.25)' }} content={<TooltipBox fmt={fmt} />} />
          {series.map((s) => (
            <Line
              key={s.key}
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 0, fill: s.color }}
              activeDot={{ r: 5, stroke: SURFACE, strokeWidth: 2 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {series.length > 1 && <LegendRow series={series} />}
    </div>
  )
}

export function Donut({
  data,
  fmt,
  center,
}: {
  data: { key: string; name: string; value: number; color: string }[]
  fmt: Fmt
  center?: ReactNode
}) {
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="92%"
            stroke={SURFACE}
            strokeWidth={2}
            paddingAngle={0}
            isAnimationActive={false}
          >
            {data.map((d) => (
              <Cell key={d.key} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="rounded-xl border border-white/10 bg-bg-950/95 px-3 py-2 text-xs shadow-xl">
                  <span className="flex items-center gap-1.5 text-white/70">
                    <Dot color={(payload[0].payload as { color: string }).color} /> {payload[0].name}
                  </span>
                  <div className="tabular mt-0.5 font-semibold text-white">{fmt(Number(payload[0].value))}</div>
                </div>
              ) : null
            }
          />
        </PieChart>
      </ResponsiveContainer>
      {center && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center">{center}</div>}
    </div>
  )
}
