// api/_tramos.js — Locus Mundi
// Versión 2 · 08/10/2026 · Diseño de la moderación v10, §11.13, puntos 4 y 7. Dos funciones
// nuevas, sin tocar nada de lo anterior (los tramos y las huellas son los mismos: las
// traducciones guardadas y las huellas de la moderación siguen valiendo):
//   - tramosConCapitulo(texto): los mismos tramos que dividirEnTramos, con el capítulo (¶) al
//     que pertenece cada uno. El texto anterior al primer ¶ es el capítulo 0 (prólogo); un
//     libro sin ¶ es un solo capítulo. Para el umbral del veredicto de conjunto (§6.1).
//   - fotosColocadas(texto): números (orden) de las fotos con su marca en el texto, con la
//     MISMA regla que la lectura (renderStoryBody de index.html): corchetes, una palabra que
//     empieza por "foto" o "photo" y el número. Solo esas se publican.
// Versión 1 · 06/10/2026 · Nuevo. Diseño de la moderación v6, §11.4 y §11.8 (decisión 2).
// Archivo COMPARTIDO por api/traducir.js (v3) y api/moderar.js (v1): una sola regla para
// dividir el libro en tramos y calcular sus huellas. Sustituye a la duplicación en los dos
// archivos decidida en la v2 del diseño: si las dos copias se desajustaran, la traducción de
// un pasaje retirado podría seguir leyéndose.
// Vercel no convierte en función un archivo de api/ que empieza por guion bajo; aquí solo
// hay piezas que usan las otras dos funciones con require('./_tramos').
// Las funciones de tramos y la huella son las de api/traducir.js v2, sin cambios: las
// traducciones ya guardadas siguen valiendo.

const crypto = require('crypto');

// Tope de cada tramo: lo que llegue antes.
const MAX_CARACTERES = 20000;
const MAX_PARRAFOS = 50;

// ─── División en tramos (misma lectura que renderStoryBody) ─────────────

function esTituloCapitulo(p) { return p.startsWith('¶'); }
function esTituloApartado(p) { return p.startsWith('§'); }
function esMarcaFoto(p) { return /^\[[^\]\n]*?\d+\s*\]$/.test(p); }
function esProsa(p) { return !esTituloCapitulo(p) && !esTituloApartado(p) && !esMarcaFoto(p); }

function parrafosDe(texto) {
  return String(texto || '')
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean);
}

function cabe(parrafos) {
  const caracteres = parrafos.reduce((n, p) => n + p.length, 0) + 2 * Math.max(0, parrafos.length - 1);
  const prosa = parrafos.filter(esProsa).length;
  return caracteres <= MAX_CARACTERES && prosa <= MAX_PARRAFOS;
}

// Agrupa en bloques que empiezan cada vez que "empiezaBloque" es cierto.
function agrupar(parrafos, empiezaBloque) {
  const grupos = [];
  let actual = [];
  for (const p of parrafos) {
    if (empiezaBloque(p) && actual.length) { grupos.push(actual); actual = []; }
    actual.push(p);
  }
  if (actual.length) grupos.push(actual);
  return grupos;
}

// Corta por párrafos, nunca a mitad de uno. Un párrafo que solo ya pasa
// del tope va en un tramo propio.
function trocear(parrafos) {
  const trozos = [];
  let actual = [];
  for (const p of parrafos) {
    if (actual.length && !cabe([...actual, p])) { trozos.push(actual); actual = []; }
    actual.push(p);
  }
  if (actual.length) trozos.push(actual);
  return trozos;
}

function dividirEnTramos(texto) {
  const tramos = [];
  for (const capitulo of agrupar(parrafosDe(texto), esTituloCapitulo)) {
    if (cabe(capitulo)) { tramos.push(capitulo); continue; }
    for (const apartado of agrupar(capitulo, esTituloApartado)) {
      if (cabe(apartado)) tramos.push(apartado);
      else tramos.push(...trocear(apartado));
    }
  }
  return tramos.map(ps => ps.join('\n\n'));
}

// Para validar que la IA ha respetado la estructura.
function estructura(texto) {
  const ps = parrafosDe(texto);
  const fotos = ps.filter(esMarcaFoto).map(p => p.match(/(\d+)\s*\]$/)[1]).sort().join(',');
  return {
    capitulos: ps.filter(esTituloCapitulo).length,
    apartados: ps.filter(esTituloApartado).length,
    fotos
  };
}

function mismaEstructura(original, traducido) {
  const a = estructura(original);
  const b = estructura(traducido);
  return a.capitulos === b.capitulos && a.apartados === b.apartados && a.fotos === b.fotos;
}

function huella(tipo, contenido) {
  return crypto.createHash('sha256').update(tipo + '\n' + contenido, 'utf8').digest('hex');
}

// ─── Cabecera de un libro publicado ─────────────────────────────────────
// "publicacion" es una fila de la tabla publicaciones: { titulo, contenido }, con la
// lista de fotos publicadas en contenido.fotos ([{ id, orden, url, pie_foto }]).

// Pies no vacíos de las fotos con imagen, ordenados por id (como api/traducir.js v2).
function piesDe(fotos) {
  const pies = {};
  (Array.isArray(fotos) ? fotos : [])
    .filter(f => f && f.url && String(f.pie_foto || '').trim())
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .forEach(f => { pies[f.id] = String(f.pie_foto).trim(); });
  return pies;
}

function cabeceraDe(publicacion) {
  const c = (publicacion && publicacion.contenido) || {};
  return {
    titulo: String((publicacion && publicacion.titulo) || c.title || c.name || ''),
    subtitulo: String(c.subtitle || ''),
    pies: piesDe(c.fotos)
  };
}

function huellaCabecera(publicacion) {
  return huella('cabecera', JSON.stringify(cabeceraDe(publicacion)));
}

function huellaTramo(tramo) {
  return huella('tramo', tramo);
}

// Todas las huellas de una versión publicada: la de la cabecera y la de cada tramo.
// Las traducciones guardadas con otra huella pertenecen a un texto que ya no se lee.
function huellasVigentes(publicacion) {
  const c = (publicacion && publicacion.contenido) || {};
  return [huellaCabecera(publicacion), ...dividirEnTramos(c.text).map(huellaTramo)];
}

// ─── v2: capítulo de cada tramo (diseño v10, §11.13, punto 4) ───────────
// Misma división que dividirEnTramos, paso a paso; cada tramo lleva el número de su capítulo
// (0, 1, 2…, en el orden del libro) y el título de ese capítulo sin el signo ¶ ("" si es el
// texto anterior al primer ¶).
function tramosConCapitulo(texto) {
  const tramos = [];
  agrupar(parrafosDe(texto), esTituloCapitulo).forEach((capitulo, n) => {
    const titulo = esTituloCapitulo(capitulo[0]) ? capitulo[0].replace(/^¶\s*/, '').trim() : '';
    const poner = ps => tramos.push({ texto: ps.join('\n\n'), capitulo: n, tituloCapitulo: titulo });
    if (cabe(capitulo)) { poner(capitulo); return; }
    for (const apartado of agrupar(capitulo, esTituloApartado)) {
      if (cabe(apartado)) poner(apartado);
      else trocear(apartado).forEach(poner);
    }
  });
  return tramos;
}

// ─── v2: fotos colocadas (diseño v10, §11.13, punto 7) ──────────────────
// Copia exacta de FOTO_MARK_RE de index.html y de la condición de renderStoryBody.
const FOTO_MARK_RE = /^\[\s*([^\]\d\s][^\]\d]*?)\s*(\d+)\s*\]$/;

function fotosColocadas(texto) {
  const colocadas = new Set();
  for (const raw of String(texto || '').split('\n\n')) {
    const m = raw.trim().match(FOTO_MARK_RE);
    if (m && /^(foto|photo)/i.test(m[1])) colocadas.add(m[2]); // como la lectura: String(orden) === número escrito
  }
  return colocadas;
}

module.exports = {
  tramosConCapitulo,
  fotosColocadas,
  MAX_CARACTERES,
  MAX_PARRAFOS,
  esTituloCapitulo,
  esTituloApartado,
  esMarcaFoto,
  esProsa,
  parrafosDe,
  dividirEnTramos,
  estructura,
  mismaEstructura,
  huella,
  piesDe,
  cabeceraDe,
  huellaCabecera,
  huellaTramo,
  huellasVigentes
};
