# Cafetería UCSD

Aplicación Next.js App Router + Supabase. La raíz del proyecto es esta carpeta.

## Requisitos
- Node.js 20.9 o superior
- Proyecto Supabase
- Cuenta Vercel

## Ejecutar localmente
1. Copia `.env.example` a `.env.local`.
2. Completa `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. En Supabase > SQL Editor, ejecuta todo `supabase/schema.sql`.
4. En la raíz ejecuta:
   ```bash
   npm install
   npm run dev
   ```
5. Abre http://localhost:3000

## Desplegar en Vercel
1. Sube el contenido de esta carpeta a un repositorio GitHub (package.json debe quedar en la raíz).
2. En Vercel, importa ese repositorio. Framework: Next.js; Build command: `npm run build`.
3. En Settings > Environment Variables agrega:
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL de Supabase.
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = Publishable/anon key de Supabase.
   Marca Production, Preview y Development.
4. Redeploy después de guardar las variables.

## Seguridad: antes de usar con estudiantes reales
Este paquete es un MVP funcional para pruebas. Las políticas SQL permiten que cualquier visitante anónimo cambie stock y estados de tickets para que el panel de barra funcione sin inicio de sesión. **No es seguro para operación pública real.** Antes de producción, implementar Supabase Auth para personal y restringir UPDATE de productos/tickets a un rol de barra; también limitar la lectura de tickets para que un estudiante solo vea su propio pedido. Nunca coloques `service_role` en variables `NEXT_PUBLIC_*` ni en el navegador.

El RPC `crear_ticket` crea el ticket y sus líneas en una sola transacción. El trigger `descontar_stock_ticket_item` descuenta el inventario; si falta stock, toda la transacción se revierte. Los precios se consultan desde la base de datos, no desde el navegador.

## Estructura
```text
cafeteria-ucsd/
├── app/
│   ├── globals.css
│   ├── layout.js
│   └── page.js
├── lib/
│   └── supabase.js
├── supabase/
│   └── schema.sql
├── .env.example
├── .gitignore
├── next.config.js
├── package.json
└── README.md
```
