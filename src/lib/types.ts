export type Moneda = 'ARS' | 'USD'
export type TipoCategoria = 'fijo' | 'variable'
export type Frecuencia = 'mensual' | 'bimestral' | 'trimestral' | 'anual' | 'eventual'
export type TipoDolar = 'dolar_oficial' | 'dolar_blue' | 'dolar_mep'
export type TipoIndicador = 'ipc' | TipoDolar

export interface Grupo {
  id: string
  user_id: string
  nombre: string
  color: string
  icono: string
  orden: number
}

export interface Categoria {
  id: string
  user_id: string
  grupo_id: string | null
  nombre: string
  tipo: TipoCategoria
  frecuencia: Frecuencia
  moneda: Moneda
  activa: boolean
  orden: number
}

export interface Gasto {
  id: string
  user_id: string
  categoria_id: string
  periodo: string
  fecha: string | null
  monto: number
  moneda: Moneda
  nota: string | null
}

export interface Ingreso {
  id: string
  user_id: string
  periodo: string
  concepto: string
  monto: number
  moneda: Moneda
  nota: string | null
}

export interface Indicador {
  id: string
  user_id: string
  periodo: string
  tipo: TipoIndicador
  valor: number
  manual: boolean
}

export const FRECUENCIAS: { value: Frecuencia; label: string }[] = [
  { value: 'mensual', label: 'Mensual' },
  { value: 'bimestral', label: 'Bimestral' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'anual', label: 'Anual' },
  { value: 'eventual', label: 'Eventual' },
]

export const DOLARES: { value: TipoDolar; label: string }[] = [
  { value: 'dolar_blue', label: 'Blue' },
  { value: 'dolar_mep', label: 'MEP' },
  { value: 'dolar_oficial', label: 'Oficial' },
]
