# Mis Gastos

Gastos mensuales fijos y variables, ingresos, inflación y dólar. React + Vite + Tailwind + Supabase, instalable como PWA.

## Desarrollo

```bash
cp .env.local.example .env.local   # completar URL y publishable key de Supabase
npm install
npm run dev
```

## Pantallas

- **Resumen**: total del mes, ingresos, ahorro, promedio anual, IPC, inflación personal, evolución por grupo.
- **Cargar**: gastos fijos por grupo (se guardan al salir del casillero, "copiar mes anterior") y variables con fecha y nota.
- **Anual**: planilla tipo Excel, mes más caro/barato, aumentos de cada gasto fijo vs inflación.
- **Ingresos**: salario por mes, extras, historial de aumentos, salario real y en dólares.
- **Inflación**: IPC (INDEC) y dólar blue/MEP/oficial desde argentinadatos.com, editables a mano.
- **Ajustes**: grupos, categorías, dólar de referencia, importar pegando desde Excel, exportar CSV.

## Base de datos (Supabase)

Tablas `grupos`, `categorias`, `gastos`, `ingresos`, `indicadores`, todas con RLS por `user_id`.
`periodo` es siempre el primer día del mes (`YYYY-MM-01`).
