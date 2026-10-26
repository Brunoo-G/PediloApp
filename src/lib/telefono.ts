/**
 * El celular del cliente.
 *
 * Es obligatorio para todos, entre con Google o con mail: es lo único que
 * tiene Pedilo para ubicar a alguien si un pedido se traba (el repartidor no
 * encuentra la dirección, el local se quedó sin algo). No se le muestra a
 * nadie: el local y el repartidor hablan por el chat del pedido.
 *
 * Se acepta como lo escribe la gente en Argentina —"11 2345-6789",
 * "+54 9 11 2345 6789", "(0351) 15 123-4567"— y se guarda sólo con los
 * números, sin el 0 ni el 15 de adelante, para que el mismo celular no quede
 * escrito de tres formas distintas.
 */

export type ResultadoCelular = { ok: true; valor: string } | { ok: false; mensaje: string };

export function leerCelular(texto: string): ResultadoCelular {
  let d = (texto ?? "").replace(/\D/g, "");
  if (!d) return { ok: false, mensaje: "Escribí tu celular." };

  // +54 9 ... → se saca el país y el 9 de los celulares.
  if (d.startsWith("549")) d = d.slice(3);
  else if (d.startsWith("54") && d.length >= 12) d = d.slice(2);
  // 0 de larga distancia.
  if (d.startsWith("0")) d = d.slice(1);
  // El "15" después del código de área: 351 15 1234567 → 351 1234567.
  const conQuince = /^(\d{2,4})15(\d{6,8})$/.exec(d);
  if (conQuince && conQuince[1].length + conQuince[2].length === 10) d = conQuince[1] + conQuince[2];

  if (d.length !== 10) {
    return {
      ok: false,
      mensaje: "Escribilo con el código de área, sin el 0 ni el 15. Por ejemplo: 11 2345 6789.",
    };
  }
  return { ok: true, valor: d };
}

export function celularValido(texto: string | null | undefined) {
  return !!texto && leerCelular(texto).ok;
}

/** "1123456789" → "11 2345-6789", para mostrarlo. */
export function mostrarCelular(valor: string) {
  const d = (valor ?? "").replace(/\D/g, "");
  if (d.length !== 10) return valor;
  // Buenos Aires tiene código de 2 dígitos; para el resto se agrupa de a 3,
  // que es una lectura cómoda aunque el código real sea de 3 o 4.
  const area = d.startsWith("11") ? 2 : 3;
  return `${d.slice(0, area)} ${d.slice(area, d.length - 4)}-${d.slice(-4)}`;
}
