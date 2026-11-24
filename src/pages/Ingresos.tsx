import { useEffect, useState, type FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useFinanzas, type Finanzas } from '@/lib/finanzas'
import { usePrefs } from '@/lib/prefs'
import { useInvalidate } from '@/lib/queries'
import { supabase } from '@/lib/supabaseClient'
import type { Moneda } from '@/lib/types'
import { MESES, MESES_CORTOS, addMeses, fmtCompactMoney, fmtMoney, fmtPct, labelPeriodo, mesesDelAnio, parseMonto, parsePeriodo, variacion } from '@/lib/utils'
import { PageHeader, YearPicker } from '@/components/Pickers'
import { Button, Card, CardTitle, Delta, Empty, Field, Modal, Segmented, Spinner, Stat } from '@/components/ui'
import { Lines } from '@/components/Charts'

const esSalario = (c: string) => c.toLowerCase() === 'salario'
const fmtInput = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 2 })

function FilaSalario({ f, p, moneda }: { f: Finanzas; p: string; moneda: Moneda }) {
  const invalidate = useInvalidate()
  const rows = f.ingresosDe(p).filter((i) => esSalario(i.concepto))
  const actual = rows.reduce((s, i) => s + i.monto, 0)
  const mon = rows[0]?.moneda ?? moneda
  const extras = f.ingresosDe(p).filter((i) => !esSalario(i.concepto))
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
      const { error } = await supabase.from('ingresos').insert({ periodo: p, concepto: 'Salario', monto: n, moneda: mon })
      if (error) return toast.error(error.message)
    }
    await invalidate('ingresos')
  }

  async function borrar(id: string) {
    const { error } = await supabase.from('ingresos').delete().eq('id', id)
    if (error) return toast.error(error.message)
    await invalidate('ingresos')
  }

  const prev = f.ingresosDe(addMeses(p, -1)).filter((i) => esSalario(i.concepto)).reduce((s, i) => s + i.monto, 0)
  const cambio = rows.length && prev ? variacion(actual, prev) : null

  return (
    <div className="py-2">
      <div className="flex items-center gap-3">
        <div className="w-24 text-sm font-medium">{MESES[parsePeriodo(p).mes]}</div>
        <div className="flex-1 text-xs">{cambio != null && Math.abs(cambio) > 0.05 && <Delta value={cambio} invertir />}</div>
        <div className="relative w-40 sm:w-48">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-white/40">{mon === 'USD' ? 'US$' : '$'}</span>
          <input
            className="input tabular py-2 pl-10 text-right"
            inputMode="decimal"
            placeholder="—"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </div>
      </div>
      {extras.map((x) => (
        <div key={x.id} className="mt-1 flex items-center gap-3 pl-24 text-xs text-white/60">
          <span className="flex-1">+ {x.concepto}{x.nota ? ` · ${x.nota}` : ''}</span>
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
    if (esSalario(concepto.trim())) return toast.error('El salario se carga en la lista de meses')
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
            {MESES.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
        </Field>
        <Field label="Concepto">
          <input className="input" list="conceptos" value={concepto} onChange={(e) => setConcepto(e.target.value)} />
          <datalist id="conceptos">
            <option value="Aguinaldo" />
            <option value="Bono" />
            <option value="Freelance" />
            <option value="Vacaciones" />
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
        <Button type="submit" className="w-full" loading={saving}>Guardar</Button>
      </form>
    </Modal>
  )
}

export default function Ingresos() {
  const f = useFinanzas()
  const { mes, vista } = usePrefs()
  const [anio, setAnio] = useState(parsePeriodo(mes).anio)
  const [extraOpen, setExtraOpen] = useState(false)
  const fmt = (n: number) => fmtMoney(n, vista)

  if (f.loading) return <Spinner />

  // Serie de salario en pesos (todos los meses con salario)
  const salarios = [...new Set(f.ingresos.filter((i) => esSalario(i.concepto)).map((i) => i.periodo))]
    .sort()
    .map((p) => ({
      p,
      ars: f.ingresosDe(p).filter((i) => esSalario(i.concepto)).reduce((s, i) => s + f.convertir(i.monto, i.moneda, p, 'ARS'), 0),
    }))
  const ultimo = salarios.at(-1)

  // Aumentos: meses en que el salario cambió
  const aumentos = salarios
    .map((s, i) => {
      const prev = salarios[i - 1]
      if (!prev || Math.abs(s.ars - prev.ars) < 1) return null
      // inflación desde el aumento anterior
      let j = i - 1
      while (j > 0 && Math.abs(salarios[j].ars - salarios[j - 1].ars) < 1) j--
      const desde = salarios[j]
      const pct = variacion(s.ars, prev.ars)!
      const infl = f.inflacionEntre(desde.p, s.p).valor
      return { ...s, prev: prev.ars, pct, desde: desde.p, infl }
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
  const ultimoAumento = aumentos.at(-1)

  // Año seleccionado
  const delAnio = salarios.filter((s) => s.p.startsWith(String(anio)))
  const base = salarios.filter((s) => s.p < `${anio}-01-01`).at(-1) ?? delAnio[0]
  const finAnio = delAnio.at(-1)
  const aumAnio = base && finAnio ? variacion(finAnio.ars, base.ars) : null
  const inflAnio = base && finAnio ? f.inflacionEntre(base.p, finAnio.p).valor : null
  const poder = aumAnio != null && inflAnio != null ? ((1 + aumAnio / 100) / (1 + inflAnio / 100) - 1) * 100 : null

  // Poder adquisitivo desde el último aumento
  const inflDesdeAumento = ultimoAumento && ultimo ? f.inflacionEntre(ultimoAumento.p, ultimo.p > ultimoAumento.p ? ultimo.p : ultimoAumento.p) : null
  const usdHoy = ultimo ? f.convertir(ultimo.ars, 'ARS', ultimo.p, 'USD') : null
  const hace12 = ultimo ? salarios.find((s) => s.p === addMeses(ultimo.p, -12)) : null
  const usd12 = hace12 ? f.convertir(hace12.ars, 'ARS', hace12.p, 'USD') : null

  // Gráfico: últimos 24 meses, nominal vs real (pesos de hoy) y en USD
  const ref = ultimo?.p
  const ventana = ref ? salarios.filter((s) => s.p > addMeses(ref, -24)) : []
  const datos = ventana.map((s) => ({
    label: labelPeriodo(s.p, true),
    nominal: s.ars,
    real: s.ars * (1 + (f.inflacionEntre(s.p, ref!).valor ?? 0) / 100),
  }))
  const datosUsd = ventana.map((s) => ({ label: labelPeriodo(s.p, true), usd: f.convertir(s.ars, 'ARS', s.p, 'USD') }))

  const totalIngresosAnio = mesesDelAnio(anio).reduce((s, p) => s + (f.ingresoMes(p) ?? 0), 0)

  return (
    <div className="space-y-5">
      <PageHeader title="Ingresos y salario">
        <YearPicker value={anio} onChange={setAnio} />
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Salario actual" value={ultimo ? fmtMoney(ultimo.ars) : '—'} hint={ultimo && labelPeriodo(ultimo.p)} />
        <Stat
          label="Último aumento"
          value={ultimoAumento ? <Delta value={ultimoAumento.pct} invertir className="text-xl sm:text-2xl" /> : '—'}
          hint={ultimoAumento ? `${labelPeriodo(ultimoAumento.p)} · inflación desde el anterior ${fmtPct(ultimoAumento.infl, false)}` : 'Cargá al menos 2 meses'}
        />
        <Stat
          label="Inflación desde el último aumento"
          value={fmtPct(inflDesdeAumento?.valor ?? null, false)}
          hint="Lo que perdió tu sueldo desde que te aumentaron"
        />
        <Stat
          label="Salario en dólares"
          value={fmtMoney(usdHoy, 'USD')}
          hint={usd12 ? <>vs hace 12 meses <Delta value={variacion(usdHoy, usd12)} invertir /></> : 'Al dólar del mes'}
        />
        <Stat label={`Aumento ${anio}`} value={<Delta value={aumAnio} invertir className="text-xl sm:text-2xl" />} hint={base && finAnio ? `${labelPeriodo(base.p, true)} → ${labelPeriodo(finAnio.p, true)}` : '—'} />
        <Stat label={`Inflación ${anio}`} value={fmtPct(inflAnio, false)} hint="Mismo período" />
        <Stat
          label="Poder adquisitivo"
          value={<Delta value={poder} invertir className="text-xl sm:text-2xl" />}
          hint={poder == null ? '—' : poder >= 0 ? 'Tu sueldo le ganó a la inflación' : 'La inflación le ganó a tu sueldo'}
        />
        <Stat label={`Ingresos totales ${anio}`} value={fmt(totalIngresosAnio)} hint="Salario + extras" />
      </div>

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
            Salario {anio}
          </CardTitle>
          <div className="divide-y divide-white/5">
            {mesesDelAnio(anio).map((p) => (
              <FilaSalario key={p} f={f} p={p} moneda="ARS" />
            ))}
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardTitle sub={ref ? `Real = expresado en pesos de ${labelPeriodo(ref)}` : undefined}>Salario nominal vs real</CardTitle>
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
              <Empty>Cargá al menos 2 meses de salario</Empty>
            )}
          </Card>
          <Card>
            <CardTitle sub="Al dólar elegido en Ajustes">Salario en dólares</CardTitle>
            {datosUsd.length > 1 ? (
              <Lines
                data={datosUsd}
                series={[{ key: 'usd', name: 'Salario US$', color: '#199e70' }]}
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
        <CardTitle sub="Cada cambio de salario comparado con la inflación acumulada desde el cambio anterior">Historial de aumentos</CardTitle>
        {aumentos.length ? (
          <div className="overflow-x-auto">
            <table className="tabular w-full min-w-[560px] text-sm">
              <thead className="text-xs text-white/50">
                <tr>
                  <th className="py-2 text-left font-medium">Mes</th>
                  <th className="py-2 text-right font-medium">Antes</th>
                  <th className="py-2 text-right font-medium">Después</th>
                  <th className="py-2 text-right font-medium">Aumento</th>
                  <th className="py-2 text-right font-medium">Inflación desde {''}el anterior</th>
                  <th className="py-2 text-right font-medium">Real</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {[...aumentos].reverse().map((a) => {
                  const real = a.infl != null ? ((1 + a.pct / 100) / (1 + a.infl / 100) - 1) * 100 : null
                  return (
                    <tr key={a.p}>
                      <td className="py-2">{MESES_CORTOS[parsePeriodo(a.p).mes]} {parsePeriodo(a.p).anio}</td>
                      <td className="py-2 text-right text-white/60">{fmtMoney(a.prev)}</td>
                      <td className="py-2 text-right">{fmtMoney(a.ars)}</td>
                      <td className="py-2 text-right"><Delta value={a.pct} invertir /></td>
                      <td className="py-2 text-right text-white/70">{fmtPct(a.infl, false)}</td>
                      <td className="py-2 text-right"><Delta value={real} invertir /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Todavía no hay cambios de salario registrados</Empty>
        )}
      </Card>

      <ExtraModal open={extraOpen} onClose={() => setExtraOpen(false)} anio={anio} />
    </div>
  )
}
