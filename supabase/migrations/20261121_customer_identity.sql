-- Cafetería UCSD: identificación flexible del cliente.
-- Ejecutar una sola vez en Supabase SQL Editor después de publicar el cambio de la app.

alter table public.tickets
  add column if not exists tipo_cliente text not null default 'Estudiante',
  add column if not exists identificacion text;

alter table public.tickets
  drop constraint if exists tickets_tipo_cliente_check;

alter table public.tickets
  add constraint tickets_tipo_cliente_check
  check (tipo_cliente in ('Estudiante', 'Profesor', 'Visitante', 'Sin identificación'));

-- Reemplazar la función anterior para guardar el tipo de cliente y su identificación.
drop function if exists public.crear_ticket(jsonb, boolean, text);

create or replace function public.crear_ticket(
  p_items jsonb,
  p_calentar boolean default false,
  p_metodo_pago text default 'Efectivo',
  p_tipo_cliente text default 'Estudiante',
  p_identificacion text default null
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
  if p_tipo_cliente not in ('Estudiante','Profesor','Visitante','Sin identificación') then
    raise exception 'Tipo de cliente inválido';
  end if;
  if p_tipo_cliente = 'Sin identificación' then
    p_identificacion := null;
  elsif p_identificacion is null or length(trim(p_identificacion)) = 0 then
    raise exception 'La identificación del cliente es obligatoria';
  end if;

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
  while exists (select 1 from public.tickets where codigo = v_codigo) loop
    v_codigo := 'UCSD-' || lpad((floor(random() * 900) + 100)::int::text, 3, '0');
  end loop;

  insert into public.tickets(codigo, metodo_pago, calentar, total, tipo_cliente, identificacion)
  values (v_codigo, p_metodo_pago, coalesce(p_calentar,false), v_total, p_tipo_cliente, nullif(trim(p_identificacion), ''))
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

revoke all on function public.crear_ticket(jsonb, boolean, text, text, text) from public;
grant execute on function public.crear_ticket(jsonb, boolean, text, text, text) to anon, authenticated;
