import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabaseClient'
import type { Finanzas } from './finanzas'
import { addMeses, periodoActual } from './utils'

export interface ContratoAlquiler {
  user_id: string
  inicio: string
  monto: number
  indice: 'ipc' | 'icl'
  frecuencia_meses: number
  categoria_id: string | null
}

export const CONTRATO_DEFAULT = { inicio: '2026-04-01', monto: 900000, indice: 'icl' as const, frecuencia_meses: 3 }

export const useContrato = () =>
  useQuery({
    queryKey: ['contrato_alquiler'],
    queryFn: async () => {
      const { data, error } = await supabase.from('contrato_alquiler').select('*').maybeSingle()
      if (error) throw error
      return data ? ({ ...data, monto: Number(data.monto) } as ContratoAlquiler) : null
    },
  })

// ---------------------------------------------------------------------------
// ICL (Índice para Contratos de Locación, BCRA, valor diario)

const BCRA = 'https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/40'

async function fetchICL(desde: string): Promise<[string, number][]> {
  const hasta = new Date().toISOString().slice(0, 10)
  const out: [string, number][] = []
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${BCRA}?desde=${desde}&hasta=${hasta}&limit=1000&offset=${offset}`)
    if (!r.ok) throw new Error(`BCRA respondió ${r.status}`)
    const json = (await r.json()) as { results: { detalle: { fecha: string; valor: number }[] }[] }
    const det = json.results?.[0]?.detalle ?? []
    out.push(...det.map((d) => [d.fecha, d.valor] as [string, number]))
    if (det.length < 1000) break
  }
  return out.sort((a, b) => a[0].localeCompare(b[0]))
}

export const useICL = (desde: string) =>
  useQuery({
    queryKey: ['icl', desde],
    queryFn: () => fetchICL(addMeses(desde, -1)),
    staleTime: 6 * 3600 * 1000,
    retry: 2,
  })

// ---------------------------------------------------------------------------
// Cálculo del cronograma

export interface Tramo {
  desde: string
  hasta: string
  ipc: { monto: number; pct: number | null; estimado: boolean }
  icl: { monto: number; pct: number | null; estimado: boolean } | null
  /** promedio pagado (categoría vinculada) en los meses del tramo ya transcurridos */
  pagado: number | null
  actual: boolean
  futuro: boolean
}

const DIA = 86400000

/**
 * Ajuste estilo contrato: cada `frecuencia` meses el monto se multiplica por
 * - IPC: la inflación compuesta de los `frecuencia` meses anteriores al mes del ajuste
 *   (ej. contrato en abril, ajuste de julio = IPC abril × mayo × junio).
 * - ICL: ICL del día del ajuste / ICL del día del ajuste anterior.
 * Los meses sin IPC publicado se proyectan con el promedio de los últimos 3; el ICL futuro
 * con la tasa diaria de los últimos 30 días.
 */
export function calcularCronograma(
  f: Finanzas,
  c: { inicio: string; monto: number; frecuencia_meses: number; categoria_id: string | null },
  icl: [string, number][] | undefined,
): Tramo[] {
  const hoy = periodoActual()
  const freq = c.frecuencia_meses

  // IPC proyectado
  const ipcs = f.indicadores.filter((i) => i.tipo === 'ipc').sort((a, b) => a.periodo.localeCompare(b.periodo))
  const ult3 = ipcs.slice(-3).map((i) => i.valor)
  const ipcProy = ult3.length ? ult3.reduce((a, b) => a + b, 0) / ult3.length : 0

  // ICL en una fecha (o el último anterior); si es futura, proyectado
  const iclUlt = icl?.at(-1)
  const iclHace30 = icl?.length ? icl[Math.max(0, icl.length - 31)] : undefined
  const tasaDiaria =
    iclUlt && iclHace30 && iclUlt[0] !== iclHace30[0]
      ? Math.pow(iclUlt[1] / iclHace30[1], 1 / ((Date.parse(iclUlt[0]) - Date.parse(iclHace30[0])) / DIA)) - 1
      : 0
  function iclEn(fecha: string): { v: number; estimado: boolean } | null {
    if (!icl?.length) return null
    if (iclUlt && fecha > iclUlt[0]) {
      const dias = (Date.parse(fecha) - Date.parse(iclUlt[0])) / DIA
      return { v: iclUlt[1] * Math.pow(1 + tasaDiaria, dias), estimado: true }
    }
    let v: number | null = null
    for (const [d, val] of icl) {
      if (d <= fecha) v = val
      else break
    }
    return v != null ? { v, estimado: false } : null
  }

  // Pagado según la categoría vinculada
  function pagado(desde: string, hasta: string) {
    if (!c.categoria_id) return null
    const vals: number[] = []
    for (let p = desde; p <= hasta && p <= hoy; p = addMeses(p, 1)) {
      const gs = f.gastosDe(p).filter((g) => g.categoria_id === c.categoria_id)
      if (gs.length) vals.push(gs.reduce((s, g) => s + f.convertir(g.monto, g.moneda, p, 'ARS'), 0))
    }
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }

  const tramos: Tramo[] = []
  let montoIpc = c.monto
  let montoIcl = c.monto
  let iclOk = true
  for (let k = 0; k < 200; k++) {
    const desde = addMeses(c.inicio, k * freq)
    const hasta = addMeses(desde, freq - 1)
    if (desde > addMeses(hoy, freq)) break
    let pctIpc: number | null = null
    let pctIcl: number | null = null
    let estIpc = false
    let estIcl = false
    if (k > 0) {
      let factor = 1
      for (let i = freq; i >= 1; i--) {
        const p = addMeses(desde, -i)
        const v = f.ipc(p)
        if (v == null) estIpc = true
        factor *= 1 + (v ?? ipcProy) / 100
      }
      montoIpc *= factor
      pctIpc = (factor - 1) * 100

      const a = iclEn(addMeses(desde, -freq))
      const b = iclEn(desde)
      if (a && b) {
        const fi = b.v / a.v
        montoIcl *= fi
        pctIcl = (fi - 1) * 100
        estIcl = a.estimado || b.estimado
      } else iclOk = false
    }
    tramos.push({
      desde,
      hasta,
      ipc: { monto: montoIpc, pct: pctIpc, estimado: estIpc || (k > 0 && tramos[k - 1].ipc.estimado) },
      icl: iclOk ? { monto: montoIcl, pct: pctIcl, estimado: estIcl || (k > 0 && !!tramos[k - 1].icl?.estimado) } : null,
      pagado: pagado(desde, hasta),
      actual: desde <= hoy && hoy <= hasta,
      futuro: desde > hoy,
    })
  }
  return tramos
}
