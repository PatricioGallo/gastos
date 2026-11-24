import { useMemo } from 'react'
import { usePrefs } from './prefs'
import { useCategorias, useGastos, useGrupos, useIndicadores, useIngresos, useTrabajos } from './queries'
import type { Categoria, Gasto, Grupo, Moneda } from './types'
import { addMeses, periodo, variacion } from './utils'

export const SIN_GRUPO: Grupo = {
  id: '__sin_grupo__',
  user_id: '',
  nombre: 'Sin grupo',
  color: '#64748b',
  icono: 'tag',
  orden: 999,
}

/**
 * Junta todos los datos del usuario y expone helpers de cálculo ya convertidos a la
 * moneda de vista (ARS o USD) con la cotización elegida.
 */
export function useFinanzas() {
  const { vista, dolar: tipoDolar } = usePrefs()
  const qGrupos = useGrupos()
  const qCategorias = useCategorias()
  const qGastos = useGastos()
  const qIngresos = useIngresos()
  const qIndicadores = useIndicadores()
  const qTrabajos = useTrabajos()

  const queries = [qGrupos, qCategorias, qGastos, qIngresos, qIndicadores, qTrabajos]
  const loading = queries.some((q) => q.isLoading)
  const error = queries.find((q) => q.error)?.error ?? null

  const grupos = qGrupos.data ?? []
  const categorias = qCategorias.data ?? []
  const gastos = qGastos.data ?? []
  const ingresos = qIngresos.data ?? []
  const indicadores = qIndicadores.data ?? []
  const trabajos = qTrabajos.data ?? []

  return useMemo(() => {
    const grupoById = new Map(grupos.map((g) => [g.id, g]))
    const catById = new Map(categorias.map((c) => [c.id, c]))
    const grupoDe = (c: Categoria | undefined) => (c?.grupo_id && grupoById.get(c.grupo_id)) || SIN_GRUPO

    // --- cotizaciones e IPC -------------------------------------------------
    const dolarSerie = indicadores
      .filter((i) => i.tipo === tipoDolar)
      .sort((a, b) => a.periodo.localeCompare(b.periodo))
    const dolarMap = new Map(dolarSerie.map((i) => [i.periodo, i.valor]))
    const ipcMap = new Map(indicadores.filter((i) => i.tipo === 'ipc').map((i) => [i.periodo, i.valor]))

    /** Cotización del mes; si no hay, la más cercana anterior (o la primera disponible). */
    function dolar(p: string): number | null {
      const v = dolarMap.get(p)
      if (v) return v
      let mejor: number | null = null
      for (const i of dolarSerie) {
        if (i.periodo <= p) mejor = i.valor
        else break
      }
      return mejor ?? dolarSerie[0]?.valor ?? null
    }

    function convertir(monto: number, moneda: Moneda, p: string, destino: Moneda = vista): number {
      if (moneda === destino) return monto
      const d = dolar(p)
      if (!d) return NaN
      return destino === 'USD' ? monto / d : monto * d
    }

    const ipc = (p: string) => ipcMap.get(p) ?? null

    /** Inflación compuesta de los meses en (desde, hasta]. Ignora meses sin dato. */
    function inflacionEntre(desde: string, hasta: string) {
      let f = 1
      let meses = 0
      let faltan = 0
      for (let p = addMeses(desde, 1); p <= hasta; p = addMeses(p, 1)) {
        const v = ipcMap.get(p)
        if (v == null) faltan++
        else {
          f *= 1 + v / 100
          meses++
        }
      }
      return { valor: meses ? (f - 1) * 100 : null, faltan }
    }

    const inflacionAnual = (anio: number, hasta?: string) =>
      inflacionEntre(periodo(anio - 1, 11), hasta ?? periodo(anio, 11))

    const inflacionInteranual = (p: string) => inflacionEntre(addMeses(p, -12), p)

    // --- gastos --------------------------------------------------------------
    const gastosPorPeriodo = new Map<string, Gasto[]>()
    for (const g of gastos) {
      const arr = gastosPorPeriodo.get(g.periodo) ?? []
      arr.push(g)
      gastosPorPeriodo.set(g.periodo, arr)
    }
    const gastosDe = (p: string) => gastosPorPeriodo.get(p) ?? []

    const montoVista = (g: Gasto) => convertir(g.monto, g.moneda, g.periodo)

    const totalMes = (p: string, filtro?: (g: Gasto) => boolean) =>
      gastosDe(p)
        .filter((g) => !filtro || filtro(g))
        .reduce((s, g) => s + montoVista(g), 0)

    function porCategoria(p: string) {
      const m = new Map<string, number>()
      for (const g of gastosDe(p)) m.set(g.categoria_id, (m.get(g.categoria_id) ?? 0) + montoVista(g))
      return m
    }

    function porGrupo(p: string) {
      const m = new Map<string, { grupo: Grupo; total: number }>()
      for (const g of gastosDe(p)) {
        const grupo = grupoDe(catById.get(g.categoria_id))
        const acc = m.get(grupo.id) ?? { grupo, total: 0 }
        acc.total += montoVista(g)
        m.set(grupo.id, acc)
      }
      return [...m.values()].sort((a, b) => b.total - a.total)
    }

    const esFijo = (g: Gasto) => catById.get(g.categoria_id)?.tipo === 'fijo'

    /**
     * Inflación personal del mes: cuánto subieron (en pesos) los gastos fijos mensuales
     * que existen en este mes y en el anterior.
     */
    function inflacionPersonal(p: string) {
      const prev = addMeses(p, -1)
      const actual = new Map<string, number>()
      const anterior = new Map<string, number>()
      const sumar = (m: Map<string, number>, g: Gasto) => {
        const c = catById.get(g.categoria_id)
        if (!c || c.tipo !== 'fijo' || c.frecuencia !== 'mensual') return
        m.set(c.id, (m.get(c.id) ?? 0) + convertir(g.monto, g.moneda, g.periodo, 'ARS'))
      }
      gastosDe(p).forEach((g) => sumar(actual, g))
      gastosDe(prev).forEach((g) => sumar(anterior, g))
      let a = 0
      let b = 0
      for (const [id, v] of actual) {
        const w = anterior.get(id)
        if (w && v) {
          a += v
          b += w
        }
      }
      return variacion(a, b)
    }

    // --- ingresos ------------------------------------------------------------
    const ingresosDe = (p: string) => ingresos.filter((i) => i.periodo === p)
    function ingresoMes(p: string, soloSalario = false) {
      const rows = ingresosDe(p).filter((i) => !soloSalario || i.trabajo_id != null)
      if (!rows.length) return null
      return rows.reduce((s, i) => s + convertir(i.monto, i.moneda, i.periodo), 0)
    }

    const periodosConGastos = [...gastosPorPeriodo.keys()].sort()
    const anios = [
      ...new Set([...periodosConGastos, ...ingresos.map((i) => i.periodo)].map((p) => Number(p.slice(0, 4)))),
    ].sort()

    return {
      loading,
      error,
      vista,
      grupos,
      categorias,
      gastos,
      ingresos,
      indicadores,
      trabajos,
      grupoById,
      catById,
      grupoDe,
      dolar,
      convertir,
      ipc,
      inflacionEntre,
      inflacionAnual,
      inflacionInteranual,
      inflacionPersonal,
      gastosDe,
      totalMes,
      porCategoria,
      porGrupo,
      esFijo,
      ingresosDe,
      ingresoMes,
      periodosConGastos,
      anios,
    }
  }, [loading, error, vista, tipoDolar, grupos, categorias, gastos, ingresos, indicadores, trabajos])
}

export type Finanzas = ReturnType<typeof useFinanzas>
