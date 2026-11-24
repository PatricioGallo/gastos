import { useMemo, useState } from 'react'
import { Download, LogOut, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth'
import { useFinanzas, type Finanzas } from '@/lib/finanzas'
import { usePrefs } from '@/lib/prefs'
import { PALETA, useInvalidate } from '@/lib/queries'
import { supabase } from '@/lib/supabaseClient'
import { DOLARES, type Categoria, type Grupo, type TipoCategoria } from '@/lib/types'
import { MESES_CORTOS, fmtMoney, parseMonto, periodo } from '@/lib/utils'
import { PageHeader } from '@/components/Pickers'
import { CategoriaModal } from '@/components/CategoriaModal'
import { Button, Card, CardTitle, Dot, Empty, Field, Modal, Segmented, Spinner } from '@/components/ui'

function GrupoModal({ open, onClose, grupo, cantidad }: { open: boolean; onClose: () => void; grupo: Grupo | null; cantidad: number }) {
  const invalidate = useInvalidate()
  const [nombre, setNombre] = useState(grupo?.nombre ?? '')
  const [color, setColor] = useState(grupo?.color ?? PALETA[cantidad % PALETA.length])
  const [saving, setSaving] = useState(false)

  async function guardar() {
    if (!nombre.trim()) return toast.error('Poné un nombre')
    setSaving(true)
    const { error } = grupo
      ? await supabase.from('grupos').update({ nombre: nombre.trim(), color }).eq('id', grupo.id)
      : await supabase.from('grupos').insert({ nombre: nombre.trim(), color, orden: cantidad })
    setSaving(false)
    if (error) return toast.error(error.code === '23505' ? 'Ya existe un grupo con ese nombre' : error.message)
    await invalidate('grupos')
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={grupo ? 'Editar grupo' : 'Nuevo grupo'}>
      <div className="space-y-4">
        <Field label="Nombre">
          <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
        </Field>
        <Field label="Color">
          <div className="flex flex-wrap items-center gap-2">
            {PALETA.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`size-8 rounded-full ring-offset-2 ring-offset-surface-800 ${color === c ? 'ring-2 ring-white' : ''}`}
                style={{ background: c }}
                aria-label={c}
              />
            ))}
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-10 cursor-pointer rounded bg-transparent" />
          </div>
        </Field>
        <Button className="w-full" onClick={guardar} loading={saving}>Guardar</Button>
      </div>
    </Modal>
  )
}

/** Pegar filas copiadas del Excel: "Categoría <tab> Ene <tab> Feb ..." */
function ImportarExcel({ f }: { f: Finanzas }) {
  const invalidate = useInvalidate()
  const [texto, setTexto] = useState('')
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [mesInicio, setMesInicio] = useState(0)
  const [tipo, setTipo] = useState<TipoCategoria>('fijo')
  const [grupoNuevas, setGrupoNuevas] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const filas = useMemo(() => {
    const out: { nombre: string; valores: (number | null)[] }[] = []
    for (const linea of texto.split(/\r?\n/)) {
      const celdas = linea.split('\t')
      let idx = -1
      for (let i = 0; i < celdas.length; i++) {
        const c = celdas[i].trim()
        if (!c) continue
        if (parseMonto(c) == null) idx = i
        else break
      }
      if (idx < 0) continue
      const nombre = celdas[idx].trim()
      if (/^(enero|meses|gastos|total)$/i.test(nombre)) continue
      const valores = celdas
        .slice(idx + 1, idx + 1 + 12 - mesInicio)
        .map((c) => (c.trim() ? parseMonto(c) : null))
      if (valores.some((v) => v != null)) out.push({ nombre, valores })
    }
    return out
  }, [texto, mesInicio])

  const porNombre = new Map(f.categorias.map((c) => [c.nombre.toLowerCase(), c]))
  const nuevas = filas.filter((r) => !porNombre.has(r.nombre.toLowerCase()))

  async function importar() {
    setSaving(true)
    try {
      // 1) crear categorías que no existen
      if (nuevas.length) {
        const { error } = await supabase.from('categorias').insert(
          nuevas.map((r) => ({
            nombre: r.nombre,
            tipo,
            frecuencia: tipo === 'fijo' ? 'mensual' : 'eventual',
            grupo_id: grupoNuevas[r.nombre] || f.grupos.find((g) => g.nombre === 'Otros')?.id || null,
          })),
        )
        if (error) throw new Error(error.message)
      }
      const { data: cats, error: e2 } = await supabase.from('categorias').select('id,nombre')
      if (e2) throw new Error(e2.message)
      const ids = new Map((cats as { id: string; nombre: string }[]).map((c) => [c.nombre.toLowerCase(), c.id]))

      // 2) reemplazar los valores de esas categorías en los meses pegados
      const periodos = Array.from({ length: 12 - mesInicio }, (_, i) => periodo(anio, mesInicio + i))
      const catIds = filas.map((r) => ids.get(r.nombre.toLowerCase())!).filter(Boolean)
      const { error: e3 } = await supabase.from('gastos').delete().in('categoria_id', catIds).in('periodo', periodos)
      if (e3) throw new Error(e3.message)
      const inserts = filas.flatMap((r) =>
        r.valores
          .map((v, i) => ({ v, p: periodos[i] }))
          .filter((x) => x.v != null && x.v > 0)
          .map((x) => ({ categoria_id: ids.get(r.nombre.toLowerCase())!, periodo: x.p, monto: x.v!, moneda: 'ARS' as const })),
      )
      if (inserts.length) {
        const { error } = await supabase.from('gastos').insert(inserts)
        if (error) throw new Error(error.message)
      }
      await invalidate('categorias', 'gastos')
      toast.success(`Importados ${inserts.length} valores de ${filas.length} categorías`)
      setTexto('')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-white/60">
        En tu Excel seleccioná las filas (desde el nombre de la categoría hasta Diciembre), copiá con Ctrl+C y pegalas acá.
        Si ya había valores para esa categoría y mes, se reemplazan.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Año">
          <input className="input" type="number" value={anio} onChange={(e) => setAnio(Number(e.target.value))} />
        </Field>
        <Field label="Primera columna es">
          <select className="input" value={mesInicio} onChange={(e) => setMesInicio(Number(e.target.value))}>
            {MESES_CORTOS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
        </Field>
        <Field label="Categorías nuevas como">
          <Segmented value={tipo} onChange={setTipo} options={[{ value: 'fijo', label: 'Fijas' }, { value: 'variable', label: 'Variables' }]} />
        </Field>
      </div>
      <textarea
        className="input min-h-36 font-mono text-xs"
        placeholder={'Alquiler\t591000\t591000\t591000 ...\nExpensas\t67990\t75930 ...'}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
      />
      {filas.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="tabular w-full min-w-[900px] text-xs">
              <thead className="text-white/50">
                <tr>
                  <th className="px-3 py-2 text-left">Categoría</th>
                  {Array.from({ length: 12 - mesInicio }, (_, i) => (
                    <th key={i} className="px-2 py-2 text-right">{MESES_CORTOS[mesInicio + i]}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filas.map((r) => (
                  <tr key={r.nombre}>
                    <td className="px-3 py-1.5">
                      {r.nombre}
                      {!porNombre.has(r.nombre.toLowerCase()) && <span className="ml-1 text-brand-400">(nueva)</span>}
                    </td>
                    {r.valores.map((v, i) => (
                      <td key={i} className="px-2 py-1.5 text-right text-white/70">{v != null ? Math.round(v).toLocaleString('es-AR') : ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {nuevas.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-white/50">Grupo de las categorías nuevas</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {nuevas.map((r) => (
                  <label key={r.nombre} className="flex items-center gap-3 text-sm">
                    <span className="w-32 truncate">{r.nombre}</span>
                    <select
                      className="input py-1.5"
                      value={grupoNuevas[r.nombre] ?? ''}
                      onChange={(e) => setGrupoNuevas({ ...grupoNuevas, [r.nombre]: e.target.value })}
                    >
                      <option value="">Otros</option>
                      {f.grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          )}
          <Button onClick={importar} loading={saving}>
            <Upload className="size-4" /> Importar {filas.length} categorías
          </Button>
        </>
      )}
    </div>
  )
}

function exportarCSV(f: Finanzas) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
  const lineas = ['periodo;fecha;grupo;categoria;tipo;monto;moneda;nota']
  for (const g of f.gastos) {
    const c = f.catById.get(g.categoria_id)
    lineas.push(
      [g.periodo, g.fecha ?? '', esc(f.grupoDe(c).nombre), esc(c?.nombre ?? ''), c?.tipo ?? '', String(g.monto).replace('.', ','), g.moneda, esc(g.nota ?? '')].join(';'),
    )
  }
  lineas.push('', 'periodo;concepto;monto;moneda')
  for (const i of f.ingresos) lineas.push([i.periodo, esc(i.concepto), String(i.monto).replace('.', ','), i.moneda].join(';'))
  const blob = new Blob(['﻿' + lineas.join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `gastos-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

export default function Configuracion() {
  const f = useFinanzas()
  const { session, signOut } = useAuth()
  const { dolar, setDolar } = usePrefs()
  const invalidate = useInvalidate()
  const [grupoModal, setGrupoModal] = useState<{ grupo: Grupo | null } | null>(null)
  const [catModal, setCatModal] = useState<{ cat: Categoria | null } | null>(null)

  if (f.loading) return <Spinner />

  async function borrarGrupo(g: Grupo) {
    const n = f.categorias.filter((c) => c.grupo_id === g.id).length
    if (!confirm(`¿Borrar el grupo "${g.nombre}"?${n ? ` Sus ${n} categorías quedan "Sin grupo".` : ''}`)) return
    const { error } = await supabase.from('grupos').delete().eq('id', g.id)
    if (error) return toast.error(error.message)
    await invalidate('grupos', 'categorias')
  }

  async function borrarCategoria(c: Categoria) {
    const n = f.gastos.filter((g) => g.categoria_id === c.id).length
    if (!confirm(`¿Borrar "${c.nombre}"?${n ? ` Se borran también sus ${n} gastos cargados. Si solo querés dejar de usarla, desactivala.` : ''}`)) return
    const { error } = await supabase.from('categorias').delete().eq('id', c.id)
    if (error) return toast.error(error.message)
    await invalidate('categorias', 'gastos')
  }

  const gruposConSin = [...f.grupos, ...(f.categorias.some((c) => !c.grupo_id || !f.grupoById.has(c.grupo_id)) ? [f.grupoDe(undefined)] : [])]

  return (
    <div className="space-y-5">
      <PageHeader title="Ajustes" />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle sub="Cotización para pasar de pesos a dólares y viceversa">Dólar de referencia</CardTitle>
          <Segmented value={dolar} onChange={setDolar} options={DOLARES} />
        </Card>
        <Card>
          <CardTitle sub={session?.user.email}>Cuenta y datos</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => exportarCSV(f)}>
              <Download className="size-4" /> Exportar CSV
            </Button>
            <Button variant="secondary" onClick={signOut}>
              <LogOut className="size-4" /> Cerrar sesión
            </Button>
          </div>
        </Card>
      </div>

      <Card>
        <CardTitle
          sub="Agrupá tus categorías (Vivienda, Tarjetas, Servicios…)"
          right={
            <div className="flex gap-1">
              <Button variant="ghost" onClick={() => setGrupoModal({ grupo: null })}>
                <Plus className="size-4" /> Grupo
              </Button>
              <Button variant="ghost" onClick={() => setCatModal({ cat: null })}>
                <Plus className="size-4" /> Categoría
              </Button>
            </div>
          }
        >
          Grupos y categorías
        </CardTitle>
        <div className="grid gap-4 md:grid-cols-2">
          {gruposConSin.map((g) => {
            const cats = f.categorias.filter((c) => f.grupoDe(c).id === g.id)
            const real = f.grupoById.has(g.id)
            return (
              <div key={g.id} className="rounded-2xl border border-white/8 bg-white/[0.02] p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Dot color={g.color} className="size-3" />
                  <span className="flex-1 font-semibold">{g.nombre}</span>
                  {real && (
                    <>
                      <button className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white" onClick={() => setGrupoModal({ grupo: g })} title="Editar grupo">
                        <Pencil className="size-3.5" />
                      </button>
                      <button className="rounded-lg p-1.5 text-white/40 hover:bg-red-500/10 hover:text-red-300" onClick={() => borrarGrupo(g)} title="Borrar grupo">
                        <Trash2 className="size-3.5" />
                      </button>
                    </>
                  )}
                </div>
                {cats.length ? (
                  <ul className="space-y-0.5">
                    {cats.map((c) => (
                      <li key={c.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-white/5">
                        <span className={`flex-1 ${c.activa ? '' : 'text-white/35 line-through'}`}>{c.nombre}</span>
                        <span className="text-xs text-white/40">
                          {c.tipo === 'fijo' ? 'Fijo' : 'Variable'} · {c.frecuencia}
                          {c.moneda === 'USD' && ' · USD'}
                          {c.porcentaje < 100 && ` · pagás ${c.porcentaje.toLocaleString('es-AR')}%`}
                        </span>
                        <button className="rounded p-1 text-white/40 hover:text-white" onClick={() => setCatModal({ cat: c })} title="Editar">
                          <Pencil className="size-3.5" />
                        </button>
                        <button className="rounded p-1 text-white/40 hover:text-red-300" onClick={() => borrarCategoria(c)} title="Borrar">
                          <Trash2 className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-2 text-xs text-white/35">Sin categorías</p>
                )}
              </div>
            )
          })}
        </div>
        {!f.grupos.length && <Empty>Creando grupos por defecto…</Empty>}
      </Card>

      <Card>
        <CardTitle sub="Copiá y pegá filas de tu planilla">Importar desde Excel</CardTitle>
        <ImportarExcel f={f} />
      </Card>

      <p className="text-center text-xs text-white/30">
        {f.gastos.length} gastos · {f.ingresos.length} ingresos · total histórico {fmtMoney(f.gastos.reduce((s, g) => s + f.convertir(f.miParte(g), g.moneda, g.periodo, 'ARS'), 0))}
      </p>

      {grupoModal && (
        <GrupoModal open onClose={() => setGrupoModal(null)} grupo={grupoModal.grupo} cantidad={f.grupos.length} />
      )}
      <CategoriaModal open={catModal != null} onClose={() => setCatModal(null)} categoria={catModal?.cat} />
    </div>
  )
}
