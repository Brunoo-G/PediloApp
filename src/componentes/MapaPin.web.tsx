/**
 * Mapa para elegir la ubicación — versión web.
 *
 * Mismo HTML que la versión nativa, pero dentro de un <iframe> en vez de un
 * WebView. Metro resuelve este archivo automáticamente al compilar para web.
 */
import { createElement, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { color, radio, texto } from "../theme/tokens";
import { Text } from "react-native";
import { mapaHtml } from "./mapaHtml";
import type { MapaPinProps } from "./MapaPin";

export function MapaPin({ centro, onMover, onFallo, altura = 260 }: MapaPinProps) {
  const html = useMemo(() => mapaHtml({ lat: centro.lat, lng: centro.lng }), [centro.lat, centro.lng]);

  // El export de web es estático (se pre-renderiza en el build). Un <iframe> no
  // existe en ese render y React se queja de que el HTML del servidor no
  // coincide con el del cliente. Montarlo recién en el navegador lo evita.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  useEffect(() => {
    function alRecibir(ev: MessageEvent) {
      // El iframe es del mismo documento y manda un JSON con forma conocida.
      // Cualquier otra cosa se ignora en silencio: en una pestaña hay muchos
      // mensajes dando vueltas (extensiones, otros iframes) y ninguno es nuestro.
      try {
        const msg = typeof ev.data === "string" ? JSON.parse(ev.data) : null;
        if (msg?.tipo === "pin" && typeof msg.lat === "number" && typeof msg.lng === "number") {
          onMover({ lat: msg.lat, lng: msg.lng });
        } else if (msg?.tipo === "error") {
          onFallo?.();
        }
      } catch {
        /* no era para nosotros */
      }
    }
    window.addEventListener("message", alRecibir);
    return () => window.removeEventListener("message", alRecibir);
  }, [onMover, onFallo]);

  return (
    <View style={{ height: altura, borderRadius: radio.md, overflow: "hidden", backgroundColor: color.n100 }}>
      {montado ? (
        createElement("iframe", {
          srcDoc: html,
          style: { width: "100%", height: "100%", border: "none" },
          title: "Mapa para elegir tu ubicación",
        })
      ) : (
        <Text style={[texto.cap, { textAlign: "center", marginTop: 24 }]}>Cargando el mapa…</Text>
      )}
    </View>
  );
}
