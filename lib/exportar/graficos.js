// Gráficos nativos de Excel, anclados a las tablas del libro. ExcelJS no los
// escribe: se agregan al archivo cuando el libro ya está armado.

import JSZip from "jszip";

const ALTO = 15;
const ANCHO = 8;

const xml = (valor) =>
  String(valor)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function colLetra(n) {
  let s = "";
  let resto = n;
  while (resto > 0) {
    const m = (resto - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    resto = Math.floor((resto - 1) / 26);
  }
  return s;
}

function hojaDe(nombre) {
  return `'${String(nombre).replaceAll("'", "''")}'`;
}

export function rango(hoja, col, desde, hasta) {
  const c = colLetra(col);
  return `${hojaDe(hoja)}!$${c}$${desde}:$${c}$${hasta}`;
}

// Anota un gráfico. `encabezado` es la fila del título de la tabla (1-based) y
// `filas` cuántos datos tiene. Devuelve cuántas filas ocupa el dibujo, para no
// escribir encima.
export function grafico(libro, spec) {
  const valores = spec.categorias?.valores ?? [];
  const series = (spec.series ?? []).filter((s) => s.valores.some((v) => typeof v === "number"));
  if (valores.length === 0 || series.length === 0) return 0;
  const alto = spec.alto ?? ALTO;
  const ancho = spec.ancho ?? ANCHO;
  (libro.graficos ??= []).push({
    ...spec,
    series,
    alto,
    ancho,
    ancla: {
      col: spec.anclaCol ?? 0,
      fila: spec.desdeFila - 1,
      colFin: (spec.anclaCol ?? 0) + ancho,
      filaFin: spec.desdeFila - 1 + alto,
    },
  });
  return alto;
}

function cacheTexto(valores) {
  const puntos = valores
    .map((v, i) => `<c:pt idx="${i}"><c:v>${xml(v ?? "")}</c:v></c:pt>`)
    .join("");
  return `<c:strCache><c:ptCount val="${valores.length}"/>${puntos}</c:strCache>`;
}

function cacheNumero(valores) {
  const puntos = valores
    .map((v, i) => (typeof v === "number" ? `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>` : ""))
    .join("");
  return `<c:numCache><c:formatCode>#,##0.0</c:formatCode><c:ptCount val="${valores.length}"/>${puntos}</c:numCache>`;
}

function serie(s, i, categorias) {
  const color = s.color ? `<c:spPr>${s.marca ? trazo(s.color, s.punteada) : relleno(s.color)}</c:spPr>` : "";
  const marca = s.marca ? marcador(s.color) : "";
  const puntos = (s.colores ?? [])
    .map(
      (c, n) =>
        `<c:dPt><c:idx val="${n}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${c}"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="${c}"/></a:solidFill></a:ln></c:spPr></c:dPt>`
    )
    .join("");
  return `<c:ser>
    <c:idx val="${i}"/>
    <c:order val="${i}"/>
    <c:tx><c:v>${xml(s.nombre)}</c:v></c:tx>
    ${puntos}
    ${color}
    ${marca}
    <c:cat><c:strRef><c:f>${xml(categorias.ref)}</c:f>${cacheTexto(categorias.valores)}</c:strRef></c:cat>
    <c:val><c:numRef><c:f>${xml(s.ref)}</c:f>${cacheNumero(s.valores)}</c:numRef></c:val>
    ${s.marca ? `<c:smooth val="0"/>` : ""}
  </c:ser>`;
}

function trazo(color, punteada) {
  return `<a:ln w="25000"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill>${punteada ? `<a:prstDash val="dash"/>` : ""}</a:ln>`;
}

function relleno(color) {
  return `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:ln>`;
}

function marcador(color) {
  const tinta = color ?? "10314B";
  return `<c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr><a:solidFill><a:srgbClr val="${tinta}"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="${tinta}"/></a:solidFill></a:ln></c:spPr></c:marker>`;
}

function ejes(catId, valId, horizontal) {
  const catPos = horizontal ? "l" : "b";
  const valPos = horizontal ? "b" : "l";
  return `<c:catAx>
    <c:axId val="${catId}"/>
    <c:scaling><c:orientation val="minMax"/></c:scaling>
    <c:delete val="0"/>
    <c:axPos val="${catPos}"/>
    <c:majorTickMark val="out"/>
    <c:minorTickMark val="none"/>
    <c:tickLblPos val="nextTo"/>
    <c:crossAx val="${valId}"/>
    <c:crosses val="autoZero"/>
    <c:auto val="1"/>
    <c:lblAlgn val="ctr"/>
    <c:lblOffset val="100"/>
    <c:noMultiLvlLbl val="0"/>
  </c:catAx>
  <c:valAx>
    <c:axId val="${valId}"/>
    <c:scaling><c:orientation val="minMax"/></c:scaling>
    <c:delete val="0"/>
    <c:axPos val="${valPos}"/>
    <c:majorGridlines/>
    <c:numFmt formatCode="#,##0" sourceLinked="0"/>
    <c:majorTickMark val="out"/>
    <c:minorTickMark val="none"/>
    <c:tickLblPos val="nextTo"/>
    <c:crossAx val="${catId}"/>
    <c:crosses val="autoZero"/>
    <c:crossBetween val="between"/>
  </c:valAx>`;
}

function plot(g, n) {
  const catId = 1000 + n;
  const valId = 2000 + n;
  const series = g.series.map((s, i) => serie(s, i, g.categorias)).join("");
  if (g.tipo === "torta") {
    return `<c:doughnutChart><c:varyColors val="1"/>${series}<c:holeSize val="60"/></c:doughnutChart>`;
  }
  if (g.tipo === "linea") {
    return `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${series}<c:marker val="1"/><c:smooth val="0"/><c:axId val="${catId}"/><c:axId val="${valId}"/></c:lineChart>${ejes(catId, valId, false)}`;
  }
  const apiladas = g.tipo === "barras";
  const dir = apiladas ? "bar" : "col";
  const grouping = apiladas ? "stacked" : "clustered";
  const overlap = apiladas ? 100 : 0;
  return `<c:barChart><c:barDir val="${dir}"/><c:grouping val="${grouping}"/><c:varyColors val="0"/>${series}<c:overlap val="${overlap}"/><c:gapWidth val="80"/><c:axId val="${catId}"/><c:axId val="${valId}"/></c:barChart>${ejes(catId, valId, apiladas)}`;
}

function chartXml(g, n) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:date1904 val="0"/>
  <c:lang val="es-AR"/>
  <c:roundedCorners val="0"/>
  <c:chart>
    <c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1400" b="1"/></a:pPr><a:r><a:rPr lang="es-AR" sz="1400" b="1"/><a:t>${xml(g.titulo)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>
    <c:autoTitleDeleted val="0"/>
    <c:plotArea><c:layout/>${plot(g, n)}</c:plotArea>
    <c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>
    <c:plotVisOnly val="1"/>
    <c:dispBlanksAs val="gap"/>
  </c:chart>
</c:chartSpace>`;
}

function anclaXml(g, rid, id) {
  const a = g.ancla;
  return `<xdr:twoCellAnchor>
    <xdr:from><xdr:col>${a.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.fila}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
    <xdr:to><xdr:col>${a.colFin}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.filaFin}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
    <xdr:graphicFrame macro="">
      <xdr:nvGraphicFramePr>
        <xdr:cNvPr id="${id}" name="${xml(g.titulo)}"/>
        <xdr:cNvGraphicFramePr><a:graphicFrameLocks/></xdr:cNvGraphicFramePr>
      </xdr:nvGraphicFramePr>
      <xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
      <a:graphic>
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
          <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${rid}"/>
        </a:graphicData>
      </a:graphic>
    </xdr:graphicFrame>
    <xdr:clientData/>
  </xdr:twoCellAnchor>`;
}

function drawingXml(grupo) {
  const anclas = grupo.map((g, i) => anclaXml(g.grafico, `rId${i + 1}`, i + 2)).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart">${anclas}</xdr:wsDr>`;
}

function relsXml(items) {
  const filas = items
    .map(
      (item, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${item.tipo}" Target="${item.target}"/>`
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${filas}</Relationships>`;
}

export async function insertarGraficos(buffer, graficos) {
  if (!graficos.length) return buffer;
  const zip = await JSZip.loadAsync(buffer);
  const workbook = await zip.file("xl/workbook.xml").async("string");
  const rels = await zip.file("xl/_rels/workbook.xml.rels").async("string");
  const hojas = new Map();
  for (const m of workbook.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const target = rels.match(new RegExp(`Id="${m[2]}"[^>]*Target="([^"]+)"`));
    if (target) hojas.set(m[1], `xl/${target[1]}`);
  }

  const porHoja = new Map();
  graficos.forEach((g, i) => {
    const lista = porHoja.get(g.hoja) ?? [];
    lista.push({ grafico: g, indice: i + 1 });
    porHoja.set(g.hoja, lista);
  });

  const overrides = [];
  let drawingN = 0;
  for (const [nombre, grupo] of porHoja) {
    const ruta = hojas.get(nombre);
    if (!ruta) continue;
    drawingN += 1;
    const drawing = `xl/drawings/drawing${drawingN}.xml`;
    grupo.forEach(({ grafico: g, indice }) => {
      const chart = `xl/charts/chart${indice}.xml`;
      zip.file(chart, chartXml(g, indice));
      overrides.push(
        `<Override PartName="/${chart}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`
      );
    });
    zip.file(drawing, drawingXml(grupo));
    zip.file(
      `xl/drawings/_rels/drawing${drawingN}.xml.rels`,
      relsXml(grupo.map(({ indice }) => ({ tipo: "chart", target: `../charts/chart${indice}.xml` })))
    );
    overrides.push(
      `<Override PartName="/${drawing}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`
    );
    const hojaXml = await zip.file(ruta).async("string");
    zip.file(ruta, hojaXml.replace("</worksheet>", '<drawing r:id="rId1"/></worksheet>'));
    const relHoja = ruta.replace("worksheets/", "worksheets/_rels/") + ".rels";
    zip.file(relHoja, relsXml([{ tipo: "drawing", target: `../drawings/drawing${drawingN}.xml` }]));
  }

  const tipos = await zip.file("[Content_Types].xml").async("string");
  zip.file("[Content_Types].xml", tipos.replace("</Types>", `${overrides.join("")}</Types>`));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
