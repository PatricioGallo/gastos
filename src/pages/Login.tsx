import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth'
import { Button, Card, Field } from '@/components/ui'

export function Login() {
  const { signIn, signUp } = useAuth()
  const [modo, setModo] = useState<'login' | 'registro'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    const error = modo === 'login' ? await signIn(email, password) : await signUp(email, password)
    setLoading(false)
    if (error) return toast.error(error === 'Invalid login credentials' ? 'Email o contraseña incorrectos' : error)
    if (modo === 'registro') toast.success('Cuenta creada. Si te llega un mail de confirmación, abrilo y después ingresá.')
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-14" />
          <div>
            <h1 className="font-display text-2xl font-bold">Mis Gastos</h1>
            <p className="text-sm text-white/50">{modo === 'login' ? 'Ingresá a tu cuenta' : 'Creá tu cuenta'}</p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Email">
            <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Contraseña">
            <input
              className="input"
              type="password"
              autoComplete={modo === 'login' ? 'current-password' : 'new-password'}
              minLength={6}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Button type="submit" className="w-full" loading={loading}>
            {modo === 'login' ? 'Ingresar' : 'Crear cuenta'}
          </Button>
        </form>
        <button
          className="mt-4 w-full text-center text-sm text-white/50 hover:text-white"
          onClick={() => setModo(modo === 'login' ? 'registro' : 'login')}
        >
          {modo === 'login' ? '¿Primera vez? Creá tu cuenta' : 'Ya tengo cuenta'}
        </button>
      </Card>
    </div>
  )
}
