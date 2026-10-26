-- ============================================================================
-- MIGRACIÓN 10 — los repartidores toman pedidos
--
-- Correr en Supabase → SQL Editor. Es idempotente.
--
-- POR QUÉ
--
-- Hasta acá el circuito se cortaba a la mitad: el local marcaba el pedido como
-- Listo y ahí quedaba para siempre. Nadie podía moverlo a En camino ni a
-- Entregado, porque el repartidor no tenía forma de agarrar un pedido.
--
-- La migración 05 ya dejó casi todo listo (la columna `repartidor_id`, el
-- permiso para que un repartidor vea la bolsa de trabajo, y las transiciones
-- En camino → Entregado). Faltaba la pieza del medio: **tomar** un pedido.
--
-- TOMAR NO ES SALIR
--
-- Son dos momentos distintos y esta migración los separa a propósito.
--
--   * **Tomar**: el repartidor lo aparta para él y arranca hacia el local. El
--     pedido sigue en Listo. El cliente no ve ningún cambio, porque para él no
--     cambió nada: su comida sigue en el mostrador.
--   * **En camino**: el repartidor ya lo tiene en la mochila y salió. Recién
--     ahí el cliente ve que el pedido se mueve.
--
-- Juntarlos —que tomar sea En camino— tendría dos problemas. Le diríamos al
-- cliente "ya sale" cuando el repartidor recién está arrancando hacia el local,
-- que es mentirle; y mientras tanto el pedido quedaría suelto para que otro
-- repartidor también fuera a buscarlo, que es cómo dos personas terminan en la
-- puerta del mismo local por la misma bolsa.
--
-- UN VIAJE A LA VEZ
--
-- `tomar_pedido` rechaza a un repartidor que ya tenga otro pedido en la mano.
-- No es una limitación técnica: es que dos pedidos a la vez es cómo la comida
-- llega fría. Cuando haya volumen para justificarlo se saca este chequeo y se
-- resuelve en serio, agrupando por cercanía. Hoy sería optimizar un problema
-- que todavía no tenemos.
-- ============================================================================

-- La bolsa de trabajo: lo que está listo y no tomó nadie. Es la consulta que
-- hace la app del repartidor cada vez que refresca, así que va por índice.
create index if not exists pedidos_sin_repartidor_idx
  on public.pedidos (listo_en)
  where repartidor_id is null and estado = 'Listo';

-- ============================================================================
-- TOMAR
--
-- El `for update` no es decorativo: dos repartidores que tocan "Tomar" en el
-- mismo segundo entran los dos, y sin el candado los dos se llevarían el
-- pedido. Con el candado, el segundo espera, ve que ya tiene dueño y recibe un
-- "te lo ganaron" en lugar de un viaje al pedo.
-- ============================================================================

create or replace function public.tomar_pedido(p_pedido_id uuid)
returns public.pedidos
language plpgsql security definer set search_path = public as $$
declare
  v_usuario uuid := auth.uid();
  v_rol     rol_usuario;
  v_pedido  public.pedidos;
  v_encurso integer;
begin
  if v_usuario is null then
    raise exception 'Hay que iniciar sesión' using errcode = 'P0001';
  end if;

  v_rol := public.mi_rol();
  if v_rol not in ('repartidor', 'admin') then
    raise exception 'Sólo un repartidor puede tomar pedidos' using errcode = 'P0001';
  end if;

  select count(*) into v_encurso
    from public.pedidos
   where repartidor_id = v_usuario
     and estado in ('Listo', 'En camino');

  if v_encurso > 0 then
    raise exception 'Ya tenés un pedido en curso. Entregá ese antes de tomar otro.'
      using errcode = 'P0001';
  end if;

  select * into v_pedido from public.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Ese pedido no existe' using errcode = 'P0001';
  end if;

  if v_pedido.estado <> 'Listo' then
    raise exception 'Ese pedido todavía no está listo para retirar' using errcode = 'P0001';
  end if;

  if v_pedido.repartidor_id is not null then
    raise exception 'Otro repartidor lo tomó primero' using errcode = 'P0001';
  end if;

  update public.pedidos
     set repartidor_id = v_usuario
   where id = p_pedido_id
  returning * into v_pedido;

  return v_pedido;
end $$;

revoke all on function public.tomar_pedido(uuid) from public;
grant execute on function public.tomar_pedido(uuid) to authenticated;

-- ============================================================================
-- SOLTAR
--
-- Se toma un pedido equivocado, se pincha una rueda, se corta la moto. Sin esta
-- función el pedido queda clavado con un dueño que no va a ir, y la única
-- salida es que alguien lo arregle a mano en la base.
--
-- Sólo se puede soltar lo que **todavía no se retiró**. Una vez que la comida
-- está en la mochila, soltar el pedido dejaría al cliente esperando algo que ya
-- no está en el local: eso no se resuelve con un botón.
-- ============================================================================

create or replace function public.soltar_pedido(p_pedido_id uuid)
returns public.pedidos
language plpgsql security definer set search_path = public as $$
declare
  v_usuario uuid := auth.uid();
  v_pedido  public.pedidos;
begin
  if v_usuario is null then
    raise exception 'Hay que iniciar sesión' using errcode = 'P0001';
  end if;

  select * into v_pedido from public.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Ese pedido no existe' using errcode = 'P0001';
  end if;

  if v_pedido.repartidor_id <> v_usuario and public.mi_rol() <> 'admin' then
    raise exception 'Ese pedido no es tuyo' using errcode = 'P0001';
  end if;

  if v_pedido.estado <> 'Listo' then
    raise exception 'Ya retiraste este pedido. Avisale a Pedilo si no lo podés entregar.'
      using errcode = 'P0001';
  end if;

  update public.pedidos
     set repartidor_id = null
   where id = p_pedido_id
  returning * into v_pedido;

  return v_pedido;
end $$;

revoke all on function public.soltar_pedido(uuid) from public;
grant execute on function public.soltar_pedido(uuid) to authenticated;

-- ============================================================================
-- cambiar_estado_pedido: para salir, primero hay que haberlo tomado
--
-- Es el mismo texto de la migración 05 con un solo cambio: un repartidor ya no
-- puede marcar En camino un pedido que no tomó. Antes esa era la forma de
-- agarrarlo; ahora agarrarlo es `tomar_pedido`, y dejar las dos puertas
-- abiertas sería dejar que el chequeo de "un viaje a la vez" se esquive
-- salteándose el paso de tomar.
-- ============================================================================

create or replace function public.cambiar_estado_pedido(
  p_pedido_id uuid,
  p_estado    text,
  p_motivo    text default null
) returns public.pedidos
language plpgsql security definer set search_path = public as $$
declare
  v_usuario   uuid := auth.uid();
  v_rol       rol_usuario;
  v_pedido    public.pedidos;
  v_es_dueno  boolean;
  v_nuevo     estado_pedido;
begin
  if v_usuario is null then
    raise exception 'Hay que iniciar sesión' using errcode = 'P0001';
  end if;

  select * into v_pedido from public.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Ese pedido no existe' using errcode = 'P0001';
  end if;

  v_rol := public.mi_rol();
  v_es_dueno := public.es_dueno(v_pedido.comercio_id);
  v_nuevo := p_estado::estado_pedido;

  if v_pedido.estado in ('Entregado', 'Rechazado') then
    raise exception 'El pedido ya está %, no se puede cambiar', v_pedido.estado using errcode = 'P0001';
  end if;

  -- ------------------------------------------------- quién puede qué ------
  if v_nuevo in ('Preparando', 'Listo', 'Rechazado') then
    if not v_es_dueno and v_rol <> 'admin' then
      raise exception 'Sólo el local puede marcar el pedido como %', v_nuevo using errcode = 'P0001';
    end if;

  elsif v_nuevo in ('En camino', 'Entregado') then
    if v_rol not in ('repartidor', 'admin') and not v_es_dueno then
      raise exception 'Sólo el repartidor puede marcar el pedido como %', v_nuevo using errcode = 'P0001';
    end if;

    if v_rol = 'repartidor' then
      if v_pedido.repartidor_id is null then
        raise exception 'Primero tenés que tomar el pedido' using errcode = 'P0001';
      end if;
      if v_pedido.repartidor_id <> v_usuario then
        raise exception 'Ese pedido lo está llevando otro repartidor' using errcode = 'P0001';
      end if;
    end if;

  else
    raise exception 'Estado no válido: %', p_estado using errcode = 'P0001';
  end if;

  -- --------------------------------------------- transiciones permitidas ---
  if not (
       (v_pedido.estado = 'Pendiente'  and v_nuevo in ('Preparando', 'Rechazado'))
    or (v_pedido.estado = 'Preparando' and v_nuevo in ('Listo', 'Rechazado'))
    or (v_pedido.estado = 'Listo'      and v_nuevo = 'En camino')
    or (v_pedido.estado = 'En camino'  and v_nuevo = 'Entregado')
  ) then
    raise exception 'No se puede pasar de % a %', v_pedido.estado, v_nuevo using errcode = 'P0001';
  end if;

  if v_nuevo = 'Rechazado' and coalesce(trim(p_motivo), '') = '' then
    raise exception 'Para rechazar hay que poner un motivo' using errcode = 'P0001';
  end if;

  update public.pedidos set
    estado         = v_nuevo,
    motivo_rechazo = case when v_nuevo = 'Rechazado' then left(trim(p_motivo), 200) else motivo_rechazo end,
    aceptado_en    = case when v_nuevo = 'Preparando' then now() else aceptado_en end,
    listo_en       = case when v_nuevo = 'Listo'      then now() else listo_en end,
    retirado_en    = case when v_nuevo = 'En camino'  then now() else retirado_en end,
    entregado_en   = case when v_nuevo = 'Entregado'  then now() else entregado_en end
  where id = p_pedido_id
  returning * into v_pedido;

  return v_pedido;
end $$;

revoke all on function public.cambiar_estado_pedido(uuid, text, text) from public;
grant execute on function public.cambiar_estado_pedido(uuid, text, text) to authenticated;

-- ============================================================================
-- RLS: el repartidor ve la bolsa de trabajo y lo suyo
--
-- La política de la migración 05 ya lo contemplaba, pero se repite acá para que
-- esta migración se pueda correr sola sobre una base que venga de más atrás.
-- ============================================================================

drop policy if exists pedidos_ver on public.pedidos;
create policy pedidos_ver on public.pedidos for select using (
  cliente_id = auth.uid()
  or public.es_dueno(comercio_id)
  or repartidor_id = auth.uid()
  or (repartidor_id is null and estado = 'Listo' and public.mi_rol() = 'repartidor')
);

-- ============================================================================
-- ALTA DE UN REPARTIDOR
--
-- Igual que con los comercios: no se auto-registran. El equipo crea el usuario
-- en Supabase → Authentication → Add user, y después corre esta función una vez
-- con ese mail:
--
--   select public.vincular_repartidor('juan@pedilo.ar');
--
-- Un formulario público de "quiero ser repartidor" que te deje entrar solo es
-- darle la dirección de cada cliente a quien la pida.
-- ============================================================================

create or replace function public.vincular_repartidor(p_email text)
returns public.perfiles
language plpgsql security definer set search_path = public, auth as $$
declare
  v_usuario uuid;
  v_perfil  public.perfiles;
begin
  select id into v_usuario from auth.users where lower(email) = lower(trim(p_email));
  if v_usuario is null then
    raise exception 'No existe un usuario con el mail %. Crealo primero en Authentication → Add user.', p_email
      using errcode = 'P0001';
  end if;

  insert into public.perfiles (id, rol, email)
  values (v_usuario, 'repartidor', lower(trim(p_email)))
  on conflict (id) do update set rol = 'repartidor'
  returning * into v_perfil;

  return v_perfil;
end $$;

revoke all on function public.vincular_repartidor(text) from public;
