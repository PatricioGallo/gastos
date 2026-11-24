import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Moneda } from './types'

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
export const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

/** Periodo = 'YYYY-MM-01'. `mes` va de 0 a 11 (se normaliza si se pasa de rango). */
export function periodo(anio: number, mes: number): string {
  const d = new Date(Date.UTC(anio, mes, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

export function parsePeriodo(p: string) {
  const [y, m] = p.split('-').map(Number)
  return { anio: y, mes: m - 1 }
}

export function addMeses(p: string, n: number) {
  const { anio, mes } = parsePeriodo(p)
  return periodo(anio, mes + n)
}

export function periodoActual() {
  const d = new Date()
  return periodo(d.getFullYear(), d.getMonth())
}

export function periodoDeFecha(fecha: string) {
  return `${fecha.slice(0, 7)}-01`
}

export function labelPeriodo(p: string, corto = false) {
  const { anio, mes } = parsePeriodo(p)
  return corto ? `${MESES_CORTOS[mes]} ${String(anio).slice(2)}` : `${MESES[mes]} ${anio}`
}

export function mesesDelAnio(anio: number) {
  return Array.from({ length: 12 }, (_, i) => periodo(anio, i))
}

const fmtARS = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
const fmtUSD = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const fmtCompact = new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 })
const fmtNum = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 })

export function fmtMoney(n: number | null | undefined, moneda: Moneda = 'ARS') {
  if (n == null || !Number.isFinite(n)) return '—'
  return moneda === 'USD' ? fmtUSD.format(n).replace('US$', 'US$ ') : fmtARS.format(n)
}

export function fmtCompactMoney(n: number | null | undefined, moneda: Moneda = 'ARS') {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${moneda === 'USD' ? 'US$' : '$'}${fmtCompact.format(n)}`
}

export function fmtNumber(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return '—'
  return fmtNum.format(n)
}

/** `n` en porcentaje (ej 12.5 -> "+12,5%") */
export function fmtPct(n: number | null | undefined, signed = true, decimals = 1) {
  if (n == null || !Number.isFinite(n)) return '—'
  const s = n.toLocaleString('es-AR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  return `${signed && n > 0 ? '+' : ''}${s}%`
}

/** Variación porcentual de `a` respecto de `b` (null si no se puede calcular). */
export function variacion(a: number | null | undefined, b: number | null | undefined) {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null
  return (a / b - 1) * 100
}

/** Acepta "591000", "591.000", "1.274.000,50", "$ 1,274,000.50", "1274000.5". */
export function parseMonto(raw: string): number | null {
  let s = raw.replace(/[$\sUSD]/gi, '').trim()
  if (!s) return null
  const comas = (s.match(/,/g) ?? []).length
  const puntos = (s.match(/\./g) ?? []).length
  if (comas && puntos) {
    // el último separador es el decimal
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (comas) {
    s = comas === 1 && !/,\d{3}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '')
  } else if (puntos) {
    if (puntos > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, '')
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function storageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* sin storage: no pasa nada */
  }
}
