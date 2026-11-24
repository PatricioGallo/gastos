import { useEffect, useState, type FormEvent } from 'react'
import { Briefcase, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useFinanzas, type Finanzas } from '@/lib/finanzas'
import { usePrefs } from '@/lib/prefs'
import { useInvalidate } from '@/lib/queries'
import { supabase } from '@/lib/supabaseClient'
import type { Moneda, Trabajo } from '@/lib/types'
import { MESES, MESES_CORTOS, addMeses, fmtCompactMoney, fmtMoney, fmtPct, labelPeriodo, mesesDelAnio, parseMonto, parsePeriodo, variacion } from '@/lib/utils'
import { PageHeader, YearPicker } from '@/components/Pickers'
import { Button, Card, CardTitle, Delta, Empty, Field, Modal, Segmented, Spinner, Stat } from '@/components/ui'
import { Lines } from '@/components/Charts'

const fmtInput = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 2 })

// ---------------------------------------------------------------------------
// Cálculos

/** Sueldo nominal de un trabajo en un mes (en su moneda), o null si no hay. */
function sueldo(f: Finanzas, t: Trabajo, p: string) {
  const rows = f.ingresosDe(p).filter((i) => i.trabajo_id === t.id)
  return rows.length ? rows.reduce((s, i) => s + i.monto, 0) : null
}

/** Suma de sueldos del mes en pesos (null si no hay ninguno). */
function sueldoTotalARS(f: Finanzas, p: string) {
  const rows = f.ingresosDe(p).filter((i) => i.trabajo_id != null)
  return rows.length ? rows.reduce((s, i) => s + f.convertir(i.monto, i.moneda, p, 'ARS'), 0) : null
}

interface Aumento {
  trabajo: Trabajo
  p: string
  antes: number
  despues: number
  pct: number
  desde: string
  infl: number | null
  /** variación del sueldo medido en pesos, descontada la inflación */
  real: number | null
}

function calcularAumentos(f: Finanzas, t: Trabajo): Aumento[] {
  const meses = [...new Set(f.ingresos.filter((i) => i.trabajo_id === t.id).map((i) => i.periodo))].sort()
  const out: Aumento[] = []
  let desde = meses[0]
  for (let i = 1; i < meses.length; i++) {
    const p = meses[i]
    const antes = sueldo(f, t, meses[i - 1])!
    const despues = sueldo(f, t, p)!
    if (Math.abs(despues - antes) / antes < 0.001) continue
    const infl = f.inflacionEntre(desde, p).valor
    const arsDesde = f.convertir(sueldo(f, t, desde)!, t.moneda, desde, 'ARS')
    const arsHoy = f.convertir(despues, t.moneda, p, 'ARS')
    const nominalArs = variacion(arsHoy, arsDesde)
    const real = nominalArs != null && infl != null ? ((1 + nominalArs / 100) / (1 + infl / 100) - 1) * 100 : null
    out.push({ trabajo: t, p, antes, despues, pct: variacion(despues, antes)!, desde, infl, real })
    desde = p
  }
  return out
}

// ---------------------------------------------------------------------------
// Componentes

function TrabajoModal({ open, onClose, trabajo, orden }: { open: boolean; onClose: () => void; trabajo: Trabajo | null; orden: number }) {
  const invalidate = useInvalidate()
  const [nombre, setNombre] = useState('')
  const [moneda, setMoneda] = useState<Moneda>('ARS')
  const [activo, setActivo] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setNombre(trabajo?.nombre ?? '')
    setMoneda(trabajo?.moneda ?? 'ARS')
    setActivo(trabajo?.activo ?? true)
  }, [open, trabajo])

  async function guardar() {
    if (!nombre.trim()) return toast.error('Poné un nombre')
    setSaving(true)
    const row = { nombre: nombre.trim(), moneda, activo }
    const { error } = trabajo
      ? await supabase.from('trabajos').update(row).eq('id', trabajo.id)
      : await supabase.from('trabajos').insert({ ...row, orden })
    if (!error && trabajo && moneda !== trabajo.moneda) {
      // mantener coherente la moneda de los sueldos ya cargados
      await supabase.from('ingresos').update({ moneda }).eq('trabajo_id', trabajo.id)
    }
    setSaving(false)
    if (error) return toast.error(error.code === '23505' ? 'Ya existe un trabajo con ese nombre' : error.message)
    await invalidate('trabajos', 'ingresos')
    onClose()
  }

  async function borrar() {
    if (!trabajo || !confirm(`¿Borrar "${trabajo.nombre}" y todos sus sueldos cargados? Si ya no trabajás ahí, mejor desactivalo.`)) return
    const { error } = await supabase.from('trabajos').delete().eq('id', trabajo.id)
    if (error) return toast.error(error.message)
    await invalidate('trabajos', 'ingresos')
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={trabajo ? 'Editar trabajo' : 'Nuevo trabajo'}>
      <div className="space-y-4">
        <Field label="Nombre">
          <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Empresa X, Freelance" autoFocus />
        </Field>
        <Field label="Cobro en">
          <Segmented
            value={moneda}
            onChange={setMoneda}
            options={[
              { value: 'ARS', label: 'Pesos' },
              { value: 'USD', label: 'Dólares' },
            ]}
          />
        </Field>
        {trabajo && (
          <label className="flex items-center gap-2 text-sm text-white/80">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="size-4 accent-emerald-500" />
            Activo (si lo desactivás se conserva el historial)
          </label>
        )}
        <div className="flex gap-2">
          {trabajo && (
            <Button variant="danger" onClick={borrar}>
              <Trash2 className="size-4" />
            </Button>
          )}
          <Button className="flex-1" onClick={guardar} loading={saving}>
            Guardar
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** Casillero del sueldo de un trabajo en un mes. Se guarda al salir. */
function InputSueldo({ f, p, t }: { f: Finanzas; p: string; t: Trabajo }) {
  const invalidate = useInvalidate()
  const rows = f.ingresosDe(p).filter((i) => i.trabajo_id === t.id)
  const actual = rows.reduce((s, i) => s + i.monto, 0)
  const [texto, setTexto] = useState('')
  useEffect(() => setTexto(rows.length ? fmtInput(actual) : ''), [actual, rows.length])

  async function commit() {
    const n = texto.trim() ? parseMonto(texto) : null
    if (texto.trim() && n == null) return toast.error('Monto inválido')
    if (n === (rows.length ? actual : null)) return
    if (rows.length) {
      const { error } = await supabase.from('ingresos').delete().in('id', rows.map((r) => r.id))
      if (error) return toast.error(error.message)
    }
    if (n) {
      const { error } = await supabase
        .from('ingresos')
        .insert({ periodo: p, trabajo_id: t.id, concepto: t.nombre, monto: n, moneda: t.moneda })
      if (error) return toast.error(error.message)
    }
    await invalidate('ingresos')
  }

  return (
    <div className="relative min-w-0 flex-1">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-white/40">
        {t.moneda === 'USD' ? 'US$' : '$'}
      </span>
      <input
        className="input tabular py-2 pl-9 pr-2 text-right"
        inputMode="decimal"
        placeholder="—"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </div>
  )
}

function FilaMes({ f, p, trabajos }: { f: Finanzas; p: string; trabajos: Trabajo[] }) {
  const invalidate = useInvalidate()
  const extras = f.ingresosDe(p).filter((i) => i.trabajo_id == null)
  const total = sueldoTotalARS(f, p)
  const prev = sueldoTotalARS(f, addMeses(p, -1))

  async function borrar(id: string) {
    const { error } = await supabase.from('ingresos').delete().eq('id', id)
    if (error) return toast.error(error.message)
    await invalidate('ingresos')
  }

  return (
    <div className="py-2">
      <div className="flex items-center gap-2">
        <div className="w-20 shrink-0 sm:w-28">
          <div className="text-sm font-medium">{MESES[parsePeriodo(p).mes]}</div>
          {total != null && trabajos.length > 1 && (
            <div className="tabular text-[11px] text-white/45" title="Total en pesos">
              {fmtCompactMoney(total)}
            </div>
          )}
        </div>
        {trabajos.map((t) => (
          <InputSueldo key={t.id} f={f} p={p} t={t} />
        ))}
        <div className="hidden w-16 shrink-0 text-right text-xs sm:block">
          {total != null && prev != null && <Delta value={variacion(total, prev)} invertir />}
        </div>
      </div>
      {extras.map((x) => (
        <div key={x.id} className="mt-1 flex items-center gap-3 pl-20 text-xs text-white/60 sm:pl-28">
          <span className="flex-1">
            + {x.concepto}
            {x.nota ? ` · ${x.nota}` : ''}
          </span>
          <span className="tabular">{fmtMoney(x.monto, x.moneda)}</span>
          <button onClick={() => borrar(x.id)} className="p-1 text-white/30 hover:text-red-300" title="Borrar">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

function ExtraModal({ open, onClose, anio }: { open: boolean; onClose: () => void; anio: number }) {
  const invalidate = useInvalidate()
  const [mes, setMes] = useState(new Date().getMonth())
  const [concepto, setConcepto] = useState('Aguinaldo')
  const [monto, setMonto] = useState('')
  const [moneda, setMoneda] = useState<Moneda>('ARS')
  const [saving, setSaving] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const n = parseMonto(monto)
    if (!n) return toast.error('Monto inválido')
    setSaving(true)
    const { error } = await supabase
      .from('ingresos')
      .insert({ periodo: `${anio}-${String(mes + 1).padStart(2, '0')}-01`, concepto: concepto.trim() || 'Extra', monto: n, moneda })
    setSaving(false)
    if (error) return toast.error(error.message)
    await invalidate('ingresos')
    setMonto('')
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={`Ingreso extra ${anio}`}>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Mes">
          <select className="input" value={mes} onChange={(e) => setMes(Number(e.target.value))}>
            {MESES.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Concepto">
          <input className="input" list="conceptos" value={concepto} onChange={(e) => setConcepto(e.target.value)} />
          <datalist id="conceptos">
            <option value="Aguinaldo" />
            <option value="Bono" />
            <option value="Freelance" />
            <option value="Venta" />
          </datalist>
        </Field>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Monto">
            <input className="input tabular" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} />
          </Field>
          <Field label="Moneda">
            <Segmented value={moneda} onChange={setMoneda} options={[{ value: 'ARS', label: 'ARS' }, { value: 'USD', label: 'USD' }]} />
          </Field>
        </div>
        <Button type="submit" className="w-full" loading={saving}>
          Guardar
        </Button>
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Página

export default function Ingresos() {
  const f = useFinanzas()
  const { mes, vista } = usePrefs()
  const [anio, setAnio] = useState(parsePeriodo(mes).anio)
  const [extraOpen, setExtraOpen] = useState(false)
  const [trabajoModal, setTrabajoModal] = useState<{ t: Trabajo | null } | null>(null)

  if (f.loading) return <Spinner />

  const meses = mesesDelAnio(anio)
  // Columnas: trabajos activos + los inactivos que tengan sueldos ese año
  const columnas = f.trabajos.filter((t) => t.activo || meses.some((p) => sueldo(f, t, p) != null))

  // Serie total en pesos (todos los meses con algún sueldo)
  const serie = [...new Set(f.ingresos.filter((i) => i.trabajo_id).map((i) => i.periodo))]
    .sort()
    .map((p) => ({ p, ars: sueldoTotalARS(f, p)! }))
  const ultimo = serie.at(-1)

  const aumentos = f.trabajos.flatMap((t) => calcularAumentos(f, t)).sort((a, b) => a.p.localeCompare(b.p))
  const ultimoAumento = aumentos.at(-1)

  // Año seleccionado (sueldo total en pesos)
  const delAnio = serie.filter((s) => s.p.startsWith(String(anio)))
  const base = serie.filter((s) => s.p < `${anio}-01-01`).at(-1) ?? delAnio[0]
  const fin = delAnio.at(-1)
  const aumAnio = base && fin && base !== fin ? variacion(fin.ars, base.ars) : null
  const inflAnio = base && fin && base !== fin ? f.inflacionEntre(base.p, fin.p).valor : null
  const poder = aumAnio != null && inflAnio != null ? ((1 + aumAnio / 100) / (1 + inflAnio / 100) - 1) * 100 : null

  const usdHoy = ultimo ? f.convertir(ultimo.ars, 'ARS', ultimo.p, 'USD') : null
  const hace12 = ultimo ? serie.find((s) => s.p === addMeses(ultimo.p, -12)) : null
  const usd12 = hace12 ? f.convertir(hace12.ars, 'ARS', hace12.p, 'USD') : null

  // Gráficos: últimos 24 meses
  const ref = ultimo?.p
  const ventana = ref ? serie.filter((s) => s.p > addMeses(ref, -24)) : []
  const datos = ventana.map((s) => ({
    label: labelPeriodo(s.p, true),
    nominal: s.ars,
    real: s.ars * (1 + (f.inflacionEntre(s.p, ref!).valor ?? 0) / 100),
  }))
  const datosUsd = ventana.map((s) => ({ label: labelPeriodo(s.p, true), usd: f.convertir(s.ars, 'ARS', s.p, 'USD') }))

  const totalIngresosAnio = meses.reduce((s, p) => s + (f.ingresoMes(p) ?? 0), 0)

  return (
    <div className="space-y-5">
      <PageHeader title="Ingresos y sueldos">
        <YearPicker value={anio} onChange={setAnio} />
      </PageHeader>

      <Card>
        <CardTitle
          sub="Cada trabajo con su moneda. Los aumentos se calculan por separado."
          right={
            <Button variant="ghost" onClick={() => setTrabajoModal({ t: null })}>
              <Plus className="size-4" /> Trabajo
            </Button>
          }
        >
          Mis trabajos
        </CardTitle>
        {f.trabajos.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {f.trabajos.map((t) => {
              const meses_ = [...new Set(f.ingresos.filter((i) => i.trabajo_id === t.id).map((i) => i.periodo))].sort()
              const ult = meses_.at(-1)
              const actual = ult ? sueldo(f, t, ult) : null
              const aum = calcularAumentos(f, t).at(-1)
              return (
                <div key={t.id} className={`rounded-2xl border border-white/8 bg-white/[0.02] p-4 ${t.activo ? '' : 'opacity-50'}`}>
                  <div className="mb-2 flex items-center gap-2">
                    <Briefcase className="size-4 text-white/50" />
                    <span className="flex-1 font-semibold">{t.nombre}</span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/70">{t.moneda === 'USD' ? 'Dólares' : 'Pesos'}</span>
                    <button className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white" onClick={() => setTrabajoModal({ t })} title="Editar">
                      <Pencil className="size-3.5" />
                    </button>
                  </div>
                  <div className="tabular font-display text-xl font-semibold">{actual != null ? fmtMoney(actual, t.moneda) : '—'}</div>
                  <div className="mt-1 text-xs text-white/55">
                    {ult ? labelPeriodo(ult) : 'Sin sueldos cargados'}
                    {aum && (
                      <>
                        {' · '}último aumento <Delta value={aum.pct} invertir /> en {labelPeriodo(aum.p, true)}
                        {aum.real != null && (
                          <>
                            {' · '}vs inflación <Delta value={aum.real} invertir />
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <Empty>
            Agregá tus trabajos (por ejemplo uno en pesos y otro en dólares) para cargar los sueldos.{' '}
            <button className="font-semibold text-brand-400 underline" onClick={() => setTrabajoModal({ t: null })}>
              Agregar trabajo
            </button>
          </Empty>
        )}
      </Card>

      {serie.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Sueldo total actual" value={fmtMoney(ultimo!.ars)} hint={`${labelPeriodo(ultimo!.p)} · en pesos`} />
          <Stat
            label="En dólares"
            value={fmtMoney(usdHoy, 'USD')}
            hint={usd12 ? <>vs hace 12 meses <Delta value={variacion(usdHoy, usd12)} invertir /></> : 'Al dólar del mes'}
          />
          <Stat
            label="Último aumento"
            value={ultimoAumento ? <Delta value={ultimoAumento.pct} invertir className="text-xl sm:text-2xl" /> : '—'}
            hint={ultimoAumento ? `${ultimoAumento.trabajo.nombre} · ${labelPeriodo(ultimoAumento.p)}` : 'Todavía sin cambios de sueldo'}
          />
          <Stat
            label="Inflación desde ese aumento"
            value={fmtPct(ultimoAumento && ultimo ? f.inflacionEntre(ultimoAumento.p, ultimo.p > ultimoAumento.p ? ultimo.p : ultimoAumento.p).valor : null, false)}
            hint="Lo que se fue comiendo desde entonces"
          />
          <Stat
            label={`Sueldo ${anio} (en pesos)`}
            value={<Delta value={aumAnio} invertir className="text-xl sm:text-2xl" />}
            hint={base && fin ? `${labelPeriodo(base.p, true)} → ${labelPeriodo(fin.p, true)}` : '—'}
          />
          <Stat label={`Inflación ${anio}`} value={fmtPct(inflAnio, false)} hint="Mismo período" />
          <Stat
            label="Poder adquisitivo"
            value={<Delta value={poder} invertir className="text-xl sm:text-2xl" />}
            hint={poder == null ? '—' : poder >= 0 ? 'Tus sueldos le ganaron a la inflación' : 'La inflación le ganó a tus sueldos'}
          />
          <Stat label={`Ingresos totales ${anio}`} value={fmtMoney(totalIngresosAnio, vista)} hint="Sueldos + extras" />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle
            sub="Se guarda al salir de cada casillero"
            right={
              <Button variant="ghost" onClick={() => setExtraOpen(true)}>
                <Plus className="size-4" /> Extra
              </Button>
            }
          >
            Sueldos {anio}
          </CardTitle>
          {columnas.length ? (
            <>
              <div className="flex items-center gap-2 border-b border-white/5 pb-2 text-xs font-medium text-white/50">
                <div className="w-20 shrink-0 sm:w-28">Mes</div>
                {columnas.map((t) => (
                  <div key={t.id} className="min-w-0 flex-1 truncate text-right">
                    {t.nombre}
                  </div>
                ))}
                <div className="hidden w-16 shrink-0 text-right sm:block">Var.</div>
              </div>
              <div className="divide-y divide-white/5">
                {meses.map((p) => (
                  <FilaMes key={p} f={f} p={p} trabajos={columnas} />
                ))}
              </div>
            </>
          ) : (
            <Empty>Primero agregá un trabajo arriba.</Empty>
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardTitle sub={ref ? `Suma de tus sueldos. Real = en pesos de ${labelPeriodo(ref)}` : undefined}>Sueldo nominal vs real</CardTitle>
            {datos.length > 1 ? (
              <Lines
                data={datos}
                series={[
                  { key: 'nominal', name: 'Nominal', color: '#3987e5' },
                  { key: 'real', name: 'Real (ajustado por IPC)', color: '#d95926' },
                ]}
                fmt={(n) => fmtMoney(n)}
                fmtAxis={(n) => fmtCompactMoney(n)}
              />
            ) : (
              <Empty>Cargá al menos 2 meses de sueldo</Empty>
            )}
          </Card>
          <Card>
            <CardTitle sub="Suma de tus sueldos al dólar elegido en Ajustes">Sueldo en dólares</CardTitle>
            {datosUsd.length > 1 ? (
              <Lines
                data={datosUsd}
                series={[{ key: 'usd', name: 'Sueldo US$', color: '#199e70' }]}
                fmt={(n) => fmtMoney(n, 'USD')}
                fmtAxis={(n) => fmtCompactMoney(n, 'USD')}
              />
            ) : (
              <Empty>Sin datos suficientes</Empty>
            )}
          </Card>
        </div>
      </div>

      <Card>
        <CardTitle sub="Cada cambio de sueldo, comparado con la inflación desde el aumento anterior de ese trabajo">Historial de aumentos</CardTitle>
        {aumentos.length ? (
          <div className="overflow-x-auto">
            <table className="tabular w-full min-w-[640px] text-sm">
              <thead className="text-xs text-white/50">
                <tr>
                  <th className="py-2 text-left font-medium">Mes</th>
                  <th className="py-2 text-left font-medium">Trabajo</th>
                  <th className="py-2 text-right font-medium">Antes</th>
                  <th className="py-2 text-right font-medium">Después</th>
                  <th className="py-2 text-right font-medium">Aumento</th>
                  <th className="py-2 text-right font-medium">Inflación</th>
                  <th className="py-2 text-right font-medium" title="Variación del sueldo medido en pesos, descontando la inflación">
                    Real
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {[...aumentos].reverse().map((a) => (
                  <tr key={a.trabajo.id + a.p}>
                    <td className="py-2">
                      {MESES_CORTOS[parsePeriodo(a.p).mes]} {parsePeriodo(a.p).anio}
                    </td>
                    <td className="py-2 text-white/80">{a.trabajo.nombre}</td>
                    <td className="py-2 text-right text-white/60">{fmtMoney(a.antes, a.trabajo.moneda)}</td>
                    <td className="py-2 text-right">{fmtMoney(a.despues, a.trabajo.moneda)}</td>
                    <td className="py-2 text-right">
                      <Delta value={a.pct} invertir />
                    </td>
                    <td className="py-2 text-right text-white/70">{fmtPct(a.infl, false)}</td>
                    <td className="py-2 text-right">
                      <Delta value={a.real} invertir />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-white/40">
              "Real": cuánto cambió el sueldo medido en pesos desde el aumento anterior, descontada la inflación. En un trabajo en dólares
              incluye la suba del dólar.
            </p>
          </div>
        ) : (
          <Empty>Todavía no hay cambios de sueldo registrados</Empty>
        )}
      </Card>

      <ExtraModal open={extraOpen} onClose={() => setExtraOpen(false)} anio={anio} />
      {trabajoModal && (
        <TrabajoModal open onClose={() => setTrabajoModal(null)} trabajo={trabajoModal.t} orden={f.trabajos.length} />
      )}
    </div>
  )
}
