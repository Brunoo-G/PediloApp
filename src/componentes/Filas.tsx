/**
 * Las piezas del perfil que se repiten en los tres paneles.
 *
 *  - `Fila`: ícono en círculo, qué es, qué dice hoy, y la flecha.
 *  - `Hoja`: el panel que sube desde abajo para editar algo en un momento.
 *  - `CamposCobro`: CBU/CVU/alias + titular + CUIT, con la lectura en vivo de
 *    qué se pegó. Lo usan el local y el repartidor; la validación de verdad
 *    está en `lib/cobro.ts`.
 *  - `Preguntas`: la lista de preguntas frecuentes de la hoja de Ayuda.
 */
import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { leerCuenta, nombreTipo } from "../lib/cobro";
import { color, espacio, radio, texto } from "../theme/tokens";
import { Tocable, Txt } from "./base";
import { IconoChevron } from "./Iconos";

export function Fila({
  icono,
  titulo,
  sub,
  onPress,
  alerta,
}: {
  icono: ReactNode;
  titulo: string;
  sub: string;
  onPress: () => void;
  /** Algo que falta completar: el subtítulo va en ámbar. */
  alerta?: boolean;
}) {
  return (
    <Tocable onPress={onPress} etiqueta={titulo} suave>
      <View style={e.fila}>
        <View style={[e.iconoFila, alerta && { backgroundColor: color.warnWash }]}>{icono}</View>
        <View style={{ flex: 1 }}>
          <Txt v="label">{titulo}</Txt>
          <Txt v="cap" numberOfLines={2} style={alerta ? { color: color.warn } : undefined}>
            {sub}
          </Txt>
        </View>
        <IconoChevron size={17} color={color.n400} />
      </View>
    </Tocable>
  );
}

export function Hoja({
  visible,
  onCerrar,
  titulo,
  children,
}: {
  visible: boolean;
  onCerrar: () => void;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <Pressable style={e.fondo} onPress={onCerrar}>
        <Pressable style={e.hoja} onPress={() => {}}>
          <View style={e.asa} />
          <Txt v="title" style={{ fontSize: 20, marginBottom: 4 }}>
            {titulo}
          </Txt>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function CamposCobro({
  cuenta,
  titular,
  cuit,
  onCuenta,
  onTitular,
  onCuit,
  placeholderCuenta = "0000003100… o mi.alias.pedilo",
  placeholderTitular = "Nombre y apellido",
}: {
  cuenta: string;
  titular: string;
  cuit: string;
  onCuenta: (t: string) => void;
  onTitular: (t: string) => void;
  onCuit: (t: string) => void;
  placeholderCuenta?: string;
  placeholderTitular?: string;
}) {
  const leida = cuenta.trim().length >= 6 ? leerCuenta(cuenta) : null;
  return (
    <View>
      <Txt v="cap" style={{ marginBottom: 6 }}>
        CBU, CVU o alias
      </Txt>
      <TextInput
        value={cuenta}
        onChangeText={onCuenta}
        placeholder={placeholderCuenta}
        placeholderTextColor={color.n400}
        autoCapitalize="none"
        autoCorrect={false}
        style={e.input}
        accessibilityLabel="CBU, CVU o alias"
      />
      {/* Se dice qué se entendió mientras se escribe: si pegó un CBU y la app
          lee "alias", algo se copió mal y conviene verlo antes de guardar. */}
      {leida && (
        <Txt v="cap" style={{ marginTop: 6, color: leida.ok ? color.brandInk : color.n400 }}>
          {leida.ok ? `✓ Es un ${nombreTipo(leida.tipo)}` : leida.mensaje}
        </Txt>
      )}

      <Txt v="cap" style={{ marginTop: espacio.md, marginBottom: 6 }}>
        Titular de la cuenta
      </Txt>
      <TextInput
        value={titular}
        onChangeText={onTitular}
        placeholder={placeholderTitular}
        placeholderTextColor={color.n400}
        style={e.input}
        accessibilityLabel="Titular de la cuenta"
      />

      <Txt v="cap" style={{ marginTop: espacio.md, marginBottom: 6 }}>
        CUIT o CUIL (opcional)
      </Txt>
      <TextInput
        value={cuit}
        onChangeText={(t) => onCuit(t.replace(/[^0-9-]/g, "").slice(0, 13))}
        placeholder="20-12345678-9"
        placeholderTextColor={color.n400}
        inputMode="numeric"
        style={e.input}
        accessibilityLabel="CUIT"
      />
    </View>
  );
}

export function Preguntas({ items }: { items: [string, string][] }) {
  return (
    <>
      {items.map(([pregunta, respuesta]) => (
        <View key={pregunta} style={{ marginBottom: espacio.md }}>
          <Txt v="label">{pregunta}</Txt>
          <Txt v="cap" style={{ marginTop: 2 }}>
            {respuesta}
          </Txt>
        </View>
      ))}
    </>
  );
}

const e = StyleSheet.create({
  fila: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacio.md,
    paddingVertical: espacio.md,
    borderBottomWidth: 1,
    borderBottomColor: color.n200,
  },
  iconoFila: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: color.n100,
    alignItems: "center",
    justifyContent: "center",
  },
  fondo: { flex: 1, backgroundColor: "rgba(14,14,14,.42)", justifyContent: "flex-end" },
  hoja: {
    backgroundColor: color.white,
    borderTopLeftRadius: radio.xl,
    borderTopRightRadius: radio.xl,
    padding: espacio.lg,
    paddingBottom: espacio.xxxl,
    maxHeight: "88%",
  },
  asa: { width: 38, height: 4, borderRadius: 2, backgroundColor: color.n200, alignSelf: "center", marginBottom: espacio.lg },
  input: {
    ...texto.body,
    borderWidth: 1.5,
    borderColor: color.n200,
    borderRadius: radio.sm,
    paddingHorizontal: espacio.md,
    paddingVertical: espacio.md,
    backgroundColor: color.white,
  },
});
