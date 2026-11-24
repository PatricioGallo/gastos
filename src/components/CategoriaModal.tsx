import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { useGrupos, useInvalidate } from '@/lib/queries'
import { FRECUENCIAS, type Categoria, type Frecuencia, type Moneda, type TipoCategoria } from '@/lib/types'
import { Button, Field, Modal, Segmented } from './ui'

export function CategoriaModal({
  open,
  onClose,
  categoria,
  tipoInicial = 'fijo',
}: {
  open: boolean
  onClose: () => void
  categoria?: Categoria | null
  tipoInicial?: TipoCategoria
}) {
  const grupos = useGrupos().data ?? []
  const invalidate = useInvalidate()
  const [nombre, setNombre] = useState('')
  const [grupoId, setGrupoId] = useState('')
  const [tipo, setTipo] = useState<TipoCategoria>(tipoInicial)
  const [frecuencia, setFrecuencia] = useState<Frecuencia>('mensual')
  const [moneda, setMoneda] = useState<Moneda>('ARS')
  const [activa, setActiva] = useState(true)
  const [compartido, setCompartido] = useState(false)
  const [pct, setPct] = useState('70')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setNombre(categoria?.nombre ?? '')
    setGrupoId(categoria?.grupo_id ?? grupos[0]?.id ?? '')
    setTipo(categoria?.tipo ?? tipoInicial)
    setFrecuencia(categoria?.frecuencia ?? (tipoInicial === 'variable' ? 'eventual' : 'mensual'))
    setMoneda(categoria?.moneda ?? 'ARS')
    setActiva(categoria?.activa ?? true)
    const p = categoria?.porcentaje ?? 100
    setCompartido(p < 100)
    setPct(p < 100 ? String(p).replace('.', ',') : '70')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, categoria])

  async function guardar() {
    if (!nombre.trim()) return toast.error('Poné un nombre')
    const porcentaje = compartido ? Number(pct.replace(',', '.')) : 100
    if (!(porcentaje > 0 && porcentaje <= 100)) return toast.error('El porcentaje tiene que estar entre 1 y 100')
    setSaving(true)
    const row = { nombre: nombre.trim(), grupo_id: grupoId || null, tipo, frecuencia, moneda, activa, porcentaje }
    const { error } = categoria
      ? await supabase.from('categorias').update(row).eq('id', categoria.id)
      : await supabase.from('categorias').insert(row)
    setSaving(false)
    if (error) return toast.error(error.code === '23505' ? 'Ya existe una categoría con ese nombre' : error.message)
    await invalidate('categorias')
    toast.success(categoria ? 'Categoría actualizada' : 'Categoría creada')
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={categoria ? 'Editar categoría' : 'Nueva categoría'}>
      <div className="space-y-4">
        <Field label="Nombre">
          <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Alquiler, Súper, Nafta" autoFocus />
        </Field>
        <Field label="Grupo">
          <select className="input" value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
            <option value="">Sin grupo</option>
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nombre}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo">
            <Segmented
              value={tipo}
              onChange={(t) => {
                setTipo(t)
                setFrecuencia(t === 'variable' ? 'eventual' : 'mensual')
              }}
              options={[
                { value: 'fijo', label: 'Fijo' },
                { value: 'variable', label: 'Variable' },
              ]}
            />
          </Field>
          <Field label="Moneda">
            <Segmented
              value={moneda}
              onChange={setMoneda}
              options={[
                { value: 'ARS', label: 'ARS' },
                { value: 'USD', label: 'USD' },
              ]}
            />
          </Field>
        </div>
        <Field label="Frecuencia">
          <select className="input" value={frecuencia} onChange={(e) => setFrecuencia(e.target.value as Frecuencia)}>
            {FRECUENCIAS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="¿Cuánto pagás vos?">
          <div className="flex items-center gap-3">
            <Segmented
              value={compartido ? 'parte' : 'total'}
              onChange={(v) => setCompartido(v === 'parte')}
              options={[
                { value: 'total', label: 'El total' },
                { value: 'parte', label: 'Un porcentaje' },
              ]}
            />
            {compartido && (
              <div className="relative w-24">
                <input className="input tabular pr-7 text-right" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-white/40">%</span>
              </div>
            )}
          </div>
          {compartido && <p className="mt-1.5 text-xs text-white/45">Cargás el total de la factura y en las estadísticas se cuenta solo tu parte.</p>}
        </Field>
        {categoria && (
          <label className="flex items-center gap-2 text-sm text-white/80">
            <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} className="size-4 accent-emerald-500" />
            Activa (si la desactivás deja de aparecer para cargar, pero se conserva el historial)
          </label>
        )}
        <Button className="w-full" onClick={guardar} loading={saving}>
          Guardar
        </Button>
      </div>
    </Modal>
  )
}
