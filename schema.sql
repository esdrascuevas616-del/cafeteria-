-- Cafetería UCSD — ejecutar completo en Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  categoria text not null default 'Comida',
  emoji text,
  precio numeric(10,2) not null check (precio >= 0),
  stock_actual integer not null default 0 check (stock_actual >= 0),
  disponible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  estado text not null default 'Pendiente'
    check (estado in ('Pendiente','Cobrado / Listo','Entregado')),
  metodo_pago text not null check (metodo_pago in ('Efectivo','Tarjeta','Transferencia')),
  calentar boolean not null default false,
  total numeric(10,2) not null default 0 check (total >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.ticket_items (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  producto_id uuid not null references public.productos(id),
  nombre_producto text not null,
  cantidad integer not null check (cantidad > 0),
  precio_unitario numeric(10,2) not null check (precio_unitario >= 0),
  created_at timestamptz not null default now()
);

create index if not exists tickets_estado_created_idx on public.tickets(estado, created_at);
create index if not exists ticket_items_ticket_idx on public.ticket_items(ticket_id);

-- Trigger: descuenta stock de forma atómica y evita vender más unidades de las disponibles.
create or replace function public.descontar_stock_ticket_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock integer;
begin
  update public.productos
     set stock_actual = stock_actual - new.cantidad,
         disponible = (stock_actual - new.cantidad) > 0,
         updated_at = now()
   where id = new.producto_id
     and disponible = true
     and stock_actual >= new.cantidad
  returning stock_actual into v_stock;

  if not found then
    raise exception 'Stock insuficiente o producto no disponible (producto %)', new.producto_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_descontar_stock_ticket_item on public.ticket_items;
create trigger trg_descontar_stock_ticket_item
before insert on public.ticket_items
for each row execute function public.descontar_stock_ticket_item();

-- Genera código corto y crea ticket + líneas en una sola transacción.
create or replace function public.crear_ticket(
  p_items jsonb,
  p_calentar boolean default false,
  p_metodo_pago text default 'Efectivo'
)
returns public.tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.tickets;
  v_item jsonb;
  v_producto public.productos;
  v_cantidad integer;
  v_total numeric(10,2) := 0;
  v_codigo text;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido debe contener al menos un producto';
  end if;
  if p_metodo_pago not in ('Efectivo','Tarjeta','Transferencia') then
    raise exception 'Método de pago inválido';
  end if;

  -- Calcular total con precio tomado de la base de datos, nunca del navegador.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cantidad := (v_item->>'cantidad')::integer;
    if v_cantidad < 1 then raise exception 'Cantidad inválida'; end if;
    select * into v_producto from public.productos
      where id = (v_item->>'producto_id')::uuid;
    if not found or not v_producto.disponible or v_producto.stock_actual < v_cantidad then
      raise exception 'Producto sin stock suficiente';
    end if;
    v_total := v_total + (v_producto.precio * v_cantidad);
  end loop;

  v_codigo := 'UCSD-' || lpad((floor(random() * 900) + 100)::int::text, 3, '0');
  -- Evitar colisión del código de turno.
  while exists (select 1 from public.tickets where codigo = v_codigo) loop
    v_codigo := 'UCSD-' || lpad((floor(random() * 900) + 100)::int::text, 3, '0');
  end loop;

  insert into public.tickets(codigo, metodo_pago, calentar, total)
  values (v_codigo, p_metodo_pago, coalesce(p_calentar,false), v_total)
  returning * into v_ticket;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cantidad := (v_item->>'cantidad')::integer;
    select * into v_producto from public.productos
      where id = (v_item->>'producto_id')::uuid;
    insert into public.ticket_items(ticket_id, producto_id, nombre_producto, cantidad, precio_unitario)
    values (v_ticket.id, v_producto.id, v_producto.nombre, v_cantidad, v_producto.precio);
  end loop;

  return v_ticket;
end;
$$;

-- RLS: políticas de MVP para una demo interna. Ver advertencia de seguridad en README.
alter table public.productos enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_items enable row level security;

drop policy if exists "lectura publica productos" on public.productos;
create policy "lectura publica productos" on public.productos for select to anon, authenticated using (true);
drop policy if exists "barra demo actualiza productos" on public.productos;
create policy "barra demo actualiza productos" on public.productos for update to anon, authenticated using (true) with check (true);

drop policy if exists "lectura publica tickets" on public.tickets;
create policy "lectura publica tickets" on public.tickets for select to anon, authenticated using (true);
drop policy if exists "barra demo actualiza tickets" on public.tickets;
create policy "barra demo actualiza tickets" on public.tickets for update to anon, authenticated using (true) with check (true);

drop policy if exists "lectura publica items" on public.ticket_items;
create policy "lectura publica items" on public.ticket_items for select to anon, authenticated using (true);

-- La creación de pedidos se hace exclusivamente por RPC.
revoke all on function public.crear_ticket(jsonb, boolean, text) from public;
grant execute on function public.crear_ticket(jsonb, boolean, text) to anon, authenticated;

-- Publicar las tablas para Supabase Realtime.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'productos'
  ) then alter publication supabase_realtime add table public.productos; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tickets'
  ) then alter publication supabase_realtime add table public.tickets; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ticket_items'
  ) then alter publication supabase_realtime add table public.ticket_items; end if;
end $$;

insert into public.productos(nombre, descripcion, categoria, emoji, precio, stock_actual, disponible)
select v.nombre, v.descripcion, v.categoria, v.emoji, v.precio, v.stock, v.stock > 0
from (values
 ('Sándwich de jamón y queso','Pan fresco, jamón y queso','Comida','🥪',150::numeric,12),
 ('Pastelito','Relleno de pollo','Comida','🥟',65::numeric,20),
 ('Jugo natural','Fruta de temporada','Bebidas','🧃',90::numeric,8),
 ('Café','Café recién preparado','Bebidas','☕',50::numeric,15),
 ('Agua','Agua purificada  botellita','Bebidas','💧',35::numeric,24)
) as v(nombre,descripcion,categoria,emoji,precio,stock)
where not exists (select 1 from public.productos p where p.nombre = v.nombre);
