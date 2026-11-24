import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Moneda, TipoDolar } from './types'
import { periodoActual, storageGet, storageSet } from './utils'

interface Prefs {
  /** Moneda en la que se muestran los totales y gráficos */
  vista: Moneda
  setVista: (m: Moneda) => void
  /** Cotización usada para convertir pesos <-> dólares */
  dolar: TipoDolar
  setDolar: (d: TipoDolar) => void
  /** Mes seleccionado, compartido entre pantallas */
  mes: string
  setMes: (p: string) => void
}

const PrefsContext = createContext<Prefs | null>(null)

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [vista, setVistaState] = useState<Moneda>(() => (storageGet('gastos.vista') === 'USD' ? 'USD' : 'ARS'))
  const [dolar, setDolarState] = useState<TipoDolar>(
    () => (storageGet('gastos.dolar') as TipoDolar | null) ?? 'dolar_blue',
  )
  const [mes, setMes] = useState(periodoActual)

  return (
    <PrefsContext.Provider
      value={{
        vista,
        setVista: (m) => {
          setVistaState(m)
          storageSet('gastos.vista', m)
        },
        dolar,
        setDolar: (d) => {
          setDolarState(d)
          storageSet('gastos.dolar', d)
        },
        mes,
        setMes,
      }}
    >
      {children}
    </PrefsContext.Provider>
  )
}

export function usePrefs() {
  const ctx = useContext(PrefsContext)
  if (!ctx) throw new Error('usePrefs debe usarse dentro de PrefsProvider')
  return ctx
}
