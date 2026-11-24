import { useState } from 'react'
import { useFinanzas } from '@/lib/finanzas'
import { usePrefs } from '@/lib/prefs'
import type { Grupo } from '@/lib/types'
import { MESES_CORTOS, cn, fmtCompactMoney, fmtMoney, fmtPct, labelPeriodo, mesesDelAnio, parsePeriodo, variacion } from '@/lib/utils'
import { PageHeader, YearPicker } from '@/components/Pickers'
import { Card, CardTitle, Delta, Dot, Empty, Spinner, Stat } from '@/components/ui'
import { StackedBars } from '@/components/Charts'

const fmtCell = (n: number) => (n ? Math.round(n).toLocaleString('es-AR') : '')

export default function Anual() {
  const f = useFinanzas()
  const { mes, vista } = usePrefs()
  const [anio, setAnio] = useState(parsePeriodo(mes).anio)
  const fmt = (n: number) => fmtMoney(n, vista)

  if (f.loading) return <Spinner />

  const meses = mesesDelAnio(anio)
  const porMesCat = meses.map((p) => f.porCategoria(p))
  const totales = meses.map((p) => f.totalMes(p))
  const conDatos = meses.map((p, i) => ({ p, i, total: totales[i] })).filter((m) => f.gastosDe(m.p).length)
  const totalAnual = totales.reduce((s, v) => s + v, 0)
  const promedio = conDatos.length ? totalAnual / conDatos.length : null
  const caro = conDatos.reduce<(typeof conDatos)[number] | null>((a, b) => (!a || b.total > a.total ? b : a), null)
  const barato = conDatos.reduce<(typeof conDatos)[number] | null>((a, b) => (!a || b.total < a.total ? b : a), null)
  const ultimoConDatos = conDatos.at(-1)?.p
  const inflAnio = f.inflacionAnual(anio, ultimoConDatos)

  // Categorías que tienen algún gasto en el año, agrupadas
  const catIds = new Set(porMesCat.flatMap((m) => [...m.keys()]))
  const cats = f.categorias.filter((c) => catIds.has(c.id))
  const grupos = [...new Map(cats.map((c) => [f.grupoDe(c).id, f.grupoDe(c)])).values()].sort((a, b) => a.orden - b.orden)

  // Gráfico por grupo
  const seriesMap = new Map<string, Grupo>()
  const barras = meses.map((p, i) => {
    const row: Record<string, string | number> = { label: MESES_CORTOS[i] }
    for (const { grupo, total } of f.porGrupo(p)) {
      row[grupo.id] = total
      seriesMap.set(grupo.id, grupo)
    }
    return row
  })
  const series = [...seriesMap.values()].sort((a, b) => a.orden - b.orden).map((g) => ({ key: g.id, name: g.nombre, color: g.color }))

  // Aumentos de gastos fijos (en pesos, para comparar con el IPC)
  const aumentos = f.categorias
    .filter((c) => c.tipo === 'fijo')
    .map((c) => {
      const vals = meses
        .map((p) => {
          const gs = f.gastosDe(p).filter((g) => g.categoria_id === c.id)
          return { p, v: gs.reduce((s, g) => s + f.convertir(f.miParte(g), g.moneda, p, 'ARS'), 0) }
        })
        .filter((x) => x.v > 0)
      if (vals.length < 2) return null
      const primero = vals[0]
      const ultimo = vals.at(-1)!
      const var_ = variacion(ultimo.v, primero.v)!
      const infl = f.inflacionEntre(primero.p, ultimo.p).valor
      let saltoMax: { p: string; pct: number } | null = null
      for (let i = 1; i < vals.length; i++) {
        const pct = variacion(vals[i].v, vals[i - 1].v)!
        if (!saltoMax || pct > saltoMax.pct) saltoMax = { p: vals[i].p, pct }
      }
      return { c, primero, ultimo, var_, infl, saltoMax }
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => b.var_ - a.var_)

  return (
    <div className="space-y-5">
      <PageHeader title={`Año ${anio}`}>
        <YearPicker value={anio} onChange={setAnio} />
      </PageHeader>

      {!conDatos.length ? (
        <Empty>No hay gastos cargados en {anio}.</Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Total del año" value={fmt(totalAnual)} hint={`${conDatos.length} meses con datos`} />
            <Stat label="Promedio mensual" value={fmt(promedio ?? NaN)} />
            <Stat label="Mes más caro" value={caro ? fmt(caro.total) : '—'} hint={caro && labelPeriodo(caro.p)} />
            <Stat label="Mes más barato" value={barato ? fmt(barato.total) : '—'} hint={barato && labelPeriodo(barato.p)} />
            <Stat
              label={`Inflación ${anio}`}
              value={fmtPct(inflAnio.valor, false)}
              hint={inflAnio.faltan ? `Faltan ${inflAnio.faltan} meses publicados` : 'Acumulada (IPC INDEC)'}
            />
            <Stat
              label="Gasto 1° vs último mes"
              value={<Delta value={variacion(conDatos.at(-1)!.total, conDatos[0].total)} className="text-xl sm:text-2xl" />}
              hint={`${labelPeriodo(conDatos[0].p, true)} → ${labelPeriodo(conDatos.at(-1)!.p, true)}`}
            />
            <Stat
              label="Inflación en ese lapso"
              value={fmtPct(f.inflacionEntre(conDatos[0].p, conDatos.at(-1)!.p).valor, false)}
              hint="Para comparar con tu suba"
            />
            <Stat
              label="Gasto en dólares"
              value={fmtMoney(
                conDatos.reduce((s, m) => s + f.convertir(m.total, vista, m.p, 'USD'), 0),
                'USD',
              )}
              hint="Total del año"
            />
          </div>

          <Card>
            <CardTitle sub="Por grupo">Gasto mensual</CardTitle>
            <StackedBars data={barras} series={series} fmt={fmt} fmtAxis={(n) => fmtCompactMoney(n, vista)} />
          </Card>

          <Card className="p-0 sm:p-0">
            <div className="p-5 pb-0 sm:p-6 sm:pb-0">
              <CardTitle sub={`Montos en ${vista === 'USD' ? 'dólares' : 'pesos'}`}>Planilla {anio}</CardTitle>
            </div>
            <div className="overflow-x-auto pb-2">
              <table className="tabular w-full min-w-[1100px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="text-xs text-white/50">
                    <th className="sticky left-0 z-10 bg-surface-800 px-4 py-2 text-left font-medium">Categoría</th>
                    {MESES_CORTOS.map((m) => (
                      <th key={m} className="px-2 py-2 text-right font-medium">{m}</th>
                    ))}
                    <th className="px-2 py-2 text-right font-semibold text-white/80">Total</th>
                    <th className="px-4 py-2 text-right font-medium">Prom.</th>
                  </tr>
                </thead>
                <tbody>
                  {grupos.map((g) => {
                    const cg = cats.filter((c) => f.grupoDe(c).id === g.id)
                    const subt = porMesCat.map((m) => cg.reduce((s, c) => s + (m.get(c.id) ?? 0), 0))
                    return [
                      <tr key={g.id} className="bg-white/[0.03]">
                        <td className="sticky left-0 z-10 bg-surface-700 px-4 py-1.5 font-semibold">
                          <span className="flex items-center gap-2"><Dot color={g.color} /> {g.nombre}</span>
                        </td>
                        {subt.map((v, i) => (
                          <td key={i} className="px-2 py-1.5 text-right font-semibold text-white/80">{fmtCell(v)}</td>
                        ))}
                        <td className="px-2 py-1.5 text-right font-semibold">{fmtCell(subt.reduce((a, b) => a + b, 0))}</td>
                        <td />
                      </tr>,
                      ...cg.map((c) => {
                        const vals = porMesCat.map((m) => m.get(c.id) ?? 0)
                        const tot = vals.reduce((a, b) => a + b, 0)
                        const n = vals.filter(Boolean).length
                        return (
                          <tr key={c.id} className="hover:bg-white/[0.03]">
                            <td className="sticky left-0 z-10 bg-surface-800 py-1.5 pl-9 pr-4 text-white/80">
                              {c.nombre}
                              {!c.activa && <span className="ml-1 text-xs text-white/30">(inactiva)</span>}
                            </td>
                            {vals.map((v, i) => {
                              const prev = vals[i - 1]
                              const subio = i > 0 && prev && v && v > prev * 1.001
                              return (
                                <td key={i} className={cn('px-2 py-1.5 text-right', subio ? 'text-up/90' : 'text-white/75')}>
                                  {fmtCell(v)}
                                </td>
                              )
                            })}
                            <td className="px-2 py-1.5 text-right font-medium">{fmtCell(tot)}</td>
                            <td className="px-4 py-1.5 text-right text-white/60">{n ? fmtCell(tot / n) : ''}</td>
                          </tr>
                        )
                      }),
                    ]
                  })}
                  <tr className="font-semibold">
                    <td className="sticky left-0 z-10 border-t border-white/10 bg-surface-800 px-4 py-2">Total</td>
                    {totales.map((v, i) => (
                      <td key={i} className="border-t border-white/10 px-2 py-2 text-right">{fmtCell(v)}</td>
                    ))}
                    <td className="border-t border-white/10 px-2 py-2 text-right text-brand-300">{fmtCell(totalAnual)}</td>
                    <td className="border-t border-white/10 px-4 py-2 text-right">{promedio ? fmtCell(promedio) : ''}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="px-5 pb-4 text-xs text-white/40 sm:px-6">En rojo: el monto subió respecto del mes anterior.</p>
          </Card>

          <Card>
            <CardTitle sub="Gastos fijos: primer vs último valor del año, comparado con la inflación del mismo período (en pesos)">
              Aumentos vs inflación
            </CardTitle>
            {aumentos.length ? (
              <div className="overflow-x-auto">
                <table className="tabular w-full min-w-[640px] text-sm">
                  <thead className="text-xs text-white/50">
                    <tr>
                      <th className="py-2 text-left font-medium">Categoría</th>
                      <th className="py-2 text-right font-medium">Desde</th>
                      <th className="py-2 text-right font-medium">Hasta</th>
                      <th className="py-2 text-right font-medium">Aumento</th>
                      <th className="py-2 text-right font-medium">Inflación</th>
                      <th className="py-2 text-right font-medium">Mayor salto</th>
                      <th className="py-2 pl-3 text-left font-medium">Resultado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {aumentos.map((a) => {
                      const real = a.infl != null ? ((1 + a.var_ / 100) / (1 + a.infl / 100) - 1) * 100 : null
                      return (
                        <tr key={a.c.id}>
                          <td className="py-2">
                            <span className="flex items-center gap-2"><Dot color={f.grupoDe(a.c).color} /> {a.c.nombre}</span>
                          </td>
                          <td className="py-2 text-right text-white/70">
                            {fmtMoney(a.primero.v)} <span className="text-xs text-white/40">{MESES_CORTOS[parsePeriodo(a.primero.p).mes]}</span>
                          </td>
                          <td className="py-2 text-right text-white/70">
                            {fmtMoney(a.ultimo.v)} <span className="text-xs text-white/40">{MESES_CORTOS[parsePeriodo(a.ultimo.p).mes]}</span>
                          </td>
                          <td className="py-2 text-right"><Delta value={a.var_} /></td>
                          <td className="py-2 text-right text-white/70">{fmtPct(a.infl)}</td>
                          <td className="py-2 text-right text-white/70">
                            {a.saltoMax && a.saltoMax.pct > 0 ? (
                              <>{fmtPct(a.saltoMax.pct)} <span className="text-xs text-white/40">{MESES_CORTOS[parsePeriodo(a.saltoMax.p).mes]}</span></>
                            ) : '—'}
                          </td>
                          <td className="py-2 pl-3">
                            {real == null ? (
                              <span className="text-white/40">Sin IPC</span>
                            ) : (
                              <span
                                className={cn(
                                  'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
                                  real > 1 ? 'bg-red-500/15 text-red-300' : real < -1 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-white/70',
                                )}
                              >
                                {real > 1 ? `▲ ${fmtPct(real, false)} sobre inflación` : real < -1 ? `▼ ${fmtPct(-real, false)} bajo inflación` : '≈ inflación'}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>Hacen falta al menos 2 meses cargados de un gasto fijo.</Empty>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
