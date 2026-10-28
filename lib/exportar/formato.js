// Hojas de cálculo con la misma lectura que la pantalla: título, secciones y
// tablas, en los colores del backoffice. Lo usan los dos exportadores.

import ExcelJS from "exceljs";
import { insertarGraficos } from "./graficos.js";

const TINTA = "FF10314B";
const AGUA = "FF0FA3B1";
const ESPUMA = "FFF3F7F8";
const BLANCO = "FFFFFFFF";
const GRIS = "FF5C7384";

const borde = {
  top: { style: "thin", color: { argb: "FFE1E8ED" } },
  bottom: { style: "thin", color: { argb: "FFE1E8ED" } },
  left: { style: "thin", color: { argb: "FFE1E8ED" } },
  right: { style: "thin", color: { argb: "FFE1E8ED" } },
};

export function libroNuevo() {
  const libro = new ExcelJS.Workbook();
  libro.creator = "LavApp";
  libro.created = new Date();
  return libro;
}

export function hoja(libro, nombre) {
  const ws = libro.addWorksheet(nombre.slice(0, 31), {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  ws.properties.defaultRowHeight = 18;
  return ws;
}

export function anchos(ws, lista) {
  lista.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
}

function pintar(celda, { texto, tamano = 11, negrita = false, color = TINTA, fondo = null, alineado = "left" }) {
  celda.value = texto ?? "";
  celda.font = { name: "Calibri", size: tamano, bold: negrita, color: { argb: color } };
  celda.alignment = { vertical: "middle", horizontal: alineado, wrapText: true };
  if (fondo) celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fondo } };
}

// Título de la hoja. Devuelve la fila siguiente.
export function titulo(ws, fila, texto, columnas, bajada = null) {
  ws.mergeCells(fila, 1, fila, columnas);
  const celda = ws.getCell(fila, 1);
  pintar(celda, { texto, tamano: 20, negrita: true });
  ws.getRow(fila).height = 30;
  if (!bajada) return fila + 2;
  ws.mergeCells(fila + 1, 1, fila + 1, columnas);
  pintar(ws.getCell(fila + 1, 1), { texto: bajada, tamano: 11, color: GRIS });
  return fila + 3;
}

export function seccion(ws, fila, texto, columnas) {
  ws.mergeCells(fila, 1, fila, columnas);
  const celda = ws.getCell(fila, 1);
  pintar(celda, { texto, tamano: 12, negrita: true, color: BLANCO, fondo: TINTA });
  ws.getRow(fila).height = 22;
  return fila + 1;
}

// Pares etiqueta / valor, de a dos por fila, como las tarjetas de la pantalla.
export function tarjetas(ws, fila, items, columnas) {
  const porFila = 2;
  let f = fila;
  for (let i = 0; i < items.length; i += porFila) {
    const grupo = items.slice(i, i + porFila);
    grupo.forEach((item, k) => {
      const col = k * 2 + 1;
      const etiqueta = ws.getCell(f, col);
      const valor = ws.getCell(f, col + 1);
      pintar(etiqueta, { texto: item.etiqueta, tamano: 10, color: GRIS, fondo: ESPUMA });
      pintar(valor, { texto: item.valor ?? "–", tamano: 14, negrita: true, fondo: ESPUMA });
      etiqueta.border = borde;
      valor.border = borde;
      if (columnas > col + 1 && k === grupo.length - 1 && grupo.length < porFila) {
        ws.mergeCells(f, col + 1, f, columnas);
      }
    });
    ws.getRow(f).height = 24;
    f += 1;
  }
  return f + 1;
}

// Tabla con encabezado en agua y filas alternadas. `filas` es una lista de
// listas, en el mismo orden que `columnas`.
export function tabla(ws, fila, columnas, filas) {
  columnas.forEach((nombre, i) => {
    const celda = ws.getCell(fila, i + 1);
    pintar(celda, { texto: nombre, tamano: 10, negrita: true, color: BLANCO, fondo: AGUA });
    celda.border = borde;
  });
  ws.getRow(fila).height = 20;
  filas.forEach((valores, n) => {
    const fondo = n % 2 === 0 ? BLANCO : ESPUMA;
    valores.forEach((valor, i) => {
      const celda = ws.getCell(fila + 1 + n, i + 1);
      const numero = typeof valor === "number";
      const vacio = valor === null || valor === undefined || valor === "";
      pintar(celda, { texto: vacio ? null : valor, fondo, alineado: numero ? "right" : "left" });
      if (numero) celda.numFmt = Number.isInteger(valor) ? "#,##0" : "#,##0.0";
      celda.border = borde;
    });
  });
  return fila + filas.length + 2;
}

export function texto(ws, fila, contenido, columnas) {
  ws.mergeCells(fila, 1, fila, columnas);
  pintar(ws.getCell(fila, 1), { texto: contenido, color: GRIS });
  return fila + 2;
}

export async function aBuffer(libro) {
  const crudo = await libro.xlsx.writeBuffer();
  const buffer = Buffer.from(crudo);
  return insertarGraficos(buffer, libro.graficos ?? []);
}

export const textoDe = (valor) => (valor === null || valor === undefined || valor === "" ? "–" : valor);
