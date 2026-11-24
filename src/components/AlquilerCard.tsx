import { useEffect, useState } from 'react'
import { Home, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Finanzas } from '@/lib/finanzas'
import { CONTRATO_DEFAULT, calcularCronograma, useContrato, useICL, type ContratoAlquiler } from '@/lib/alquiler'
import { useInvalidate } from '@/lib/queries'
import { supabase } from '@/lib/supabaseClient'
import { MESES_CORTOS, cn, fmtCompactMoney, fmtMoney, fmtPct, labelPeriodo, parseMonto, parsePeriodo } from '@/lib/utils'
import { Button, Card, CardTitle, Delta, Empty, Field, Modal, Segmented, Spinner } from './ui'
import { Lines } from './Charts'

const FRECUENCIAS = [1, 2, 3, 4, 6, 12]
const corto = (p: string) => `${MESES_CORTOS[parsePeriodo(p).mes]} ${String(parsePeriodo(p).anio).slice(2)}`

function ConfigModal({
  open,
  onClose,
  f,
  actual,
}: {
  open: boolean
  onClose: () => void
  f: Finanzas
  actual: Omit<ContratoAlquiler, 'user_id'>
}) {
  const invalidate = useInvalidate()
  const [inicio, setInicio] = useState(actual.inicio.slice(0, 7))
  const [monto, setMonto] = useState('')
  const [indice, setIndice] = useState(actual.indice)
  const [freq, setFreq] = useState(actual.frecuencia_meses)
  const [cat, setCat] = useState(actual.categoria_id ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setInicio(actual.inicio.slice(0, 7))
    setMonto(actual.monto.toLocaleString('es-AR'))
    setIndice(actual.indice)
    setFreq(actual.frecuencia_meses)
    setCat(actual.categoria_id ?? '')
    // solo al abrir: `actual` puede ser un objeto nuevo en cada render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function guardar() {
    const n = parseMonto(monto)
    if (!n || n <= 0) return toast.error('Monto inválido')
    if (!/^\d{4}-\d{2}$/.test(inicio)) return toast.error('Elegí el mes de inicio')
    setSaving(true)
    const { error } = await supabase.from('contrato_alquiler').upsert(
      { inicio: `${inicio}-01`, monto: n, indice, frecuencia_meses: freq, categoria_id: cat || null, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
    setSaving(false)
    if (error) return toast.error(error.message)
    await invalidate('contrato_alquiler')
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Contrato de alquiler">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Primer mes">
            <input className="input" type="month" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </Field>
          <Field label="Monto inicial">
            <input className="input tabular" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} />
          </Field>
        </div>
        <Field label="Índice del contrato">
          <Segmented
            value={indice}
            onChange={setIndice}
            options={[
              { value: 'ipc', label: 'IPC (INDEC)' },
              { value: 'icl', label: 'ICL (BCRA)' },
            ]}
          />
        </Field>
        <Field label="Ajuste cada">
          <select className="input" value={freq} onChange={(e) => setFreq(Number(e.target.value))}>
            {FRECUENCIAS.map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? 'mes' : 'meses'}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Comparar con lo que pagás en">
          <select className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">— No comparar —</option>
            {f.categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </Field>
        <p className="text-xs text-white/45">
          IPC: cada ajuste aplica la inflación de los meses del período anterior (ej. ajuste de julio = IPC abr × may × jun). ICL: cociente
          del índice entre las fechas de ajuste. Lo que todavía no se publicó se estima con la tendencia reciente.
        </p>
        <Button className="w-full" onClick={guardar} loading={saving}>
          Guardar
        </Button>
      </div>
    </Modal>
  )
}

export function AlquilerCard({ f }: { f: Finanzas }) {
  const q = useContrato()
  const [config, setConfig] = useState(false)

  const alquilerCat = f.categorias.find((c) => c.nombre.toLowerCase() === 'alquiler')
  const contrato = q.data ?? { ...CONTRATO_DEFAULT, categoria_id: alquilerCat?.id ?? null }
  const icl = useICL(contrato.inicio)

  if (q.isLoading) return <Spinner />

  const tramos = calcularCronograma(f, contrato, icl.data)
  const actual = tramos.find((t) => t.actual) ?? tramos.filter((t) => !t.futuro).at(-1)
  const proximo = tramos.find((t) => t.futuro)
  const usaIcl = contrato.indice === 'icl'
  const principal = (t: (typeof tramos)[number]) => (usaIcl ? t.icl : t.ipc)
  const montoContrato = actual ? principal(actual)?.monto ?? null : null
  const pagadoActual = actual?.pagado ?? null

  // Serie mensual para el gráfico
  const datos = tramos.flatMap((t) =>
    Array.from({ length: contrato.frecuencia_meses }, (_, i) => {
      const p = new Date(Date.UTC(parsePeriodo(t.desde).anio, parsePeriodo(t.desde).mes + i, 1)).toISOString().slice(0, 10)
      const gs = contrato.categoria_id ? f.gastosDe(p).filter((g) => g.categoria_id === contrato.categoria_id) : []
      return {
        label: corto(p),
        ipc: t.ipc.monto,
        icl: t.icl?.monto ?? null,
        pagado: gs.length ? gs.reduce((s, g) => s + f.convertir(g.monto, g.moneda, p, 'ARS'), 0) : null,
      }
    }),
  )

  const badge = (estimado: boolean) =>
    estimado ? <span className="ml-1 rounded bg-amber-500/15 px-1 text-[10px] font-semibold text-amber-300">estimado</span> : null

  return (
    <Card>
      <CardTitle
        sub={`Desde ${labelPeriodo(contrato.inicio)} con ${fmtMoney(contrato.monto)} · ajuste cada ${contrato.frecuencia_meses} meses por ${usaIcl ? 'ICL' : 'IPC'}${q.data ? '' : ' (valores por defecto)'}`}
        right={
          <Button variant="ghost" onClick={() => setConfig(true)} title="Configurar contrato">
            <Settings2 className="size-4" /> <span className="hidden sm:inline">Configurar</span>
          </Button>
        }
      >
        <span className="flex items-center gap-2">
          <Home className="size-4 text-white/50" /> Alquiler
        </span>
      </CardTitle>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl bg-white/[0.04] p-3">
          <div className="text-xs uppercase tracking-wide text-white/50">Según contrato hoy</div>
          <div className="tabular font-display text-xl font-semibold">{fmtMoney(montoContrato)}</div>
          <div className="text-xs text-white/50">{actual && `${corto(actual.desde)} – ${corto(actual.hasta)}`}</div>
        </div>
        <div className="rounded-2xl bg-white/[0.04] p-3">
          <div className="text-xs uppercase tracking-wide text-white/50">Con el otro índice</div>
          <div className="tabular font-display text-xl font-semibold">
            {fmtMoney(actual ? (usaIcl ? actual.ipc.monto : actual.icl?.monto) : null)}
          </div>
          <div className="text-xs text-white/50">{usaIcl ? 'IPC' : 'ICL'}</div>
        </div>
        <div className="rounded-2xl bg-white/[0.04] p-3">
          <div className="text-xs uppercase tracking-wide text-white/50">Próximo aumento</div>
          {proximo ? (
            <>
              <div className="tabular font-display text-xl font-semibold">{fmtMoney(principal(proximo)?.monto)}</div>
              <div className="text-xs text-white/50">
                {labelPeriodo(proximo.desde)} · <Delta value={principal(proximo)?.pct ?? null} />
                {badge(!!principal(proximo)?.estimado)}
              </div>
            </>
          ) : (
            <div className="text-white/40">—</div>
          )}
        </div>
        <div className="rounded-2xl bg-white/[0.04] p-3">
          <div className="text-xs uppercase tracking-wide text-white/50">Pagás (prom. del período)</div>
          <div className="tabular font-display text-xl font-semibold">{fmtMoney(pagadoActual)}</div>
          <div className="text-xs text-white/50">
            {pagadoActual != null && montoContrato ? (
              <>vs contrato <Delta value={(pagadoActual / montoContrato - 1) * 100} /></>
            ) : (
              'Sin pagos vinculados'
            )}
          </div>
        </div>
      </div>

      {icl.isError && (
        <p className="mb-3 text-xs text-amber-300">No se pudo bajar el ICL del BCRA ahora; se muestra solo el cálculo por IPC.</p>
      )}

      {tramos.length ? (
        <>
          <div className="overflow-x-auto">
            <table className="tabular w-full min-w-[620px] text-sm">
              <thead className="text-xs text-white/50">
                <tr>
                  <th className="py-2 text-left font-medium">Período</th>
                  <th className={cn('py-2 text-right font-medium', !usaIcl && 'text-brand-300')}>Por IPC{!usaIcl && ' ★'}</th>
                  <th className="py-2 text-right font-medium">Ajuste IPC</th>
                  <th className={cn('py-2 text-right font-medium', usaIcl && 'text-brand-300')}>Por ICL{usaIcl && ' ★'}</th>
                  <th className="py-2 text-right font-medium">Ajuste ICL</th>
                  <th className="py-2 text-right font-medium">Pagado (prom.)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {tramos.map((t) => (
                  <tr key={t.desde} className={cn(t.actual && 'bg-brand-500/[0.07]', t.futuro && 'text-white/60')}>
                    <td className="py-2">
                      {corto(t.desde)} – {corto(t.hasta)}
                      {t.actual && <span className="ml-1.5 text-xs text-brand-400">actual</span>}
                      {t.futuro && <span className="ml-1.5 text-xs text-white/40">próximo</span>}
                    </td>
                    <td className="py-2 text-right">
                      {fmtMoney(t.ipc.monto)}
                      {badge(t.ipc.estimado)}
                    </td>
                    <td className="py-2 text-right">{t.ipc.pct == null ? <span className="text-white/40">inicial</span> : fmtPct(t.ipc.pct)}</td>
                    <td className="py-2 text-right">
                      {t.icl ? fmtMoney(t.icl.monto) : '—'}
                      {t.icl && badge(t.icl.estimado)}
                    </td>
                    <td className="py-2 text-right">{t.icl?.pct == null ? <span className="text-white/40">{t.icl ? 'inicial' : '—'}</span> : fmtPct(t.icl.pct)}</td>
                    <td className="py-2 text-right text-white/80">{fmtMoney(t.pagado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-white/40">★ índice de tu contrato. "Estimado": usa meses de IPC sin publicar o ICL futuro, proyectados con la tendencia reciente.</p>
          </div>
          <div className="mt-5">
            <Lines
              data={datos}
              series={[
                { key: 'ipc', name: 'Contrato por IPC', color: '#3987e5' },
                { key: 'icl', name: 'Contrato por ICL', color: '#d95926' },
                ...(contrato.categoria_id ? [{ key: 'pagado', name: 'Lo que pagaste', color: '#199e70' }] : []),
              ]}
              fmt={(n) => fmtMoney(n)}
              fmtAxis={(n) => fmtCompactMoney(n)}
            />
          </div>
        </>
      ) : (
        <Empty>Configurá el contrato</Empty>
      )}

      <ConfigModal open={config} onClose={() => setConfig(false)} f={f} actual={contrato} />
    </Card>
  )
}
