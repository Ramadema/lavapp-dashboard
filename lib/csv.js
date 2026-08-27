// Parser CSV minimo, suficiente para lo que publica Google Sheets (RFC 4180):
// campos entre comillas, comas y saltos de linea dentro de las comillas, y
// comillas escapadas duplicandolas. Se hace a mano para no sumar dependencias.
//
// No filtra filas vacias a proposito: el indice de cada fila tiene que seguir
// correspondiendo al numero de linea del archivo, porque /api/salud reporta ese
// numero para que se pueda ir a corregir la celda exacta en la planilla. Saltear
// las filas en blanco es responsabilidad de lib/normalizar.js.
export function parsearCsv(texto) {
  const s = texto.replace(/^\uFEFF/, ""); // Sheets publica con BOM
  const filas = [];
  let fila = [];
  let campo = "";
  let enComillas = false;

  const cerrarFila = () => {
    fila.push(campo);
    campo = "";
    filas.push(fila);
    fila = [];
  };

  for (let i = 0; i < s.length; i++) {
    const c = s[i];

    if (enComillas) {
      if (c !== '"') {
        campo += c;
      } else if (s[i + 1] === '"') {
        campo += '"';
        i++;
      } else {
        enComillas = false;
      }
      continue;
    }

    if (c === '"') enComillas = true;
    else if (c === ",") { fila.push(campo); campo = ""; }
    else if (c === "\n") cerrarFila();
    else if (c === "\r") { if (s[i + 1] === "\n") i++; cerrarFila(); }
    else campo += c;
  }

  // Una comilla sin cerrar se traga todo el resto del archivo dentro de un solo
  // campo. Devolver eso seria servir un subconjunto de los datos como si fuera
  // completo: preferimos cortar para que el loader caiga al respaldo con motivo.
  if (enComillas) {
    throw new Error("hay una comilla sin cerrar: el CSV esta mal formado");
  }

  if (campo !== "" || fila.length > 0) cerrarFila();

  return filas;
}
