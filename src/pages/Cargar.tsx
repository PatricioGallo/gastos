import { useEffect, useState, type FormEvent } from 'react'
import { Copy, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useFinanzas, type Finanzas } from '@/lib/finanzas'
import { usePrefs } from '@/lib/prefs'
import { useInvalidate } from '@/lib/queries'
import { supabase } from '@/lib/supabaseClient'
import type { Categoria, Gasto, Moneda } from '@/lib/types'
import { addMeses, fmtMoney, labelPeriodo, parseMonto } from '@/lib/utils'
import { MonthPicker, PageHeader } from '@/components/Pickers'
import { CategoriaModal } from '@/components/CategoriaModal'
import { Button, Card, CardTitle, Dot, Empty, Field, Segmented, Spinner } from '@/components/ui'

const fmtInput = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 2 })

/** Reemplaza todos los gastos de una categoría fija en el mes por un único valor (o los borra). */
async function guardarFijo(cat: Categoria, periodo: string, existentes: Gasto[], monto: number | null) {
  if (existentes.length) {
    const { error } = await supabase.from('gastos').delete().in('id', existentes.map((g) => g.id))
    if (error) throw new Error(error.message)
  }
  if (monto != null && monto > 0) {
    const { error } = await supabase
      .from('gastos')
      .insert({ categoria_id: cat.id, periodo, monto, moneda: existentes[0]?.moneda ?? cat.moneda })
    if (error) throw new Error(error.message)
  }
}

function FilaFija({ f, cat, periodo }: { f: Finanzas; cat: Categoria; periodo: string }) {
  const invalidate = useInvalidate()
  const existentes = f.gastosDe(periodo).filter((g) => g.categoria_id === cat.id)
  const actual = existentes.reduce((s, g) => s + g.monto, 0)
  const moneda: Moneda = existentes[0]?.moneda ?? cat.moneda
  const anterior = f.gastosDe(addMeses(periodo, -1)).filter((g) => g.categoria_id === cat.id).reduce((s, g) => s + g.monto, 0)
  const [texto, setTexto] = useState(existentes.length ? fmtInput(actual) : '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setTexto(existentes.length ? fmtInput(actual) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actual, existentes.length, periodo])

  async function commit() {
    const monto = texto.trim() ? parseMonto(texto) : null
    if (texto.trim() && monto == null) {
      toast.error(`Monto inválido en ${cat.nombre}`)
      return
    }
    if (monto === (existentes.length ? actual : null)) return
    setSaving(true)
    try {
      await guardarFijo(cat, periodo, existentes, monto)
      await invalidate('gastos')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{cat.nombre}</div>
        <div className="text-xs text-white/40">
          {cat.frecuencia !== 'mensual' && <span className="mr-2 capitalize">{cat.frecuencia}</span>}
          {anterior > 0 && <>mes ant. {fmtMoney(anterior, moneda)}</>}
        </div>
      </div>
      {anterior > 0 && !existentes.length && (
        <button
          className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white"
          title="Usar valor del mes anterior"
          onClick={() => setTexto(fmtInput(anterior))}
        >
          <Copy className="size-4" />
        </button>
      )}
      <div className="relative w-36 sm:w-44">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-white/40">
          {moneda === 'USD' ? 'US$' : '$'}
        </span>
        <input
          className={`input tabular py-2 pl-10 text-right ${saving ? 'opacity-50' : ''}`}
          inputMode="decimal"
          value={texto}
          placeholder="—"
          onChange={(e) => setTexto(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </div>
    </div>
  )
}

function NuevoVariable({ f, periodo }: { f: Finanzas; periodo: string }) {
  const invalidate = useInvalidate()
  const cats = f.categorias.filter((c) => c.activa).sort((a, b) => (a.tipo === b.tipo ? a.nombre.localeCompare(b.nombre) : a.tipo === 'variable' ? -1 : 1))
  const [catId, setCatId] = useState('')
  const [monto, setMonto] = useState('')
  const [moneda, setMoneda] = useState<Moneda>('ARS')
  const [fecha, setFecha] = useState('')
  const [nota, setNota] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const hoy = new Date().toISOString().slice(0, 10)
    setFecha(hoy.startsWith(periodo.slice(0, 7)) ? hoy : periodo)
  }, [periodo])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const n = parseMonto(monto)
    if (!catId) return toast.error('Elegí una categoría')
    if (n == null || n <= 0) return toast.error('Monto inválido')
    setSaving(true)
    const { error } = await supabase
      .from('gastos')
      .insert({ categoria_id: catId, periodo, monto: n, moneda, fecha: fecha || null, nota: nota.trim() || null })
    setSaving(false)
    if (error) return toast.error(error.message)
    setMonto('')
    setNota('')
    await invalidate('gastos')
    toast.success('Gasto agregado')
  }

  if (!cats.length) return <Empty>Creá una categoría para empezar a cargar.</Empty>

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[1.4fr_1fr_auto_1fr]">
      <Field label="Categoría">
        <select
          className="input"
          value={catId}
          onChange={(e) => {
            setCatId(e.target.value)
            const c = f.catById.get(e.target.value)
            if (c) setMoneda(c.moneda)
          }}
        >
          <option value="">Elegir…</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre} {c.tipo === 'fijo' ? '(fijo)' : ''} · {f.grupoDe(c).nombre}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Monto">
        <input className="input tabular" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0" />
      </Field>
      <Field label="Moneda">
        <Segmented value={moneda} onChange={setMoneda} options={[{ value: 'ARS', label: 'ARS' }, { value: 'USD', label: 'USD' }]} />
      </Field>
      <Field label="Fecha">
        <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </Field>
      <Field label="Nota (opcional)" className="sm:col-span-3">
        <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: súper Carrefour" />
      </Field>
      <div className="flex items-end">
        <Button type="submit" className="w-full" loading={saving}>
          <Plus className="size-4" /> Agregar
        </Button>
      </div>
    </form>
  )
}

export default function Cargar() {
  const f = useFinanzas()
  const { mes, setMes, vista } = usePrefs()
  const invalidate = useInvalidate()
  const [modal, setModal] = useState<'fijo' | 'variable' | null>(null)
  const [copiando, setCopiando] = useState(false)

  if (f.loading) return <Spinner />

  const fijas = f.categorias.filter((c) => c.tipo === 'fijo' && c.activa)
  const gruposFijas = [...new Set(fijas.map((c) => f.grupoDe(c)))].sort((a, b) => a.orden - b.orden)
  const delMes = f.gastosDe(mes)
  const variablesMes = delMes
    .filter((g) => f.catById.get(g.categoria_id)?.tipo !== 'fijo')
    .sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''))
  const prev = addMeses(mes, -1)

  async function copiarMesAnterior() {
    const conDato = new Set(delMes.map((g) => g.categoria_id))
    const filas = f
      .gastosDe(prev)
      .filter((g) => {
        const c = f.catById.get(g.categoria_id)
        return c?.tipo === 'fijo' && c.activa && c.frecuencia === 'mensual' && !conDato.has(g.categoria_id)
      })
      .map((g) => ({ categoria_id: g.categoria_id, periodo: mes, monto: g.monto, moneda: g.moneda }))
    if (!filas.length) return toast.info('No hay fijos mensuales para copiar (o ya están cargados)')
    setCopiando(true)
    const { error } = await supabase.from('gastos').insert(filas)
    setCopiando(false)
    if (error) return toast.error(error.message)
    await invalidate('gastos')
    toast.success(`Se copiaron ${filas.length} gastos de ${labelPeriodo(prev)}. Corregí los que cambiaron.`)
  }

  async function borrar(g: Gasto) {
    const { error } = await supabase.from('gastos').delete().eq('id', g.id)
    if (error) return toast.error(error.message)
    await invalidate('gastos')
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Cargar gastos">
        <MonthPicker value={mes} onChange={setMes} />
      </PageHeader>

      <div className="glass-panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-white/50">Total {labelPeriodo(mes)}</div>
          <div className="tabular font-display text-2xl font-semibold">{fmtMoney(f.totalMes(mes), vista)}</div>
        </div>
        <div className="text-right text-sm text-white/60">
          Fijos {fmtMoney(f.totalMes(mes, f.esFijo), vista)}
          <br />
          Variables {fmtMoney(f.totalMes(mes, (g) => !f.esFijo(g)), vista)}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle
            sub="Se guarda solo al salir de cada casillero"
            right={
              <div className="flex gap-1">
                <Button variant="ghost" onClick={copiarMesAnterior} loading={copiando} title="Copiar fijos del mes anterior">
                  <Copy className="size-4" /> <span className="hidden sm:inline">Copiar mes ant.</span>
                </Button>
                <Button variant="ghost" onClick={() => setModal('fijo')} title="Nueva categoría fija">
                  <Plus className="size-4" />
                </Button>
              </div>
            }
          >
            Gastos fijos
          </CardTitle>
          {fijas.length ? (
            <div className="space-y-4">
              {gruposFijas.map((g) => (
                <div key={g.id}>
                  <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/50">
                    <Dot color={g.color} /> {g.nombre}
                  </div>
                  <div className="divide-y divide-white/5">
                    {fijas
                      .filter((c) => f.grupoDe(c).id === g.id)
                      .map((c) => (
                        <FilaFija key={c.id} f={f} cat={c} periodo={mes} />
                      ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty>
              No tenés gastos fijos.{' '}
              <button className="font-semibold text-brand-400 underline" onClick={() => setModal('fijo')}>
                Crear uno
              </button>
            </Empty>
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardTitle
              sub="Súper, salidas, nafta, compras…"
              right={
                <Button variant="ghost" onClick={() => setModal('variable')} title="Nueva categoría variable">
                  <Plus className="size-4" /> <span className="hidden sm:inline">Categoría</span>
                </Button>
              }
            >
              Agregar gasto variable
            </CardTitle>
            <NuevoVariable f={f} periodo={mes} />
          </Card>

          <Card>
            <CardTitle sub={`${variablesMes.length} movimientos`}>Variables de {labelPeriodo(mes)}</CardTitle>
            {variablesMes.length ? (
              <ul className="divide-y divide-white/5">
                {variablesMes.map((g) => {
                  const c = f.catById.get(g.categoria_id)
                  return (
                    <li key={g.id} className="flex items-center gap-3 py-2.5">
                      <Dot color={f.grupoDe(c).color} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{c?.nombre}</div>
                        <div className="truncate text-xs text-white/40">
                          {g.fecha ? new Date(g.fecha + 'T12:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : ''}
                          {g.nota ? ` · ${g.nota}` : ''}
                        </div>
                      </div>
                      <span className="tabular text-sm">{fmtMoney(g.monto, g.moneda)}</span>
                      <button className="rounded-lg p-1.5 text-white/30 hover:bg-red-500/10 hover:text-red-300" onClick={() => borrar(g)} title="Borrar">
                        <Trash2 className="size-4" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <Empty>Sin gastos variables este mes</Empty>
            )}
          </Card>
        </div>
      </div>

      <CategoriaModal open={modal != null} onClose={() => setModal(null)} tipoInicial={modal ?? 'fijo'} />
    </div>
  )
}
