import { supabase } from './supabaseClient'
import type { Indicador, TipoIndicador } from './types'
import { periodoDeFecha, storageGet, storageSet } from './utils'

const API = 'https://api.argentinadatos.com/v1'
const DESDE = '2020-01-01'

const FUENTES_DOLAR: { tipo: TipoIndicador; casa: string }[] = [
  { tipo: 'dolar_blue', casa: 'blue' },
  { tipo: 'dolar_mep', casa: 'bolsa' },
  { tipo: 'dolar_oficial', casa: 'oficial' },
  { tipo: 'dolar_cripto', casa: 'cripto' },
]

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(`${API}${path}`)
  if (!r.ok) throw new Error(`Error ${r.status} consultando ${path}`)
  return r.json() as Promise<T>
}

/**
 * Baja IPC mensual (INDEC) y el promedio mensual de venta de los dólares blue/MEP/oficial
 * y los guarda en `indicadores`. No pisa valores cargados a mano.
 */
export async function sincronizarIndicadores(userId: string, existentes: Indicador[]) {
  const manuales = new Set(existentes.filter((i) => i.manual).map((i) => `${i.periodo}|${i.tipo}`))
  const filas: { user_id: string; periodo: string; tipo: TipoIndicador; valor: number; manual: boolean }[] = []

  const inflacion = await getJson<{ fecha: string; valor: number }[]>('/finanzas/indices/inflacion')
  for (const r of inflacion) {
    if (r.fecha < DESDE) continue
    filas.push({ user_id: userId, periodo: periodoDeFecha(r.fecha), tipo: 'ipc', valor: r.valor, manual: false })
  }

  const dolares = await Promise.all(
    FUENTES_DOLAR.map((f) => getJson<{ venta: number; fecha: string }[]>(`/cotizaciones/dolares/${f.casa}`)),
  )
  FUENTES_DOLAR.forEach((f, idx) => {
    const porMes = new Map<string, { suma: number; n: number }>()
    for (const r of dolares[idx]) {
      if (r.fecha < DESDE || !r.venta) continue
      const p = periodoDeFecha(r.fecha)
      const acc = porMes.get(p) ?? { suma: 0, n: 0 }
      acc.suma += r.venta
      acc.n++
      porMes.set(p, acc)
    }
    for (const [p, { suma, n }] of porMes) {
      filas.push({ user_id: userId, periodo: p, tipo: f.tipo, valor: Math.round((suma / n) * 100) / 100, manual: false })
    }
  })

  const aSubir = filas.filter((f) => !manuales.has(`${f.periodo}|${f.tipo}`))
  for (let i = 0; i < aSubir.length; i += 500) {
    const { error } = await supabase
      .from('indicadores')
      .upsert(aSubir.slice(i, i + 500), { onConflict: 'user_id,periodo,tipo' })
    if (error) throw new Error(error.message)
  }
  storageSet('gastos.ultimaSync', String(Date.now()))
  return aSubir.length
}

/** true si pasaron más de 12 h desde la última sincronización en este dispositivo. */
export function haceFaltaSincronizar() {
  const ultima = Number(storageGet('gastos.ultimaSync') ?? 0)
  return Date.now() - ultima > 12 * 3600 * 1000
}
