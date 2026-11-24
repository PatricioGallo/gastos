import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth'
import { useFinanzas } from '@/lib/finanzas'
import { sincronizarIndicadores } from '@/lib/indicadores'
import { usePrefs } from '@/lib/prefs'
import { useInvalidate } from '@/lib/queries'
import { supabase } from '@/lib/supabaseClient'
import { DOLARES, type TipoIndicador } from '@/lib/types'
import { MESES, MESES_CORTOS, fmtMoney, fmtPct, mesesDelAnio, parseMonto, parsePeriodo } from '@/lib/utils'
import { PageHeader, YearPicker } from '@/components/Pickers'
import { Button, Card, CardTitle, Delta, Spinner, Stat } from '@/components/ui'
import { GroupedBars, Lines } from '@/components/Charts'
import { AlquilerCard } from '@/components/AlquilerCard'

function CeldaIndicador({ periodo, tipo, valor, manual, pct }: { periodo: string; tipo: TipoIndicador; valor: number | null; manual: boolean; pct?: boolean }) {
  const invalidate = useInvalidate()
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState('')

  async function guardar() {
    setEditando(false)
    const n = texto.trim() ? parseMonto(texto) : null
    if (n === valor) return
    const { error } =
      n == null
        ? await supabase.from('indicadores').delete().match({ periodo, tipo })
        : await supabase.from('indicadores').upsert({ periodo, tipo, valor: n, manual: true }, { onConflict: 'user_id,periodo,tipo' })
    if (error) return toast.error(error.message)
    await invalidate('indicadores')
  }

  if (editando)
    return (
      <input
        autoFocus
        className="input tabular w-24 px-2 py-1 text-right text-sm"
        inputMode="decimal"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={guardar}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    )
  return (
    <button
      className="tabular rounded-lg px-2 py-1 text-right hover:bg-white/10"
      title={manual ? 'Cargado a mano · tocá para editar' : 'Tocá para editar'}
      onClick={() => {
        setTexto(valor != null ? String(valor).replace('.', ',') : '')
        setEditando(true)
      }}
    >
      {valor == null ? <span className="text-white/30">—</span> : pct ? fmtPct(valor, false) : fmtMoney(valor)}
      {manual && <span className="ml-0.5 text-brand-400">•</span>}
    </button>
  )
}

export default function Inflacion() {
  const f = useFinanzas()
  const { session } = useAuth()
  const { mes, dolar } = usePrefs()
  const invalidate = useInvalidate()
  const [anio, setAnio] = useState(parsePeriodo(mes).anio)
  const [syncing, setSyncing] = useState(false)

  if (f.loading) return <Spinner />

  async function sync() {
    setSyncing(true)
    try {
      const n = await sincronizarIndicadores(session!.user.id, f.indicadores)
      await invalidate('indicadores')
      toast.success(`Datos actualizados (${n} registros)`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSyncing(false)
    }
  }

  const meses = mesesDelAnio(anio)
  const ultimoIpc = [...f.indicadores].filter((i) => i.tipo === 'ipc').sort((a, b) => a.periodo.localeCompare(b.periodo)).at(-1)
  const acumAnio = f.inflacionAnual(anio)
  const interanual = ultimoIpc ? f.inflacionInteranual(ultimoIpc.periodo).valor : null

  // Inflación personal acumulada del año
  let fp = 1
  let nPers = 0
  const datos = meses.map((p, i) => {
    const pers = f.inflacionPersonal(p)
    if (pers != null) {
      fp *= 1 + pers / 100
      nPers++
    }
    return { label: MESES_CORTOS[i], ipc: f.ipc(p), personal: pers }
  })
  const persAnio = nPers ? (fp - 1) * 100 : null

  // Acumuladas mes a mes
  let a1 = 1
  let a2 = 1
  const acumuladas = meses.map((p, i) => {
    const ipc = f.ipc(p)
    const pers = f.inflacionPersonal(p)
    if (ipc != null) a1 *= 1 + ipc / 100
    if (pers != null) a2 *= 1 + pers / 100
    return { label: MESES_CORTOS[i], ipc: ipc != null ? (a1 - 1) * 100 : null, personal: pers != null ? (a2 - 1) * 100 : null }
  })

  const val = (p: string, t: TipoIndicador) => f.indicadores.find((i) => i.periodo === p && i.tipo === t)
  const dolarLabel = DOLARES.find((d) => d.value === dolar)?.label

  return (
    <div className="space-y-5">
      <PageHeader title="Inflación y dólar">
        <YearPicker value={anio} onChange={setAnio} />
        <Button variant="secondary" onClick={sync} loading={syncing}>
          {!syncing && <RefreshCw className="size-4" />} Actualizar
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Último IPC mensual"
          value={fmtPct(ultimoIpc?.valor ?? null, false)}
          hint={ultimoIpc ? `${MESES[parsePeriodo(ultimoIpc.periodo).mes]} ${parsePeriodo(ultimoIpc.periodo).anio}` : 'Sin datos'}
        />
        <Stat label="Interanual" value={fmtPct(interanual, false)} hint="Últimos 12 meses publicados" />
        <Stat label={`Acumulada ${anio}`} value={fmtPct(acumAnio.valor, false)} hint={acumAnio.faltan ? `${12 - acumAnio.faltan} meses publicados` : 'Año completo'} />
        <Stat
          label={`Tu inflación ${anio}`}
          value={<Delta value={persAnio} className="text-xl sm:text-2xl" />}
          hint="Suba de tus gastos fijos mensuales"
        />
      </div>

      <AlquilerCard f={f} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle sub="IPC INDEC vs la suba de tus gastos fijos">Inflación mensual</CardTitle>
          <GroupedBars
            data={datos}
            series={[
              { key: 'ipc', name: 'IPC', color: '#3987e5' },
              { key: 'personal', name: 'Tus fijos', color: '#d95926' },
            ]}
            fmt={(n) => fmtPct(n)}
            fmtAxis={(n) => `${n}%`}
          />
        </Card>
        <Card>
          <CardTitle sub="Acumulada en el año">Inflación acumulada</CardTitle>
          <Lines
            data={acumuladas}
            series={[
              { key: 'ipc', name: 'IPC', color: '#3987e5' },
              { key: 'personal', name: 'Tus fijos', color: '#d95926' },
            ]}
            fmt={(n) => fmtPct(n)}
            fmtAxis={(n) => `${Math.round(n)}%`}
          />
        </Card>
      </div>

      <Card>
        <CardTitle sub={`Promedio mensual de venta · se usa el dólar ${dolarLabel} para convertir (cambialo en Ajustes)`}>Dólar {anio}</CardTitle>
        <Lines
          data={meses.map((p, i) => ({
            label: MESES_CORTOS[i],
            dolar_blue: val(p, 'dolar_blue')?.valor ?? null,
            dolar_mep: val(p, 'dolar_mep')?.valor ?? null,
            dolar_oficial: val(p, 'dolar_oficial')?.valor ?? null,
          }))}
          series={[
            { key: 'dolar_blue', name: 'Blue', color: '#3987e5' },
            { key: 'dolar_mep', name: 'MEP', color: '#d95926' },
            { key: 'dolar_oficial', name: 'Oficial', color: '#199e70' },
          ]}
          fmt={(n) => fmtMoney(n)}
          fmtAxis={(n) => `$${Math.round(n)}`}
        />
      </Card>

      <Card>
        <CardTitle sub="Se actualiza solo desde argentinadatos.com. Tocá un valor para corregirlo a mano (queda marcado con •).">
          Datos {anio}
        </CardTitle>
        <div className="overflow-x-auto">
          <table className="tabular w-full min-w-[560px] text-sm">
            <thead className="text-xs text-white/50">
              <tr>
                <th className="py-2 text-left font-medium">Mes</th>
                <th className="py-2 text-right font-medium">IPC</th>
                <th className="py-2 text-right font-medium">Tus fijos</th>
                <th className="py-2 text-right font-medium">Blue</th>
                <th className="py-2 text-right font-medium">MEP</th>
                <th className="py-2 text-right font-medium">Oficial</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {meses.map((p, i) => (
                <tr key={p}>
                  <td className="py-1">{MESES[i]}</td>
                  {(['ipc'] as const).map((t) => (
                    <td key={t} className="py-1 text-right">
                      <CeldaIndicador periodo={p} tipo={t} valor={val(p, t)?.valor ?? null} manual={!!val(p, t)?.manual} pct />
                    </td>
                  ))}
                  <td className="py-1 pr-2 text-right"><Delta value={f.inflacionPersonal(p)} /></td>
                  {(['dolar_blue', 'dolar_mep', 'dolar_oficial'] as const).map((t) => (
                    <td key={t} className="py-1 text-right">
                      <CeldaIndicador periodo={p} tipo={t} valor={val(p, t)?.valor ?? null} manual={!!val(p, t)?.manual} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
