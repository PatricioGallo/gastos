import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabaseClient'
import type { Categoria, Gasto, Grupo, Indicador, Ingreso, Trabajo } from './types'

const PAGE = 1000

/** Trae todas las filas de una tabla (PostgREST corta en 1000 por pedido). */
async function fetchAll<T>(table: string, order: string[]): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select('*')
    for (const col of order) q = q.order(col)
    const { data, error } = await q.range(from, from + PAGE - 1)
    if (error) throw error
    out.push(...(data as T[]))
    if (!data || data.length < PAGE) break
  }
  return out
}

const num = <T extends { monto?: number; valor?: number }>(rows: T[]) =>
  rows.map((r) => ({
    ...r,
    ...(r.monto !== undefined && { monto: Number(r.monto) }),
    ...(r.valor !== undefined && { valor: Number(r.valor) }),
  }))

export const useGrupos = () =>
  useQuery({ queryKey: ['grupos'], queryFn: () => fetchAll<Grupo>('grupos', ['orden', 'nombre']) })

export const useCategorias = () =>
  useQuery({ queryKey: ['categorias'], queryFn: () => fetchAll<Categoria>('categorias', ['orden', 'nombre']) })

export const useGastos = () =>
  useQuery({
    queryKey: ['gastos'],
    queryFn: async () => num(await fetchAll<Gasto>('gastos', ['periodo', 'created_at'])),
  })

export const useTrabajos = () =>
  useQuery({ queryKey: ['trabajos'], queryFn: () => fetchAll<Trabajo>('trabajos', ['orden', 'created_at']) })

export const useIngresos = () =>
  useQuery({
    queryKey: ['ingresos'],
    queryFn: async () => num(await fetchAll<Ingreso>('ingresos', ['periodo', 'created_at'])),
  })

export const useIndicadores = () =>
  useQuery({
    queryKey: ['indicadores'],
    queryFn: async () => num(await fetchAll<Indicador>('indicadores', ['periodo'])),
  })

export function useInvalidate() {
  const qc = useQueryClient()
  return (...keys: string[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })))
}

/** Lanza el error de Supabase si lo hay, para usar con try/catch + toast. */
export function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

export const GRUPOS_DEFAULT: { nombre: string; color: string; icono: string }[] = [
  // Paleta categórica validada para fondo oscuro (CVD + contraste). Orden fijo.
  { nombre: 'Vivienda', color: '#3987e5', icono: 'home' },
  { nombre: 'Servicios', color: '#d95926', icono: 'zap' },
  { nombre: 'Tarjetas', color: '#199e70', icono: 'credit-card' },
  { nombre: 'Préstamos', color: '#c98500', icono: 'landmark' },
  { nombre: 'Familia', color: '#d55181', icono: 'heart' },
  { nombre: 'Salud y deporte', color: '#0ca30c', icono: 'dumbbell' },
  { nombre: 'Supermercado', color: '#9085e9', icono: 'shopping-cart' },
  { nombre: 'Ocio y salidas', color: '#e66767', icono: 'party-popper' },
  { nombre: 'Otros', color: '#7c8597', icono: 'tag' },
]

/** Colores sugeridos al crear un grupo nuevo (misma paleta). */
export const PALETA = [...GRUPOS_DEFAULT.map((g) => g.color)]
