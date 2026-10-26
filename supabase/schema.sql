-- ============================================================================
-- PEDILO — esquema de base de datos
--
-- Cómo usarlo: Supabase → SQL Editor → pegar todo → Run.
-- Es idempotente: podés volver a correrlo sin romper nada.
--
-- Decisiones que conviene entender antes de tocar nada:
--
-- 1. Los precios son ENTEROS en pesos, sin centavos. En Argentina nadie cobra
--    $3.200,50 en delivery, y los enteros evitan los errores de redondeo del
--    punto flotante. Si algún día hacen falta centavos, se migra a la unidad
--    mínima (guardar 320050 = $3.200,50), nunca a float.
--
-- 2. order_items guarda el nombre y el precio COPIADOS, no sólo el product_id.
--    Un pedido es un documento histórico: si el comercio sube el precio o borra
--    el producto, el pedido viejo tiene que seguir diciendo lo que se cobró.
--    Esto además evita el bug que teníamos en el prototipo, donde el pedido
--    explotaba si el producto ya no existía.
--
-- 3. Los totales del pedido se guardan calculados (subtotal, descuento, envío).
--    No se recalculan al leer: si mañana cambia la regla de envío gratis, los
--    pedidos viejos tienen que seguir mostrando lo que pagó el cliente.
--
-- 4. Los comercios NO se auto-registran. Se cargan a mano desde el panel del
--    equipo después de revisar la solicitud. Por eso stores.aprobado.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- tipos ----

do $$ begin
  create type rol_usuario as enum ('cliente', 'comercio', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_pedido as enum ('Pendiente', 'Preparando', 'En camino', 'Entregado', 'Rechazado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_solicitud as enum ('nueva', 'contactada', 'aprobada', 'rechazada');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------- perfiles ----
-- Extiende auth.users. Un usuario de Supabase Auth = una fila acá.

create table if not exists public.perfiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  rol               rol_usuario not null default 'cliente',
  nombre            text not null default '',
  email             text not null default '',
  telefono          text not null default '',
  -- Fuente ÚNICA de verdad de la dirección. El header, el checkout y los
  -- próximos pedidos leen de acá. El checkout puede usar otra dirección para
  -- un pedido puntual, pero eso no toca esta columna salvo que el cliente
  -- marque "guardar como mi dirección".
  direccion         text not null default '',
  metodo_pago       text not null default 'efectivo',
  -- Coordenadas del pin que el cliente puso en el mapa. El texto de arriba es
  -- lo que lee el repartidor; esto es lo que usa el cálculo de distancia.
  lat               double precision,
  lng               double precision,
  creado_en         timestamptz not null default now()
);

-- Al registrarse un usuario se le crea el perfil solo.
create or replace function public.crear_perfil_al_registrarse()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, email, nombre)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil_al_registrarse();

-- ------------------------------------------------------------- comercios ---

create table if not exists public.comercios (
  id                uuid primary key default gen_random_uuid(),
  -- Quién administra el local. Se asigna cuando el equipo crea la cuenta.
  dueno_id          uuid references public.perfiles(id) on delete set null,
  nombre            text not null,
  descripcion       text not null default '',
  categoria         text not null,
  direccion         text not null default '',
  telefono          text not null default '',
  -- Texto libre a propósito: "25-35 min", "hasta 1 hora". Se muestra tal cual.
  -- No lo parsees: en el prototipo lo cortábamos por "-" y quedaba "35 minutos min".
  tiempo_entrega    text not null default '30-45 min',
  costo_envio       integer not null default 0 check (costo_envio >= 0),
  -- Interruptor manual del comercio ("cerrar local" aunque sea horario de atención).
  abierto           boolean not null default true,
  logo_url          text,
  portada_url       text,
  lat               double precision,
  lng               double precision,
  -- Radio propio del local. NULL = usar el radio global de configuracion.
  -- Hoy está siempre en NULL: la app se prueba en una ciudad chica y alcanza
  -- con un número para todos. Está acá para que el día que haga falta sea
  -- cargar un valor y no una migración.
  radio_envio_km    numeric(5,2) check (radio_envio_km is null or radio_envio_km > 0),
  -- El equipo de Pedilo aprueba. Sin esto el local no se ve en el marketplace.
  aprobado          boolean not null default false,
  creado_en         timestamptz not null default now()
);

create index if not exists comercios_categoria_idx on public.comercios (categoria) where aprobado;
create index if not exists comercios_dueno_idx     on public.comercios (dueno_id);

-- Horarios por día. Si un local no tiene filas acá, vale sólo `abierto`.
-- Permite mostrar "Cerrado · abre a las 19:00" en vez de un booleano mudo.
create table if not exists public.comercio_horarios (
  id            uuid primary key default gen_random_uuid(),
  comercio_id   uuid not null references public.comercios(id) on delete cascade,
  dia_semana    smallint not null check (dia_semana between 0 and 6),  -- 0 = domingo
  abre          time not null,
  cierra        time not null,
  unique (comercio_id, dia_semana, abre)
);

-- ------------------------------------------------------------- productos ---

create table if not exists public.productos (
  id                 uuid primary key default gen_random_uuid(),
  comercio_id        uuid not null references public.comercios(id) on delete cascade,
  nombre             text not null,
  descripcion        text not null default '',
  precio             integer not null check (precio > 0),   -- $0 no es un producto
  subcategoria       text not null default '',
  subcategoria_icono text not null default '',
  -- "Ocultar" en vez de borrar: se acabó el stock pero el producto vuelve.
  activo             boolean not null default true,
  orden              integer not null default 0,
  creado_en          timestamptz not null default now()
);

create index if not exists productos_comercio_idx on public.productos (comercio_id);

-- Hasta 3 fotos por producto. Tabla aparte y no un array de texto, para poder
-- ordenarlas y borrar una sola sin reescribir la fila entera.
create table if not exists public.producto_fotos (
  id           uuid primary key default gen_random_uuid(),
  producto_id  uuid not null references public.productos(id) on delete cascade,
  url          text not null,
  orden        smallint not null default 0
);

create index if not exists producto_fotos_producto_idx on public.producto_fotos (producto_id);

-- Máximo 3 fotos, garantizado en la base y no sólo en la interfaz.
create or replace function public.limitar_fotos_producto()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.producto_fotos where producto_id = new.producto_id) >= 3 then
    raise exception 'Un producto puede tener hasta 3 fotos';
  end if;
  return new;
end $$;

drop trigger if exists tope_fotos_producto on public.producto_fotos;
create trigger tope_fotos_producto
  before insert on public.producto_fotos
  for each row execute function public.limitar_fotos_producto();

-- --------------------------------------------------------------- cupones ---

-- Los cupones son la ÚNICA fuente de promociones. No hay descuentos
-- automáticos por medio de pago ni envío gratis por monto: toda promo es una
-- fila acá, que se crea y se apaga desde el panel sin publicar la app.
-- Un cupón puede descontar un porcentaje, dar envío gratis, o las dos cosas.
create table if not exists public.cupones (
  codigo        text primary key,
  descripcion   text not null default '',
  -- NULL si el cupón sólo da envío gratis.
  porcentaje    smallint check (porcentaje is null or porcentaje between 1 and 100),
  envio_gratis  boolean not null default false,
  activo        boolean not null default true,
  vence_el      timestamptz,
  usos_max      integer,
  usos          integer not null default 0,
  -- Un cupón que no descuenta ni da envío gratis no es un cupón.
  constraint cupones_hace_algo check (envio_gratis or porcentaje is not null)
);

-- ---------------------------------------------------------------- pedidos --

create table if not exists public.pedidos (
  id                uuid primary key default gen_random_uuid(),
  cliente_id        uuid not null references public.perfiles(id) on delete restrict,
  comercio_id       uuid not null references public.comercios(id) on delete restrict,

  estado            estado_pedido not null default 'Pendiente',
  motivo_rechazo    text,

  -- Totales congelados al momento del pedido (ver nota 3 arriba).
  subtotal          integer not null check (subtotal >= 0),
  descuento         integer not null default 0 check (descuento >= 0),
  promo_label       text,
  cupon_codigo      text references public.cupones(codigo) on delete set null,
  costo_envio       integer not null default 0 check (costo_envio >= 0),
  envio_gratis      boolean not null default false,
  -- Cargo de la plataforma. Va aparte del envío porque no es plata del
  -- comercio: cuando haya que liquidarle, el corte tiene que estar hecho acá
  -- y no reconstruido a mano después.
  tarifa_servicio   integer not null default 0 check (tarifa_servicio >= 0),
  total             integer not null check (total >= 0),

  -- Datos de entrega copiados: si el cliente cambia su dirección después, el
  -- pedido viejo tiene que seguir diciendo a dónde fue.
  direccion         text not null,
  telefono          text not null,
  nota              text not null default '' check (char_length(nota) <= 200),

  metodo_pago       text not null,
  pago_label        text not null default '',
  efectivo_con      integer,
  vuelto            integer,

  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now()
);

create index if not exists pedidos_cliente_idx  on public.pedidos (cliente_id, creado_en desc);
create index if not exists pedidos_comercio_idx on public.pedidos (comercio_id, creado_en desc);
create index if not exists pedidos_activos_idx  on public.pedidos (comercio_id)
  where estado in ('Pendiente', 'Preparando', 'En camino');

create or replace function public.tocar_actualizado_en()
returns trigger language plpgsql as $$
begin new.actualizado_en = now(); return new; end $$;

drop trigger if exists pedidos_actualizado on public.pedidos;
create trigger pedidos_actualizado before update on public.pedidos
  for each row execute function public.tocar_actualizado_en();

-- Renglones del pedido. El producto puede desaparecer; el renglón no.
create table if not exists public.pedido_items (
  id           uuid primary key default gen_random_uuid(),
  pedido_id    uuid not null references public.pedidos(id) on delete cascade,
  producto_id  uuid references public.productos(id) on delete set null,
  nombre       text not null,          -- copia
  precio       integer not null,       -- copia, precio unitario al momento
  cantidad     smallint not null check (cantidad > 0),
  foto_url     text,                   -- copia
  -- "Sin cebolla", "bien cocida". Va pegada al producto y no a una nota general
  -- del pedido: el comercio la ve al lado del renglón que tiene que preparar.
  nota         text not null default '' check (char_length(nota) <= 140)
);

create index if not exists pedido_items_pedido_idx on public.pedido_items (pedido_id);

-- --------------------------------------------------------- configuración ---
-- Parámetros que el equipo puede cambiar sin volver a publicar la app.

create table if not exists public.configuracion (
  clave       text primary key,
  valor       text not null,
  descripcion text not null default '',
  actualizado timestamptz not null default now()
);

insert into public.configuracion (clave, valor, descripcion) values
  ('radio_envio_km', '8', 'Hasta cuántos kilómetros del local se puede pedir. Global mientras la app se pruebe en una ciudad chica.'),
  ('tarifa_servicio_monto', '450', 'Cargo fijo de la plataforma por pedido, en pesos. 0 para no cobrarlo.'),
  ('tarifa_servicio_pct',   '0',   'Cargo de la plataforma como % del subtotal. Se suma al monto fijo. 0 para no usarlo.'),
  ('envio_base',            '1500', 'Lo que paga el cliente por el envío, en pesos. Lo cobra Pedilo, que pone el repartidor. Provisorio hasta calcularlo por distancia.')
on conflict (clave) do nothing;

-- -------------------------------------------------- solicitudes de alta ----
-- El formulario "Sumá tu local". No crea comercios: crea una solicitud que el
-- equipo revisa a mano. Google verifica que un mail exista, no que alguien sea
-- dueño de un local.

create table if not exists public.solicitudes_comercio (
  id             uuid primary key default gen_random_uuid(),
  nombre_local   text not null,
  contacto       text not null,
  email          text not null,
  telefono       text not null,
  rubro          text not null,
  descripcion    text not null,
  estado         estado_solicitud not null default 'nueva',
  notas_internas text not null default '',
  creado_en      timestamptz not null default now()
);

-- ============================================================================
-- ROW LEVEL SECURITY
--
-- Sin RLS, cualquiera con la clave pública puede leer y escribir toda la base.
-- La clave `sb_publishable_` está en el bundle de la app: asumí que es pública.
-- Todo lo que protege los datos está acá abajo.
-- ============================================================================

alter table public.perfiles             enable row level security;
alter table public.comercios            enable row level security;
alter table public.comercio_horarios    enable row level security;
alter table public.productos            enable row level security;
alter table public.producto_fotos       enable row level security;
alter table public.cupones              enable row level security;
alter table public.pedidos              enable row level security;
alter table public.pedido_items         enable row level security;
alter table public.solicitudes_comercio enable row level security;
alter table public.configuracion         enable row level security;

drop policy if exists configuracion_lectura on public.configuracion;
create policy configuracion_lectura on public.configuracion for select using (true);

-- helper: ¿el usuario actual es dueño de este comercio?
create or replace function public.es_dueno(c_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.comercios where id = c_id and dueno_id = auth.uid());
$$;

-- perfiles: cada uno ve y edita el suyo
drop policy if exists perfil_propio_select on public.perfiles;
create policy perfil_propio_select on public.perfiles for select using (id = auth.uid());
drop policy if exists perfil_propio_update on public.perfiles;
create policy perfil_propio_update on public.perfiles for update using (id = auth.uid()) with check (id = auth.uid());

-- comercios: los aprobados los ve cualquiera; el dueño edita el suyo
drop policy if exists comercios_publicos on public.comercios;
create policy comercios_publicos on public.comercios for select using (aprobado or dueno_id = auth.uid());
drop policy if exists comercios_edita_dueno on public.comercios;
create policy comercios_edita_dueno on public.comercios for update using (dueno_id = auth.uid()) with check (dueno_id = auth.uid());

drop policy if exists horarios_publicos on public.comercio_horarios;
create policy horarios_publicos on public.comercio_horarios for select using (true);
drop policy if exists horarios_edita_dueno on public.comercio_horarios;
create policy horarios_edita_dueno on public.comercio_horarios for all using (public.es_dueno(comercio_id)) with check (public.es_dueno(comercio_id));

-- productos: se ven los activos de comercios aprobados; el dueño ve y edita todos los suyos
drop policy if exists productos_publicos on public.productos;
create policy productos_publicos on public.productos for select using (
  (activo and exists (select 1 from public.comercios c where c.id = comercio_id and c.aprobado))
  or public.es_dueno(comercio_id)
);
drop policy if exists productos_edita_dueno on public.productos;
create policy productos_edita_dueno on public.productos for all using (public.es_dueno(comercio_id)) with check (public.es_dueno(comercio_id));

drop policy if exists fotos_publicas on public.producto_fotos;
create policy fotos_publicas on public.producto_fotos for select using (true);
drop policy if exists fotos_edita_dueno on public.producto_fotos;
create policy fotos_edita_dueno on public.producto_fotos for all
  using (exists (select 1 from public.productos p where p.id = producto_id and public.es_dueno(p.comercio_id)))
  with check (exists (select 1 from public.productos p where p.id = producto_id and public.es_dueno(p.comercio_id)));

-- cupones: se leen los vigentes, nadie los escribe desde la app
drop policy if exists cupones_vigentes on public.cupones;
create policy cupones_vigentes on public.cupones for select using (activo and (vence_el is null or vence_el > now()));

-- pedidos: el cliente ve los suyos, el comercio ve los que recibe
drop policy if exists pedidos_ver on public.pedidos;
create policy pedidos_ver on public.pedidos for select using (cliente_id = auth.uid() or public.es_dueno(comercio_id));
-- Nadie inserta pedidos directamente: se crean con la función crear_pedido(),
-- que recalcula los precios en el servidor. Ver el final de este archivo.
-- Sólo el comercio cambia el estado. El cliente no puede marcar su pedido como entregado.
drop policy if exists pedidos_estado on public.pedidos;
create policy pedidos_estado on public.pedidos for update using (public.es_dueno(comercio_id)) with check (public.es_dueno(comercio_id));

drop policy if exists items_ver on public.pedido_items;
create policy items_ver on public.pedido_items for select using (
  exists (select 1 from public.pedidos p where p.id = pedido_id and (p.cliente_id = auth.uid() or public.es_dueno(p.comercio_id)))
);

-- solicitudes: cualquiera puede mandar una, nadie puede leerlas desde la app
drop policy if exists solicitudes_crear on public.solicitudes_comercio;
create policy solicitudes_crear on public.solicitudes_comercio for insert with check (true);

-- ============================================================================
-- STORAGE
-- Dos buckets públicos: las fotos de comercios y productos se ven sin login.
-- ============================================================================

insert into storage.buckets (id, name, public) values ('comercios', 'comercios', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('productos', 'productos', true) on conflict (id) do nothing;

drop policy if exists lectura_publica_comercios on storage.objects;
create policy lectura_publica_comercios on storage.objects for select using (bucket_id in ('comercios', 'productos'));

drop policy if exists subida_autenticada on storage.objects;
create policy subida_autenticada on storage.objects for insert to authenticated
  with check (bucket_id in ('comercios', 'productos'));

-- ============================================================================
-- CREAR PEDIDOS
--
-- El cliente NO manda precios. Manda qué productos quiere y cuántos; el
-- servidor busca los precios en el catálogo, aplica las promos y calcula el
-- total. La clave publicable viaja en el bundle de la app: RLS controla quién
-- escribe, no qué escribe, así que un total falseado sólo se evita sacándole
-- al cliente la posibilidad de elegirlo.
--
-- Además es atómico: o se crea el pedido con todos sus renglones, o nada.
-- ============================================================================

-- Distancia en kilómetros entre dos puntos (haversine).
-- Es la misma fórmula que usa la app en src/lib/geo.ts: si alguna vez cambia
-- una, hay que cambiar la otra.
create or replace function public.distancia_km(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision
language sql immutable as $$
  select 6371 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) *
    power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- ---------------------------------------------------------------------------
-- crear_pedido
--
-- p_items es un JSON así:
--   [{"producto_id": "uuid", "cantidad": 2, "nota": "sin cebolla"}, ...]
--
-- Devuelve el pedido creado.
-- ---------------------------------------------------------------------------
create or replace function public.crear_pedido(
  p_comercio_id  uuid,
  p_items        jsonb,
  p_direccion    text,
  p_telefono     text,
  p_metodo_pago  text,
  p_nota         text default '',
  p_cupon        text default null,
  p_efectivo_con integer default null,
  p_lat          double precision default null,
  p_lng          double precision default null
) returns public.pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario     uuid := auth.uid();
  v_comercio    public.comercios;
  v_radio       numeric;
  v_distancia   double precision;
  v_subtotal    integer := 0;
  v_descuento   integer := 0;
  v_cupon       public.cupones;
  v_promo       text := null;
  v_envio       integer;
  v_envio_base  integer;
  v_envio_free  boolean := false;
  v_tarifa      integer := 0;
  v_tar_monto   integer;
  v_tar_pct     numeric;
  v_total       integer;
  v_pedido      public.pedidos;
  v_item        jsonb;
  v_producto    public.productos;
  v_cantidad    smallint;
  v_foto        text;
begin
  if v_usuario is null then
    raise exception 'Hay que iniciar sesión para pedir' using errcode = 'P0001';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene productos' using errcode = 'P0001';
  end if;

  -- ------------------------------------------------------------- el local ---
  select * into v_comercio from public.comercios where id = p_comercio_id;
  if not found or not v_comercio.aprobado then
    raise exception 'Ese local no está disponible' using errcode = 'P0001';
  end if;
  if not v_comercio.abierto then
    raise exception 'El local cerró mientras armabas el pedido' using errcode = 'P0001';
  end if;

  -- -------------------------------------------------------------- la zona ---
  select coalesce(v_comercio.radio_envio_km,
                  (select valor::numeric from public.configuracion where clave = 'radio_envio_km'),
                  8)
    into v_radio;

  if p_lat is not null and p_lng is not null
     and v_comercio.lat is not null and v_comercio.lng is not null then
    v_distancia := public.distancia_km(p_lat, p_lng, v_comercio.lat, v_comercio.lng);
    if v_distancia > v_radio then
      raise exception 'Tu dirección está a % km y el local entrega hasta % km',
        round(v_distancia::numeric, 1), v_radio using errcode = 'P0001';
    end if;
  end if;

  -- ------------------------------------------------------------ el pedido ---
  insert into public.pedidos (
    cliente_id, comercio_id, subtotal, descuento, costo_envio, tarifa_servicio, total,
    direccion, telefono, nota, metodo_pago, pago_label, efectivo_con
  ) values (
    v_usuario, p_comercio_id, 0, 0, 0, 0, 0,
    p_direccion, p_telefono, coalesce(p_nota, ''), p_metodo_pago, '', p_efectivo_con
  ) returning * into v_pedido;

  -- ---------------------------------------------------------- los renglones -
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cantidad := greatest(1, least(99, coalesce((v_item->>'cantidad')::smallint, 1)));

    select * into v_producto
      from public.productos
     where id = (v_item->>'producto_id')::uuid
       and comercio_id = p_comercio_id
       and activo;

    if not found then
      raise exception 'Uno de los productos ya no está disponible' using errcode = 'P0001';
    end if;

    select url into v_foto
      from public.producto_fotos
     where producto_id = v_producto.id
     order by orden limit 1;

    insert into public.pedido_items (pedido_id, producto_id, nombre, precio, cantidad, foto_url, nota)
    values (v_pedido.id, v_producto.id, v_producto.nombre, v_producto.precio, v_cantidad, v_foto,
            left(coalesce(v_item->>'nota', ''), 140));

    v_subtotal := v_subtotal + v_producto.precio * v_cantidad;
  end loop;

  -- -------------------------------------------------------------- el cupón --
  if p_cupon is not null and length(trim(p_cupon)) > 0 then
    select * into v_cupon
      from public.cupones
     where codigo = upper(trim(p_cupon))
       and activo
       and (vence_el is null or vence_el > now())
       and (usos_max is null or usos < usos_max);

    if found then
      v_descuento  := round(v_subtotal * coalesce(v_cupon.porcentaje, 0) / 100.0);
      v_envio_free := v_cupon.envio_gratis;
      v_promo      := v_cupon.descripcion;
    end if;
    -- Un cupón inválido no frena el pedido del lado del servidor: la app ya
    -- avisa antes de confirmar. Acá es una red de seguridad, no la validación.
  end if;

  -- ------------------------------------------------------ tarifa de servicio -
  -- Se calcula sobre el subtotal SIN descuento y no la afecta el envío gratis:
  -- es un cargo de la plataforma, no del comercio.
  select coalesce((select valor::integer from public.configuracion where clave = 'tarifa_servicio_monto'), 0),
         coalesce((select valor::numeric from public.configuracion where clave = 'tarifa_servicio_pct'), 0)
    into v_tar_monto, v_tar_pct;

  v_tarifa := greatest(0, v_tar_monto + round(v_subtotal * v_tar_pct / 100.0));

  -- El envío lo pone Pedilo, no el local: Pedilo pone el repartidor y Pedilo lo
  -- cobra. Si la fila de configuración no está, se cae al número viejo del
  -- comercio antes que cobrar 0 por un viaje que igual hay que pagar.
  select coalesce((select valor::integer from public.configuracion where clave = 'envio_base'),
                  v_comercio.costo_envio,
                  0)
    into v_envio_base;

  v_envio := case when v_envio_free then 0 else greatest(0, v_envio_base) end;
  v_total := greatest(0, v_subtotal - v_descuento) + v_envio + v_tarifa;

  if p_metodo_pago = 'efectivo' and p_efectivo_con is not null and p_efectivo_con < v_total then
    raise exception 'El monto en efectivo es menor al total del pedido' using errcode = 'P0001';
  end if;

  update public.pedidos set
    subtotal        = v_subtotal,
    descuento       = v_descuento,
    promo_label     = v_promo,
    cupon_codigo    = case when v_cupon.codigo is not null then v_cupon.codigo else null end,
    costo_envio     = v_envio,
    envio_gratis    = v_envio_free,
    tarifa_servicio = v_tarifa,
    total           = v_total,
    pago_label      = case p_metodo_pago
                        when 'efectivo'    then 'Efectivo'
                        when 'mercadopago' then 'Mercado Pago'
                        when 'debito'      then 'Tarjeta de débito'
                        when 'credito'     then 'Tarjeta de crédito'
                        else p_metodo_pago end,
    vuelto          = case when p_metodo_pago = 'efectivo' and p_efectivo_con is not null
                           then p_efectivo_con - v_total else null end
  where id = v_pedido.id
  returning * into v_pedido;

  if v_pedido.cupon_codigo is not null then
    update public.cupones set usos = usos + 1 where codigo = v_pedido.cupon_codigo;
  end if;

  return v_pedido;
end $$;

revoke all on function public.crear_pedido(uuid, jsonb, text, text, text, text, text, integer, double precision, double precision) from public;
grant execute on function public.crear_pedido(uuid, jsonb, text, text, text, text, text, integer, double precision, double precision) to authenticated;
