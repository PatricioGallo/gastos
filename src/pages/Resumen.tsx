import { Link } from 'react-router-dom'
import { useFinanzas } from '@/lib/finanzas'
import { usePrefs } from '@/lib/prefs'
import { addMeses, fmtCompactMoney, fmtMoney, fmtPct, labelPeriodo, parsePeriodo, periodo, variacion } from '@/lib/utils'
import { MonthPicker, PageHeader } from '@/components/Pickers'
import { Card, CardTitle, Delta, Dot, Empty, Spinner, Stat } from '@/components/ui'
import { Donut, StackedBars } from '@/components/Charts'

export default function Resumen() {
  const f = useFinanzas()
  const { mes, setMes, vista } = usePrefs()
  const fmt = (n: number) => fmtMoney(n, vista)
  const fmtAxis = (n: number) => fmtCompactMoney(n, vista)

  if (f.loading) return <Spinner />
  if (f.error) return <Empty>Error cargando datos: {f.error.message}</Empty>

  const { anio } = parsePeriodo(mes)
  const prev = addMeses(mes, -1)
  const total = f.totalMes(mes)
  const totalPrev = f.totalMes(prev)
  const totalAnioAnt = f.totalMes(addMeses(mes, -12))
  const ingreso = f.ingresoMes(mes)
  const ahorro = ingreso != null ? ingreso - total : null

  // Promedio del año hasta el mes elegido (solo meses con gastos)
  const mesesAnio = Array.from({ length: parsePeriodo(mes).mes + 1 }, (_, i) => periodo(anio, i)).filter(
    (p) => f.gastosDe(p).length,
  )
  const promedio = mesesAnio.length ? mesesAnio.reduce((s, p) => s + f.totalMes(p), 0) / mesesAnio.length : null

  // IPC: si todavía no se publicó el del mes, se muestra el último disponible
  let pIpc = mes
  while (f.ipc(pIpc) == null && pIpc > addMeses(mes, -3)) pIpc = addMeses(pIpc, -1)
  const ipcMes = f.ipc(pIpc)
  const ipcAnio = f.inflacionAnual(anio, mes).valor

  // Últimos 12 meses por grupo
  const ultimos = Array.from({ length: 12 }, (_, i) => addMeses(mes, i - 11))
  const gruposUsados = new Map<string, { key: string; name: string; color: string; orden: number }>()
  const barras = ultimos.map((p) => {
    const row: Record<string, string | number> = { label: labelPeriodo(p, true) }
    for (const { grupo, total } of f.porGrupo(p)) {
      row[grupo.id] = total
      gruposUsados.set(grupo.id, { key: grupo.id, name: grupo.nombre, color: grupo.color, orden: grupo.orden })
    }
    return row
  })
  const series = [...gruposUsados.values()].sort((a, b) => a.orden - b.orden)

  const porGrupo = f.porGrupo(mes)
  const catMes = f.porCategoria(mes)
  const catPrev = f.porCategoria(prev)
  const topCats = [...catMes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  const maxCat = topCats[0]?.[1] ?? 1
  const fijos = f.totalMes(mes, f.esFijo)
  const variables = total - fijos

  const sinDatos = !f.gastos.length

  return (
    <div className="space-y-5">
      <PageHeader title="Resumen">
        <MonthPicker value={mes} onChange={setMes} />
      </PageHeader>

      {sinDatos && (
        <Empty>
          Todavía no cargaste gastos.{' '}
          <Link to="/cargar" className="font-semibold text-brand-400 underline">
            Cargá el primer mes
          </Link>{' '}
          o importá tu Excel desde{' '}
          <Link to="/config" className="font-semibold text-brand-400 underline">
            Ajustes
          </Link>
          .
        </Empty>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Gasto del mes"
          value={fmt(total)}
          hint={
            <span className="flex flex-wrap gap-x-2">
              <span>
                vs mes ant. <Delta value={variacion(total, totalPrev)} />
              </span>
              {totalAnioAnt > 0 && (
                <span>
                  vs año ant. <Delta value={variacion(total, totalAnioAnt)} />
                </span>
              )}
            </span>
          }
        />
        <Stat
          label="Ingresos"
          value={fmt(ingreso ?? NaN)}
          hint={
            ingreso != null ? (
              <>% gastado: <b className="text-white">{fmtPct((total / ingreso) * 100, false)}</b></>
            ) : (
              <Link to="/ingresos" className="text-brand-400 underline">Cargar salario</Link>
            )
          }
        />
        <Stat
          label="Te quedó"
          value={<span className={ahorro != null && ahorro < 0 ? 'text-up' : ''}>{fmt(ahorro ?? NaN)}</span>}
          hint={ingreso ? `Ahorro: ${fmtPct(((ahorro ?? 0) / ingreso) * 100, false)} del ingreso` : '—'}
        />
        <Stat
          label={`Promedio ${anio}`}
          value={fmt(promedio ?? NaN)}
          hint={
            promedio ? (
              <>este mes vs promedio <Delta value={variacion(total, promedio)} /></>
            ) : (
              '—'
            )
          }
        />
        <Stat
          label={`Inflación ${labelPeriodo(pIpc, true)}`}
          value={fmtPct(ipcMes, false)}
          hint={`Acumulada ${anio}: ${fmtPct(ipcAnio, false)}`}
        />
        <Stat
          label="Tu inflación (fijos)"
          value={<Delta value={f.inflacionPersonal(mes)} className="text-xl sm:text-2xl" />}
          hint="Suba de tus gastos fijos mensuales vs mes anterior"
        />
        <Stat label="Gastos fijos" value={fmt(fijos)} hint={total ? `${fmtPct((fijos / total) * 100, false)} del total` : '—'} />
        <Stat
          label={`Dólar ${labelPeriodo(mes, true)}`}
          value={fmtMoney(f.dolar(mes), 'ARS')}
          hint={`Gasto en USD: ${fmtMoney(f.convertir(total, vista, mes, 'USD'), 'USD')}`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle sub="Últimos 12 meses, por grupo">Evolución del gasto</CardTitle>
          <StackedBars data={barras} series={series} fmt={fmt} fmtAxis={fmtAxis} />
        </Card>

        <Card>
          <CardTitle sub={labelPeriodo(mes)}>Por grupo</CardTitle>
          {porGrupo.length ? (
            <>
              <Donut
                data={porGrupo.map((g) => ({ key: g.grupo.id, name: g.grupo.nombre, value: g.total, color: g.grupo.color }))}
                fmt={fmt}
                center={
                  <div>
                    <div className="text-xs text-white/50">Total</div>
                    <div className="tabular font-display text-lg font-semibold">{fmtCompactMoney(total, vista)}</div>
                  </div>
                }
              />
              <ul className="mt-3 space-y-1.5 text-sm">
                {porGrupo.map((g) => (
                  <li key={g.grupo.id} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-white/80">
                      <Dot color={g.grupo.color} /> {g.grupo.nombre}
                    </span>
                    <span className="tabular text-white/90">
                      {fmt(g.total)} <span className="text-white/40">· {fmtPct((g.total / total) * 100, false, 0)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <Empty>Sin gastos este mes</Empty>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle sub="Comparado con el mes anterior">Principales gastos del mes</CardTitle>
          {topCats.length ? (
            <ul className="space-y-3">
              {topCats.map(([id, v]) => {
                const c = f.catById.get(id)
                const g = f.grupoDe(c)
                return (
                  <li key={id}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        <Dot color={g.color} />
                        {c?.nombre ?? '¿?'}
                        <span className="text-xs text-white/40">{c?.tipo === 'fijo' ? 'fijo' : 'variable'}</span>
                      </span>
                      <span className="flex items-center gap-3">
                        <Delta value={variacion(v, catPrev.get(id))} className="text-xs" />
                        <span className="tabular w-28 text-right">{fmt(v)}</span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/5">
                      <div className="h-full rounded-full" style={{ width: `${(v / maxCat) * 100}%`, background: g.color }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <Empty>Sin gastos este mes</Empty>
          )}
        </Card>

        <Card>
          <CardTitle sub={labelPeriodo(mes)}>Fijos vs variables</CardTitle>
          <div className="space-y-4">
            {[
              { label: 'Fijos', v: fijos, color: '#3987e5' },
              { label: 'Variables', v: variables, color: '#d95926' },
            ].map((r) => (
              <div key={r.label}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="flex items-center gap-2"><Dot color={r.color} /> {r.label}</span>
                  <span className="tabular">{fmt(r.v)}</span>
                </div>
                <div className="h-2 rounded-full bg-white/5">
                  <div className="h-full rounded-full" style={{ width: `${total ? (r.v / total) * 100 : 0}%`, background: r.color }} />
                </div>
              </div>
            ))}
            {ingreso != null && (
              <div className="rounded-2xl bg-white/5 p-3 text-sm text-white/70">
                Los fijos se llevan <b className="text-white">{fmtPct((fijos / ingreso) * 100, false)}</b> de tus ingresos.
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
