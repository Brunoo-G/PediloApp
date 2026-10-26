-- ============================================================================
-- PEDILO — datos de prueba
--
-- Correr DESPUÉS de schema.sql. Carga los 7 locales del prototipo para tener
-- algo que mirar apenas arranca la app.
--
-- Los comercios quedan con dueno_id NULL: son locales de vitrina. Cuando el
-- equipo dé de alta a un comercio real, se le asigna el dueño con:
--   update comercios set dueno_id = '<uuid del usuario>' where id = '<uuid>';
--
-- Es idempotente: se puede volver a correr.
-- ============================================================================

-- Limpieza de los datos de prueba (no toca comercios reales, que sí tienen dueño)
delete from public.comercios where dueno_id is null;

with nuevos as (
  insert into public.comercios
    (nombre, descripcion, categoria, tiempo_entrega, costo_envio, abierto, aprobado, portada_url, logo_url)
  values
    ('Burger Bros', 'Las mejores hamburguesas artesanales de la ciudad.', 'Restaurante', '25-35 min', 800, true, true,
     'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=70',
     'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=200&q=70'),

    ('Pizza Nonna', 'Pizza al horno de piedra, receta italiana tradicional.', 'Restaurante', '30-40 min', 700, true, true,
     'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=70',
     'https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?auto=format&fit=crop&w=200&q=70'),

    ('Rotisería El Fogón', 'Comida casera lista para llevar.', 'Rotisería', '25-35 min', 700, false, true,
     'https://images.unsplash.com/photo-1598103442097-8b74394b95c6?auto=format&fit=crop&w=800&q=70', null),

    ('Mercado Sur', 'Almacén de barrio con despacho a domicilio.', 'Supermercado', '20-30 min', 600, true, true,
     'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=800&q=70', null),

    ('Farmacia Vital', 'Medicamentos y perfumería, entrega rápida.', 'Farmacia', '15-25 min', 600, true, true,
     'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=800&q=70', null),

    ('Heladería La Copa', 'Helado artesanal, recién hecho todos los días.', 'Heladería', '15-20 min', 500, true, true,
     'https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?auto=format&fit=crop&w=800&q=70', null),

    ('Pañalera Bebé Feliz', 'Todo para tu bebé: pañales, toallitas y más.', 'Pañalera', '20-30 min', 700, true, true,
     'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?auto=format&fit=crop&w=800&q=70', null)
  returning id, nombre
)
insert into public.productos (comercio_id, nombre, descripcion, precio, subcategoria, subcategoria_icono, orden)
select n.id, p.nombre, p.descripcion, p.precio, p.subcategoria, p.icono, p.orden
from nuevos n
join (values
  ('Burger Bros', 'Hamburguesa Clásica',      'Carne, cheddar, lechuga, tomate',   3200, 'Hamburguesas',    '🍔', 1),
  ('Burger Bros', 'Hamburguesa Doble Bacon',  'Doble carne, panceta, cheddar',     4300, 'Hamburguesas',    '🍔', 2),
  ('Burger Bros', 'Papas Fritas',             'Porción grande con cheddar',        1800, 'Acompañamientos', '🍟', 3),
  ('Burger Bros', 'Batido de Chocolate',      'Batido cremoso 500ml',              2100, 'Bebidas',         '🥤', 4),

  ('Pizza Nonna', 'Muzzarella',               'Salsa, muzzarella, aceitunas',      3800, 'Pizzas',          '🍕', 1),
  ('Pizza Nonna', 'Napolitana',               'Muzzarella, tomate, ajo, jamón',    4200, 'Pizzas',          '🍕', 2),
  ('Pizza Nonna', 'Fugazzeta',                'Cebolla caramelizada, muzzarella',  4000, 'Pizzas',          '🍕', 3),

  ('Rotisería El Fogón', 'Pollo al Spiedo',   'Entero, con papas españolas',       5200, 'Pollos',          '🍗', 1),
  ('Rotisería El Fogón', 'Empanadas x6',      'Carne, jamón y queso, o pollo',     3600, 'Empanadas',       '🥟', 2),

  ('Mercado Sur', 'Leche 1L',                 'Leche entera',                       900, 'Lácteos',         '🧀', 1),
  ('Mercado Sur', 'Pan Lactal',               'Paquete 500g',                      1200, 'Panadería',       '🍞', 2),
  ('Mercado Sur', 'Docena de Huevos',         'Huevos frescos',                    2400, 'Almacén',         '🏷️', 3),

  ('Farmacia Vital', 'Ibuprofeno 400mg',      'Caja x10 comprimidos',              1500, 'Medicamentos',    '💊', 1),
  ('Farmacia Vital', 'Alcohol en Gel 250ml',  'Antiséptico para manos',            1100, 'Higiene',         '🧴', 2),

  ('Heladería La Copa', '1/4 kg dos gustos',  'A elección, con crema opcional',    2200, 'Helado por kilo', '🍦', 1),
  ('Heladería La Copa', 'Cucurucho simple',   'Un gusto a elección',                900, 'Cucuruchos',      '🍦', 2),

  ('Pañalera Bebé Feliz', 'Pañales talle M x30',   'Paquete económico',            4800, 'Pañales',         '🍼', 1),
  ('Pañalera Bebé Feliz', 'Toallitas húmedas x80', 'Sin alcohol, piel sensible',   1600, 'Higiene',         '🧴', 2)
) as p(local, nombre, descripcion, precio, subcategoria, icono, orden)
  on p.local = n.nombre;

-- Fotos de productos (una por ahora; el modelo soporta hasta 3)
insert into public.producto_fotos (producto_id, url, orden)
select pr.id, u.url, 0
from public.productos pr
join public.comercios c on c.id = pr.comercio_id and c.dueno_id is null
join (values
  ('Hamburguesa Clásica',     'photo-1550547660-d9450f859349'),
  ('Hamburguesa Doble Bacon', 'photo-1553979459-d2229ba7433a'),
  ('Papas Fritas',            'photo-1573080496219-bb080dd4f877'),
  ('Batido de Chocolate',     'photo-1572490122747-3968b75cc699'),
  ('Muzzarella',              'photo-1574071318508-1cdbab80d002'),
  ('Napolitana',              'photo-1565299624946-b28f40a0ae38'),
  ('Fugazzeta',               'photo-1595854341625-f33ee10dbf94'),
  ('Pollo al Spiedo',         'photo-1598103442097-8b74394b95c6'),
  ('Empanadas x6',            'photo-1601050690597-df0568f70950'),
  ('Leche 1L',                'photo-1550583724-b2692b85b150'),
  ('Pan Lactal',              'photo-1509440159596-0249088772ff'),
  ('Docena de Huevos',        'photo-1518569656558-1f25e69d93d7'),
  ('Ibuprofeno 400mg',        'photo-1584308666744-24d5c474f2ae'),
  ('Alcohol en Gel 250ml',    'photo-1584744982491-665216d95f8b'),
  ('1/4 kg dos gustos',       'photo-1567206563064-6f60f40a2b57'),
  ('Cucurucho simple',        'photo-1560008581-09826d1de69e')
) as f(nombre, foto) on f.nombre = pr.nombre
cross join lateral (select 'https://images.unsplash.com/' || f.foto || '?auto=format&fit=crop&w=400&q=70' as url) as u(url);

-- HORARIOS: NO SE SIEMBRAN. A PROPÓSITO.
--
-- Acá había un insert que le ponía "9 a 23" a los siete días de todos los
-- locales. Parecía inofensivo y no lo era: `estadoApertura` cruza el
-- interruptor de abierto/cerrado CON el horario, así que un local con estas
-- filas aparecía cerrado fuera de ese rango por más que el dueño prendiera el
-- interruptor, y no había forma de enterarse desde el panel. Cuando uno de los
-- locales sembrados pasó a ser real, se llevó puesto el horario de la semilla.
--
-- Un local sin horarios funciona bien: manda sólo el interruptor. El horario lo
-- carga cada comercio desde Mi local → Horarios de atención, que es donde tiene
-- que estar. Los datos de ejemplo pueblan lo que sirve para mirar la app; no
-- reglas que después alguien tiene que descubrir y desarmar.
--
-- (Si hacés una demo y querés un local cerrado, usá `comercios.abierto = false`,
-- que es explícito y se ve en el panel.)

-- Cupones. El home muestra los que están activos acá, así que no puede
-- prometer una promo que el checkout no aplique.
insert into public.cupones (codigo, descripcion, porcentaje, envio_gratis, activo) values
  ('BIENVENIDO',  '20% OFF en tu primer pedido', 20,   false, true),
  ('ENVIOGRATIS', 'Envío gratis en este pedido', null, true,  true)
on conflict (codigo) do update
  set descripcion  = excluded.descripcion,
      porcentaje   = excluded.porcentaje,
      envio_gratis = excluded.envio_gratis,
      activo       = excluded.activo;

-- Coordenadas de prueba, repartidas alrededor del Obelisco para poder probar
-- el radio de envío. Pisar con las reales cuando cargues locales de verdad.
update public.comercios
set lat = -34.6037 + (random() - 0.5) * 0.09,
    lng = -58.3816 + (random() - 0.5) * 0.09
where dueno_id is null;
