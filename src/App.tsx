import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { Layout } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { Login } from '@/pages/Login'

const Resumen = lazy(() => import('@/pages/Resumen'))
const Cargar = lazy(() => import('@/pages/Cargar'))
const Anual = lazy(() => import('@/pages/Anual'))
const Ingresos = lazy(() => import('@/pages/Ingresos'))
const Inflacion = lazy(() => import('@/pages/Inflacion'))
const Configuracion = lazy(() => import('@/pages/Configuracion'))

export default function App() {
  const { session, loading } = useAuth()
  if (loading) return <Spinner />
  if (!session) return <Login />

  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Resumen />} />
          <Route path="/cargar" element={<Cargar />} />
          <Route path="/anual" element={<Anual />} />
          <Route path="/ingresos" element={<Ingresos />} />
          <Route path="/inflacion" element={<Inflacion />} />
          <Route path="/config" element={<Configuracion />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
