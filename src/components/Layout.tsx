import { useEffect, useRef } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { CalendarRange, LayoutDashboard, LogOut, PencilLine, Settings, TrendingUp, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth'
import { usePrefs } from '@/lib/prefs'
import { GRUPOS_DEFAULT, useGrupos, useIndicadores, useInvalidate } from '@/lib/queries'
import { haceFaltaSincronizar, sincronizarIndicadores } from '@/lib/indicadores'
import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'
import { Segmented } from './ui'

const LINKS = [
  { to: '/', label: 'Resumen', icon: LayoutDashboard },
  { to: '/cargar', label: 'Cargar', icon: PencilLine },
  { to: '/anual', label: 'Anual', icon: CalendarRange },
  { to: '/ingresos', label: 'Ingresos', icon: Wallet },
  { to: '/inflacion', label: 'Inflación', icon: TrendingUp },
  { to: '/config', label: 'Ajustes', icon: Settings },
]

/** Crea los grupos por defecto la primera vez y mantiene IPC/dólar al día. */
function useBootstrap() {
  const { session } = useAuth()
  const grupos = useGrupos()
  const indicadores = useIndicadores()
  const invalidate = useInvalidate()
  const seeded = useRef(false)
  const synced = useRef(false)

  useEffect(() => {
    if (!session || seeded.current || !grupos.isSuccess || grupos.data.length) return
    seeded.current = true
    supabase
      .from('grupos')
      .upsert(
        GRUPOS_DEFAULT.map((g, i) => ({ ...g, orden: i, user_id: session.user.id })),
        { onConflict: 'user_id,nombre', ignoreDuplicates: true },
      )
      .then(({ error }) => {
        if (error) toast.error(error.message)
        else invalidate('grupos')
      })
  }, [session, grupos.isSuccess, grupos.data, invalidate])

  useEffect(() => {
    if (!session || synced.current || !indicadores.isSuccess) return
    const falta = !indicadores.data.some((i) => i.tipo === 'dolar_cripto')
    if (indicadores.data.length && !falta && !haceFaltaSincronizar()) return
    synced.current = true
    sincronizarIndicadores(session.user.id, indicadores.data)
      .then(() => invalidate('indicadores'))
      .catch(() => {
        /* sin internet o API caída: se usan los datos guardados */
      })
  }, [session, indicadores.isSuccess, indicadores.data, invalidate])
}

export function Layout() {
  const { signOut } = useAuth()
  const { vista, setVista } = usePrefs()
  useBootstrap()
  const errorDatos = useGrupos().error

  return (
    <div className="min-h-dvh pb-24 sm:pb-0">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-bg-900/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-8" />
            <span className="font-display text-lg font-bold">Mis Gastos</span>
          </div>
          <nav className="hidden flex-1 items-center gap-1 sm:flex">
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'rounded-xl px-3 py-2 text-sm font-medium transition',
                    isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white',
                  )
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Segmented
              value={vista}
              onChange={setVista}
              options={[
                { value: 'ARS', label: '$ ARS' },
                { value: 'USD', label: 'US$' },
              ]}
            />
            <button onClick={signOut} className="hidden rounded-xl p-2 text-white/50 hover:bg-white/10 hover:text-white sm:block" title="Cerrar sesión">
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
        {errorDatos && (
          <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            No se pudieron leer tus datos: {errorDatos.message}
          </div>
        )}
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-bg-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:hidden">
        <div className="grid grid-cols-6">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) =>
                cn('flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium', isActive ? 'text-brand-400' : 'text-white/50')
              }
            >
              <l.icon className="size-5" />
              {l.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
