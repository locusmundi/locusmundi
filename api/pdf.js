// api/pdf.js — Locus Mundi
// Versión 1 · 19/10/2026 · Fase B2, punto 14 (conversación 12). Sustituye a api/pdf-prueba.js.
// Versión 1.1 · 19/10/2026 · "comprar" devuelve también publicado y disponible (sin ellos, la web
// creía que el idioma no tenía PDF y mostraba «Disponible próximamente» tras pagar).
// Versión 1.2 · 19/10/2026 · Ajustes tras el TEST (conversación 12-2; formato v2.1, partes A a D):
//   A. Preliminares: dedicatoria (preliminares cortos) en página propia, centrada y sin número
//      (A5: impar, la 5; A4: la 4). A4 con portadilla (1), blanca (2), portada (3).
//   B. Apartados a la izquierda (2 líneas encima, 1 debajo); versos y párrafos enteros en cursiva
//      a la izquierda, sin sangría, con una línea en blanco encima y debajo, y nunca estirados al
//      partirse (el fallo de la p. 8 de Irene); firma (cursiva corta tras un título) bajo su título.
//   C. El título de un apartado nunca queda separado de lo que le sigue (p. 21 de Irene); huérfanas;
//      sin espacio de más al principio de página; hueco de una foto que salta, relleno con el texto
//      que la sigue (si pasa de un tercio de página). A4: las páginas de solo foto, numeradas.
//   D. Colofón: logo a la mitad, bloque centrado en vertical.
//   Letra: 11 pt en A5 (antes 10,5) y 13 pt en A4 (antes 11,5), con márgenes laterales de 28 mm.
//   Fotos: nunca en la primera página de un capítulo. Al imprimir, nada se recorta (A4 de Irene, p. 5).
//   20/10: Paged.js, al partir un párrafo a final de página, a veces perdía una línea (A4 de Irene,
//   p. 9) o metía un signo raro en medio de una palabra ("banq□uete", p. 49): cada corte suyo se
//   rehace como corte nuestro, a principio de palabra. Saltos que ya no hacen falta, retirados
//   (hueco de la p. 39). Comprobado palabra a palabra con el texto real: no falta ninguna.
// ARCHIVO IMPRIMIBLE (PDF) del libro PUBLICADO del Autor (tabla `publicaciones`, nunca el borrador).
// Estrategia: Continuidad, sesión "19/10/2026 (conversación 11: PDF, estrategia)"; formato:
// LOCUS_MUNDI_FORMATO_IMPRESION.md v2. Chrome sin pantalla (@sparticuz/chromium) + Paged.js, en
// versión fija (package.json). Reglas de lectura: /lectura.js, las mismas que la web.
//
// POST {token, accion}:
//   "estado"   → {publicado, disponible, comprado, quedan, hoy, max_dia}
//   "comprar"  → PAGO SIMULADO hasta Stripe (Fase C): crea la compra (origen 'simulado').
//   "generar"  {formato:"A5"|"A4"} → genera, guarda en el almacén privado `pdf`, apunta la descarga
//              (apuntar_descarga_pdf: 15 en total y 5 al día, con cerrojo) y devuelve {url, nombre,
//              quedan}: enlace temporal de 10 minutos. El vigía (api/diario.js) borra los PDF a las 24 h.
// Una generación fallida no cuenta. Plan Familiar (`autores.pdf_incluido`): la compra se crea sola.
// Seguridad: el Autor sale del token (Supabase), nunca del navegador; todo lo demás, con la llave de
// servicio. Protocolo de Seguridad v1.15, §3.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const L = require('../lectura.js');

// --- Ajustes ---------------------------------------------------------------------------------------
const PAGO_SIMULADO = true;            // ⚠ Poner a false (o quitar "comprar") al conectar Stripe (Fase C).
const DESCARGAS_POR_COMPRA = 15;       // = valor por defecto de pdf_compras.descargas
const MAX_DIA = 5;                     // = el de apuntar_descarga_pdf (SQL)
const SIN_PDF = ['AR', 'ZH', 'JA', 'HI']; // de entrada, solo alfabetos latino y cirílico (conv. 11, punto 5)
const MINUTOS_ENLACE = 10;
const BUCKET = 'pdf';

const LEYENDA = { // colofón, en el idioma del libro (traducido por Claude, sin IA en tiempo real)
  ES: 'Publicado en Locus Mundi · locusmundi.com · Archivo vivo de la humanidad',
  CA: 'Publicat a Locus Mundi · locusmundi.com · Arxiu viu de la humanitat',
  GL: 'Publicado en Locus Mundi · locusmundi.com · Arquivo vivo da humanidade',
  EN: 'Published on Locus Mundi · locusmundi.com · The living archive of humanity',
  FR: 'Publié sur Locus Mundi · locusmundi.com · Archive vivante de l’humanité',
  DE: 'Veröffentlicht bei Locus Mundi · locusmundi.com · Lebendiges Archiv der Menschheit',
  IT: 'Pubblicato su Locus Mundi · locusmundi.com · Archivio vivo dell’umanità',
  'PT-PT': 'Publicado no Locus Mundi · locusmundi.com · Arquivo vivo da humanidade',
  'PT-BR': 'Publicado no Locus Mundi · locusmundi.com · Arquivo vivo da humanidade',
  PT: 'Publicado no Locus Mundi · locusmundi.com · Arquivo vivo da humanidade',
  RU: 'Опубликовано в Locus Mundi · locusmundi.com · Живой архив человечества',
  AR: 'نُشر في Locus Mundi · locusmundi.com · الأرشيف الحي للإنسانية',
  ZH: '发表于 Locus Mundi · locusmundi.com · 人类的活档案',
  JA: 'Locus Mundi にて公開 · locusmundi.com · 人類の生きたアーカイブ',
  HI: 'Locus Mundi पर प्रकाशित · locusmundi.com · मानवता का जीवित संग्रह',
};
const ETIQUETA_IDIOMA = { ES: 'es', CA: 'ca', GL: 'gl', EN: 'en', FR: 'fr', DE: 'de', IT: 'it', 'PT-PT': 'pt-PT', 'PT-BR': 'pt-BR', PT: 'pt', RU: 'ru' };

// Partición silábica (Chrome sin pantalla no trae diccionarios). Requires literales: así Vercel los empaqueta.
const SILABAS = {
  ES: () => require('hyphen/es'), CA: () => require('hyphen/ca'), GL: () => require('hyphen/gl'),
  EN: () => require('hyphen/en-us'), FR: () => require('hyphen/fr'), DE: () => require('hyphen/de-1996'),
  IT: () => require('hyphen/it'), 'PT-PT': () => require('hyphen/pt'), 'PT-BR': () => require('hyphen/pt'),
  PT: () => require('hyphen/pt'), RU: () => require('hyphen/ru'),
};
const SHY = '­';
function partidor(lang) {
  const f = SILABAS[lang];
  if (!f) return (s) => s;
  const h = f();
  // Nunca deja una sola letra a un lado del guion (ni "ca-ñón" partido como "cañó-n").
  return (texto) => h.hyphenateSync(texto, { hyphenChar: SHY, minWordLength: 5 })
    .replace(/[\p{L}­]+/gu, (pal) => {
      if (!pal.includes(SHY)) return pal;
      const trozos = pal.split(SHY);
      const out = [trozos[0]];
      for (let i = 1; i < trozos.length; i++) {
        const resto = trozos.slice(i).join('');
        if (out.join('').length < 2 || resto.length < 3) out[out.length - 1] += trozos[i];
        else out.push(trozos[i]);
      }
      return out.join(SHY);
    });
}

// --- Supabase -------------------------------------------------------------------------------------
const SB = () => process.env.SUPABASE_URL;
const LLAVE = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const cab = (extra) => Object.assign({ apikey: LLAVE(), Authorization: `Bearer ${LLAVE()}` }, extra || {});
async function rest(ruta, opciones) {
  const r = await fetch(`${SB()}/rest/v1/${ruta}`, Object.assign({}, opciones, { headers: cab(Object.assign({ 'Content-Type': 'application/json' }, (opciones || {}).headers)) }));
  const texto = await r.text();
  let datos = null; try { datos = texto ? JSON.parse(texto) : null; } catch (_) { datos = texto; }
  if (!r.ok) { const e = new Error((datos && datos.message) || `REST ${r.status}`); e.datos = datos; throw e; }
  return datos;
}
async function autorDelToken(token) {
  if (!token || typeof token !== 'string') return null;
  const r = await fetch(`${SB()}/auth/v1/user`, { headers: { apikey: LLAVE(), Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? u.id : null;
}

// El libro vivo del Autor y su versión publicada (si la hay).
async function libroDe(autor) {
  const [h] = await rest(`historias?autor_id=eq.${autor}&marcado_borrado=is.false&select=id&limit=1`);
  if (!h) return { historia: null, pub: null };
  const [pub] = await rest(`publicaciones?historia_id=eq.${h.id}&select=historia_id,titulo,contenido,portada_url,idioma_original,fecha_actualizacion`);
  return { historia: h.id, pub: pub || null };
}

async function estadoCompra(historia, autor) {
  let [c] = await rest(`pdf_compras?historia_id=eq.${historia}&select=descargas`);
  if (!c) { // Plan Familiar: el PDF va incluido; la compra se crea sola la primera vez.
    const [a] = await rest(`autores?id=eq.${autor}&select=pdf_incluido`);
    if (a && a.pdf_incluido) {
      await rest('pdf_compras', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ historia_id: historia, autor_id: autor, origen: 'plan_familiar' }) });
      [c] = await rest(`pdf_compras?historia_id=eq.${historia}&select=descargas`);
    }
  }
  if (!c) return { comprado: false, quedan: 0, hoy: 0 };
  const filas = await rest(`pdf_descargas?historia_id=eq.${historia}&select=creado_en`);
  const dia = (d) => new Date(d).toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
  const hoy = dia(new Date());
  return { comprado: true, quedan: Math.max(0, c.descargas - filas.length), hoy: filas.filter((f) => dia(f.creado_en) === hoy).length };
}

// --- Maquetación -----------------------------------------------------------------------------------
const NM = path.join(process.cwd(), 'node_modules');
const leer = (r, cod) => fs.readFileSync(path.join(NM, r), cod);
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function fuentesCss() {
  const f = (familia, archivo, peso, estilo) =>
    `@font-face{font-family:'${familia}';font-weight:${peso};font-style:${estilo};src:url(data:font/woff2;base64,${leer(archivo).toString('base64')}) format('woff2');}`;
  const out = [];
  for (const sub of ['latin', 'latin-ext', 'cyrillic']) {
    out.push(f('EB Garamond', `@fontsource/eb-garamond/files/eb-garamond-${sub}-400-normal.woff2`, 400, 'normal'));
    out.push(f('EB Garamond', `@fontsource/eb-garamond/files/eb-garamond-${sub}-400-italic.woff2`, 400, 'italic'));
    out.push(f('Playfair Display', `@fontsource/playfair-display/files/playfair-display-${sub}-400-normal.woff2`, 400, 'normal'));
    out.push(f('Playfair Display', `@fontsource/playfair-display/files/playfair-display-${sub}-400-italic.woff2`, 400, 'italic'));
  }
  return out.join('\n');
}

// Imagen del almacén público → data URI (la reduce después el propio Chrome, ver ESCALAR).
async function imagen(url) {
  if (!url) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const tipo = r.headers.get('content-type') || 'image/jpeg';
    if (!/^image\/(jpeg|png)/.test(tipo)) return null;
    return `data:${tipo};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`;
  } catch (_) { return null; }
}

function colofonFecha(fecha, lang, ciudad) {
  let mes = '';
  try { mes = new Intl.DateTimeFormat(ETIQUETA_IDIOMA[lang] || 'es', { month: 'long', year: 'numeric' }).format(new Date(fecha)); } catch (_) {}
  if (mes && ['ES', 'CA', 'GL', 'IT', 'FR', 'PT-PT', 'PT-BR', 'PT'].includes(lang)) mes = mes.charAt(0).toLowerCase() + mes.slice(1);
  return [ciudad, mes].filter(Boolean).join(', ');
}

async function construirHtml(pub, formato) {
  const c = pub.contenido || {};
  const lang = String(pub.idioma_original || 'ES').toUpperCase();
  const silabas = partidor(lang);
  const fotosUrl = {};
  const bloques = L.bloquesLectura(c.text, c.fotos || [], lang);
  await Promise.all(bloques.filter((b) => b && b.tipo === 'foto').map(async (b) => { fotosUrl[b.foto.orden] = await imagen(b.foto.url); }));
  const portada = await imagen(pub.portada_url);

  // Libro en secciones: preliminares (lo que va antes del primer ¶) y un capítulo por cada ¶.
  // Cada párrafo guarda sus trozos ya con la partición silábica: render() puede partirlo por
  // donde mande la paginación (reglas 6.1 a 6.3) y volver a montarlo.
  const secciones = [];
  let actual = null, np = 0, nh = 0, nf = 0;
  for (const b of bloques) {
    if (!b) continue;
    if (b.tipo === 'capitulo' || !actual) { actual = { cap: b.tipo === 'capitulo' ? b : null, cuerpo: [] }; secciones.push(actual); if (b.tipo === 'capitulo') continue; }
    if (b.tipo === 'foto') {
      const src = fotosUrl[b.foto.orden];
      if (src) actual.cuerpo.push({ tipo: 'fig', id: nf++, html: `<img data-escalar src="${src}" alt=""/>${b.foto.pie_foto ? `<figcaption>${esc(b.foto.pie_foto)}</figcaption>` : ''}` });
    } else if (b.tipo === 'apartado') {
      actual.cuerpo.push({ tipo: 'h3', id: nh++, texto: b.texto });
    } else {
      const trozos = b.trozos.map((x) => ({ t: silabas(x.texto), em: x.cursiva }));
      const texto = trozos.map((x) => x.t).join('');
      if (!texto.trim()) continue;
      // v1.2 (formato v2.1, B): versos (saltos de línea propios) y párrafos enteros en cursiva.
      const verso = /\n/.test(texto.trim());
      const cursiva = trozos.every((x) => x.em || !x.t.trim());
      // Firma: cursiva entera, corta y de una línea, justo después de un título (capítulo o apartado).
      const previo = actual.cuerpo[actual.cuerpo.length - 1];
      const trasTitulo = previo ? previo.tipo === 'h3' && !previo.firma : !!actual.cap;
      if (cursiva && !verso && trasTitulo && texto.trim().length <= 120) {
        if (previo) previo.firma = trozos; else actual.firmaCap = trozos;
        continue;
      }
      actual.cuerpo.push({ tipo: 'p', id: np++, trozos, clase: verso ? 'verso' : (cursiva ? 'cita' : '') });
    }
  }
  // v1.2 (A): preliminares cortos = dedicatoria. Cada párrafo, en su página, centrado y sin número.
  // Si son largos (o llevan fotos o apartados), empiezan como un capítulo más, con número.
  const dedicatorias = [];
  const pre = secciones[0] && !secciones[0].cap ? secciones[0] : null;
  if (pre && pre.cuerpo.length && pre.cuerpo.length <= 3 && pre.cuerpo.every((el) => el.tipo === 'p' && el.trozos.map((x) => x.t).join('').length <= 400)) {
    secciones.shift();
    dedicatorias.push(...pre.cuerpo);
  }
  // Un párrafo (o un trozo suyo, de "desde" a "hasta" en su texto) en HTML. Los saltos de línea
  // del Autor (poesía, citas) son <br/>: cuentan como un carácter, igual que al medir.
  const htmlTrozos = (trozos, desde, hasta) => {
    let pos = 0, out = '';
    for (const x of trozos) {
      const a = Math.max(desde, pos), z = Math.min(hasta, pos + x.t.length);
      if (z > a) { const h = esc(x.t.slice(a - pos, z - pos)).replace(/\n/g, '<br/>'); out += x.em ? `<em>${h}</em>` : h; }
      pos += x.t.length;
    }
    return out;
  };
  // Lleva un punto de corte al principio de palabra más cercano (la medida puede desviarse un carácter).
  const aPalabra = (texto, o) => {
    for (const d of [0, 1, -1]) { const k = o + d; if (k > 0 && k < texto.length && /\s/.test(texto[k - 1]) && !/\s/.test(texto[k])) return k; }
    // v1.2: si cae dentro de una palabra (línea partida con guion), la palabra entera pasa al trozo
    // siguiente: nunca se corta una palabra en un cambio de página (el "banq□uete" del A4 de Irene).
    for (let k = o - 1; k > 0 && k > o - 40; k--) if (/\s/.test(texto[k - 1]) && !/\s/.test(texto[k])) return k;
    return o;
  };
  // v1.2 (C): hueco de una foto que salta de página → los párrafos que siguen a la foto (o a un
  // grupo de fotos seguidas) pasan delante de ella, uno por arreglo.
  const ordenar = (sec, aj) => {
    const orden = sec.cuerpo.slice();
    for (let k = 0; k < orden.length; k++) {
      if (orden[k].tipo !== 'fig') continue;
      const n = aj.subir.get(orden[k].id) || 0;
      let r = k; while (orden[r + 1] && orden[r + 1].tipo === 'fig') r++;
      let m = 0;
      while (m < n && orden[r + 1 + m] && orden[r + 1 + m].tipo === 'p') m++;
      if (m) orden.splice(k, r - k + 1 + m, ...orden.slice(r + 1, r + 1 + m), ...orden.slice(k, r + 1));
      k = r + m;
    }
    return orden;
  };
  const firmaHtml = (trozos) => htmlTrozos(trozos, 0, trozos.map((x) => x.t).join('').length).replace(/^\s+|\s+$/g, '');
  const cuerpoHtml = (aj) => secciones.map((sec, i) => {
    const cabecera = sec.cap ? `<header class="cap-cab">${sec.cap.etiqueta ? `<div class="cap-etq">${esc(sec.cap.etiqueta)}</div>` : ''}${sec.cap.titulo ? `<h2>${esc(sec.cap.titulo)}</h2>` : ''}${sec.firmaCap ? `<div class="firma-cap">${firmaHtml(sec.firmaCap)}</div>` : ''}</header>` : '';
    // v1.2 (C): hueco de una foto que salta de página → los párrafos que la siguen pasan delante.
    const partes = ordenar(sec, aj).map((el) => {
      if (el.tipo === 'fig') { const r = aj.reducir.get(el.id); return `<figure data-f="${el.id}">${r ? el.html.replace('<img ', `<img style="max-height:${r}px" `) : el.html}</figure>`; }
      if (el.tipo === 'h3') return `<h3 data-h="${el.id}"${aj.saltos.has('h' + el.id) ? ' class="salto"' : ''}>${esc(el.texto)}</h3>${el.firma ? `<div class="firma" data-h="${el.id}">${firmaHtml(el.firma)}</div>` : ''}`;
      const texto = el.trozos.map((x) => x.t).join('');
      const cortes = [...new Set((aj.cortes[el.id] || []).map((o) => aPalabra(texto, o)))].filter((o) => o > 0 && o < texto.length).sort((x, y) => x - y);
      const lim = [0, ...cortes, texto.length];
      const salto = aj.saltos.has('p' + el.id);
      return lim.slice(0, -1).map((ini, k) => {
        const cls = [el.clase, k > 0 ? 'sigue salto' : (salto ? 'salto' : ''), k < lim.length - 2 ? 'corta' : ''].filter(Boolean).join(' ');
        return `<p data-p="${el.id}" data-ini="${ini}" data-fin="${lim[k + 1]}"${aj.vetos && aj.vetos.has(String(el.id)) ? ' data-veto' : ''}${cls ? ` class="${cls}"` : ''}>${htmlTrozos(el.trozos, ini, lim[k + 1])}</p>`;
      }).join('');
    });
    return `<section class="cap${sec.cap ? '' : ' preliminar'}${i === 0 ? ' primera' : ''}" data-cap="${i}">${cabecera}${partes.join('\n')}</section>`;
  }).join('\n');
  const dedicHtml = dedicatorias.map((el) => `<section class="dedic"><div class="dedic-caja"><p>${firmaHtml(el.trozos)}</p></div></section>`).join('\n');

  const titulo = pub.titulo || c.title || '';
  const autor = c.name || '';
  const subtitulo = c.subtitle || '';
  const logo = fs.readFileSync(path.join(process.cwd(), 'logo_locus_mundi_fondo_blanco.png')).toString('base64');
  const fechaColofon = colofonFecha(pub.fecha_actualizacion, lang, (c.pubCity || '').trim());
  const A5 = formato === 'A5';

  // v1.2 (A): los dos formatos, portadilla (1), blanca (2) y portada (3); dedicatoria en la 5 (A5) o la 4 (A4).
  const portadas = `<section class="portada solo-titulo"><h1>${esc(titulo)}</h1></section>
       <section class="portada completa"><div class="pc-texto"><div class="pc-autor">${esc(autor)}</div><h1>${esc(titulo)}</h1>${subtitulo ? `<div class="pc-sub">${esc(subtitulo)}</div>` : ''}</div>${portada ? `<div class="pc-img"><img data-escalar src="${portada}" alt=""/></div>` : ''}</section>`;
  const colofon = `<section class="colofon"><div class="colofon-caja"><img src="data:image/png;base64,${logo}" alt=""/><div>${esc(fechaColofon)}</div><div>${esc(LEYENDA[lang] || LEYENDA.ES)}</div></div></section>${A5 ? '<section class="final"></section>' : ''}`;

  // Medidas (mm y pt). A5: libro (márgenes de espejo); A4: documento. "alto": caja de texto.
  const M = A5
    ? { tam: 'A5', arriba: 17, abajo: 20, dentro: 19, fuera: 15, cuerpo: 11, linea: 1.38, img: 120, imgPx: 1400, portadaImg: 95, alto: 210 - 37, logo: 13 }
    : { tam: 'A4', arriba: 25, abajo: 25, dentro: 28, fuera: 28, cuerpo: 13, linea: 1.4, img: 150, imgPx: 2000, portadaImg: 150, alto: 297 - 50, logo: 16 };
  const L1 = `${(M.cuerpo * M.linea).toFixed(2)}pt`; // una línea en blanco
  const L2 = `${(2 * M.cuerpo * M.linea).toFixed(2)}pt`;
  const css = `${fuentesCss()}
@page { size: ${M.tam}; margin: ${M.arriba}mm ${M.fuera}mm ${M.abajo}mm ${M.dentro}mm;
  @bottom-center { content: counter(page); font-family: 'EB Garamond', serif; font-size: ${M.cuerpo - 1}pt; color: #222; } }
${A5 ? `@page :left { margin-left: ${M.fuera}mm; margin-right: ${M.dentro}mm; }
@page :right { margin-left: ${M.dentro}mm; margin-right: ${M.fuera}mm; }` : ''}
@page :blank { @bottom-center { content: none; } }
@page sinnumero { @bottom-center { content: none; } }
html { font-family: 'EB Garamond', serif; font-size: ${M.cuerpo}pt; line-height: ${M.linea}; color: #111; }
body { margin: 0; }
p { margin: 0; text-align: justify; text-indent: 1.2em; widows: 2; orphans: 2; hyphens: manual; }
.cap-cab + p, h3 + p, .firma + p, figure + p, .preliminar > p:first-child { text-indent: 0; }
em { font-style: italic; }
section.cap { break-before: ${A5 ? 'right' : 'page'}; }
section.cap.primera { break-before: right; }
.cap-cab { margin: ${A5 ? 22 : 30}mm 0 ${A5 ? 9 : 12}mm; text-align: center; break-after: avoid; }
.cap-etq { font-family: 'Playfair Display', serif; font-size: ${M.cuerpo - 1.5}pt; letter-spacing: 0.18em; text-transform: uppercase; color: #333; margin-bottom: 3mm; }
h2 { font-family: 'Playfair Display', serif; font-weight: 400; font-size: ${A5 ? 16 : 19}pt; line-height: 1.25; margin: 0; }
.firma-cap { font-size: ${M.cuerpo}pt; margin-top: ${L1}; }
h3 { font-family: 'Playfair Display', serif; font-weight: 400; font-style: italic; font-size: ${M.cuerpo + 1.5}pt; line-height: 1.3; margin: ${L2} 0 ${L1}; text-align: left; break-after: avoid; }
.cap-cab + h3 { margin-top: 0; }
h3:has(+ .firma) { margin-bottom: 0; }
.firma { margin: 0 0 ${L1}; text-align: left; break-after: avoid; }
p.verso, p.cita { text-align: left !important; text-align-last: auto !important; text-indent: 0; margin: ${L1} 0; }
p.verso.corta, p.cita.corta, p.verso[data-split-to], p.cita[data-split-to] { margin-bottom: 0; }
p.verso.sigue, p.cita.sigue, p.verso[data-split-from], p.cita[data-split-from] { margin-top: 0; }
h3 + p.verso, h3 + p.cita, .firma + p.verso, .firma + p.cita, .cap-cab + p.verso, .cap-cab + p.cita { margin-top: 0; }
.dedic { page: sinnumero; break-before: ${A5 ? 'right' : 'page'}; }
.dedic-caja, .colofon-caja { height: ${M.alto - 8}mm; display: flex; flex-direction: column; justify-content: center; text-align: center; }
.dedic p { text-align: center; text-indent: 0; }
.dedic + section.cap.primera { break-before: ${A5 ? 'right' : 'page'}; }
figure { margin: 5mm 0; text-align: center; break-inside: avoid; }
figure img { max-width: 100%; max-height: ${M.img}mm; }
figcaption { font-size: ${M.cuerpo - 1.5}pt; font-style: italic; line-height: 1.3; margin-top: 2mm; text-align: center; }
.portada { page: sinnumero; break-before: right; text-align: center; }
.portada h1 { font-family: 'Playfair Display', serif; font-weight: 400; font-size: ${A5 ? 22 : 28}pt; line-height: 1.2; margin: 0; }
.solo-titulo { padding-top: 55mm; }
.portada:first-child { break-before: auto; }
.pc-texto { height: ${A5 ? 58 : 85}mm; padding-top: ${A5 ? 8 : 15}mm; box-sizing: border-box; }
.pc-autor { font-size: ${M.cuerpo + 2}pt; letter-spacing: 0.06em; margin-bottom: 6mm; }
.pc-sub { font-style: italic; font-size: ${M.cuerpo + 1.5}pt; margin-top: 4mm; }
.pc-img img { max-width: 100%; max-height: ${M.portadaImg}mm; }
.colofon { page: sinnumero; break-before: ${A5 ? 'right' : 'page'}; text-align: center; font-size: ${M.cuerpo - 1}pt; }
.colofon img { width: ${M.logo}mm; display: block; margin: 0 auto 5mm; }
.colofon div { margin-top: 2mm; }
.final { page: sinnumero; break-before: page; }
.salto { break-before: page; }
p.sigue { text-indent: 0; }
p.corta { text-align-last: justify; }
.sin-numero .pagedjs_margin-bottom-center { visibility: hidden; }
.pagedjs_page { background: white; }
/* v1.2: nada se recorta al imprimir; si una línea rebasa la caja por un pelo, se ve (antes se perdía). */
.pagedjs_area, .pagedjs_page_content { overflow: visible !important; }`;

  // En el navegador: reducir las imágenes a calidad de imprenta y, después, paginar.
  const guion = `
window.PagedConfig = { auto: false };
const ESCALAR = ${M.imgPx};
async function escalar(img){
  await (img.decode ? img.decode().catch(()=>{}) : null);
  const w=img.naturalWidth, h=img.naturalHeight; if(!w||!h) return;
  const k=Math.min(1, ESCALAR/Math.max(w,h)); if(k>=1 && img.src.startsWith('data:image/jpeg')) return;
  const cv=document.createElement('canvas'); cv.width=Math.round(w*k); cv.height=Math.round(h*k);
  const cx=cv.getContext('2d'); cx.fillStyle='#fff'; cx.fillRect(0,0,cv.width,cv.height); cx.drawImage(img,0,0,cv.width,cv.height);
  img.src=cv.toDataURL('image/jpeg',0.86); await (img.decode ? img.decode().catch(()=>{}) : null);
}
window.__maquetar = async function(){
  await document.fonts.ready;
  await Promise.all([...document.querySelectorAll('img[data-escalar]')].map(escalar));
  await window.PagedPolyfill.preview();
  for(const pg of document.querySelectorAll('.pagedjs_page')){
    const area=pg.querySelector('.pagedjs_page_content'); if(!area) continue;
    // Página sin texto escrito (solo una foto): sin número en el A5; en el A4, numerada (v1.2).
    const hayFoto=area.querySelector('figure'), hayTexto=[...area.querySelectorAll('p,h2,h3,.cap-etq')].some(e=>e.textContent.trim());
    if(${A5} && hayFoto && !hayTexto) pg.classList.add('sin-numero');
    // v1.2 (C, regla 7): sin espacio de más al principio de página (apartado, versos, cita, foto).
    const pri=area.querySelector('section.cap > :first-child');
    if(pri && !pri.matches('header')) pri.style.marginTop='0';
  }
  // Si aun así Paged.js parte un párrafo (uno más largo que una página), su guion de corte es un
  // signo que la letra no trae (U+2011): se cambia por el guion normal.
  for(const e of document.querySelectorAll('.pagedjs_hyphen')){ const w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT); let n,ult=null; while((n=w.nextNode())) ult=n; if(ult && ult.textContent.endsWith('\u2011')) ult.textContent=ult.textContent.slice(0,-1)+'-'; }
  return document.querySelectorAll('.pagedjs_page').length;
};`;

  const cabeza = `<!doctype html><html lang="${ETIQUETA_IDIOMA[lang] || 'es'}"><head><meta charset="utf-8"><style>${css}</style>
<script>${guion}</script><script>${leer('pagedjs/dist/paged.polyfill.min.js', 'utf8')}</script></head><body>`;
  const render = (aj) => `${cabeza}${portadas}\n${dedicHtml}\n${cuerpoHtml(aj || { cortes: {}, saltos: new Set(), subir: new Map(), reducir: new Map() })}\n${colofon}</body></html>`;
  render.orden = (aj) => JSON.stringify(secciones.map((sec) => ordenar(sec, aj).map((el) => el.tipo[0] + el.id)));
  return { render, titulo, autor };
}

// Reglas 6.1 a 6.3 (formato §6), medidas sobre las páginas ya maquetadas por Paged.js (que no
// respeta del todo widows/orphans). Devuelve los arreglos: {corte:[párrafo, posición]} parte un
// párrafo y lleva su final a la página siguiente ("acortar la caja de la página anterior");
// {salto:"p12"|"h3"} lleva un párrafo o un apartado entero a la página siguiente.
//  6.1 Nunca una sola línea de un párrafo al principio de página.
//  6.2 Nunca un apartado solo al final de página, ni con una sola línea de su texto.
//  6.3 La última página de cada capítulo, al menos 3 líneas.
const MEDIR = `(() => {
  const arreglos = []; let R = '', PG = 0;
  const add = (o) => { o.pg = PG; arreglos.push(o); }; // pg: página donde está el arreglo
  const lh = (el) => parseFloat(getComputedStyle(el).lineHeight);
  const lineas = (el) => Math.max(1, Math.round(el.getBoundingClientRect().height / lh(el)));
  const paginas = [...document.querySelectorAll('.pagedjs_page')];
  const elementos = (pg) => { const a = pg.querySelector('.pagedjs_page_content'); return a ? [...a.querySelectorAll('section.cap > p, section.cap > h3, section.cap > .firma, section.cap > figure, section.cap > header')] : []; };
  // v1.2: el título de apartado (con su firma) que va justo delante de un elemento, si lo hay.
  const esTitulo = (e) => e && (e.tagName === 'H3' || e.classList.contains('firma'));
  const cabezaDe = (el) => { let h = null, e = el.previousElementSibling; while (esTitulo(e)) { if (e.tagName === 'H3') h = e; e = e.previousElementSibling; } return h; };
  const saltoDe = (el) => { const h = cabezaDe(el); return h ? { salto: 'h' + h.getAttribute('data-h') } : (el.tagName === 'P' ? { salto: 'p' + el.getAttribute('data-p') } : null); };
  // Posición (en el texto entero del párrafo) del principio de cada línea de este trozo.
  const iniciosDeLinea = (frag) => {
    const ref = frag.getAttribute('data-ref');
    let base = parseInt(frag.getAttribute('data-ini') || '0', 10);
    for (const otro of document.querySelectorAll('[data-ref="' + ref + '"]')) { if (otro === frag) break; base += cuenta(otro); }
    const out = []; let pos = base, arriba = -1e9;
    const w = document.createTreeWalker(frag, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    const r = document.createRange();
    while (w.nextNode()) {
      const n = w.currentNode;
      if (n.nodeType === 1) { if (n.tagName === 'BR') pos += 1; continue; }
      for (let i = 0; i < n.length; i++) {
        r.setStart(n, i); r.setEnd(n, i + 1);
        const rc = r.getClientRects()[0];
        if (rc && rc.width > 0 && rc.top > arriba + lh(frag) / 2) { out.push(pos); arriba = rc.top; }
        pos++;
      }
    }
    return out;
  };
  const cuenta = (el) => { let n = 0; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT); while (w.nextNode()) { const x = w.currentNode; n += x.nodeType === 3 ? x.length : (x.tagName === 'BR' ? 1 : 0); } return n; };
  // Un corte en un párrafo; si el trozo ya era el principio de un corte nuestro que no cupo entero,
  // el corte nuevo sustituye al viejo (si no, quedaría en medio un trozo suelto en su página).
  const cortar = (frag, o, r) => add({ corte: [frag.getAttribute('data-p'), o], r, reemplaza: frag.classList.contains('corta') ? Number(frag.getAttribute('data-fin')) : null });
  // Mover "cuantas" líneas del final de este trozo (última cosa de su página) a la siguiente.
  const mover = (frag, cuantas) => {
    const ini = iniciosDeLinea(frag);
    const k = ini.length - cuantas;
    const primero = !frag.hasAttribute('data-split-from');
    if (k >= 2 || (!primero && k >= 1)) cortar(frag, ini[k], R);
    else if (primero) { const s = saltoDe(frag); if (s) add(s); } // v1.2: con su título, si lo lleva
  };
  paginas.forEach((pg, i) => {
    PG = i;
    const els = elementos(pg); if (!els.length) return;
    const ant = i > 0 ? elementos(paginas[i - 1]) : [];
    const ultAnt = ant[ant.length - 1];
    // 6.1
    const pri = els[0];
    R = '6.1'; if (pri.tagName === 'P' && pri.hasAttribute('data-split-from') && lineas(pri) < 2 && ultAnt && ultAnt.tagName === 'P') mover(ultAnt, 1);
    // 6.2 (v1.2): el título de apartado nunca al final de página, ni con una sola línea de su texto;
    // y si es lo único de la página (lo que le sigue saltó, p. ej. una foto), va con ello.
    const ult = els[els.length - 1];
    if (esTitulo(ult)) {
      const h = ult.tagName === 'H3' ? (cabezaDe(ult) || ult) : cabezaDe(ult);
      const solo = els.every(esTitulo);
      if (h && !(solo && h === els[0])) add({ salto: 'h' + h.getAttribute('data-h') });
      else if (h && solo && paginas[i + 1]) { // ya está arriba: lo que le sigue debe caber con él
        const sig = elementos(paginas[i + 1])[0];
        if (sig && sig.tagName === 'P' && !sig.hasAttribute('data-split-from')) add({ cabe: 'p' + sig.getAttribute('data-p') });
      }
    }
    // Huérfana (v1.2): nunca la primera línea de un párrafo sola al final de página.
    else if (ult.tagName === 'P' && ult.hasAttribute('data-split-to') && !ult.hasAttribute('data-split-from') && lineas(ult) < 2) {
      const s = saltoDe(ult); if (s) add(s);
    }
    // Corte de Paged.js (v1.2): cuando Paged.js parte un párrafo a final de página, a veces pierde
    // una línea o mete un signo raro en medio de una palabra (A4 de Irene, p. 9 y 49). Ese corte se
    // rehace como corte nuestro, en el mismo sitio pero a principio de palabra: lo de después no se mueve.
    if (ult.tagName === 'P' && ult.hasAttribute('data-split-to') && !arreglos.some((a) => a.pg === i && ((a.corte && a.corte[0] === ult.getAttribute('data-p')) || a.salto))) {
      const ref = ult.getAttribute('data-ref');
      let base = parseInt(ult.getAttribute('data-ini') || '0', 10);
      for (const otro of document.querySelectorAll('[data-ref="' + ref + '"]')) { if (otro === ult) break; base += cuenta(otro); }
      let o = base + cuenta(ult);
      if (ult.classList.contains('pagedjs_hyphen')) o -= 1; // el guion que añade Paged.js no es del texto
      R = 'nativo'; cortar(ult, o, R);
    }
    // Salto viejo (v1.2): un párrafo o un apartado que una regla llevó a la página siguiente y que,
    // tras otros arreglos, ya cabe entero aquí: se le quita el salto (hueco del A4 de Irene, p. 39).
    const s0 = paginas[i + 1] ? elementos(paginas[i + 1])[0] : null;
    if (s0 && s0.classList.contains('salto') && !s0.classList.contains('sigue') && (s0.tagName === 'P' || s0.tagName === 'H3') && ult.tagName !== 'HEADER'
        && ult.closest('section.cap').getAttribute('data-cap') === s0.closest('section.cap').getAttribute('data-cap')) {
      const area = pg.querySelector('.pagedjs_page_content').getBoundingClientRect();
      const libre = area.bottom - ult.getBoundingClientRect().bottom - (parseFloat(getComputedStyle(ult).marginBottom) || 0);
      const sigEls2 = elementos(paginas[i + 1]);
      let necesita;
      if (s0.tagName === 'P') necesita = s0.getBoundingClientRect().height + (s0.matches('.verso, .cita') ? lh(s0) : 0);
      else { const t = sigEls2.find((e, k) => k > 0 && !esTitulo(e)); necesita = t ? (t.getBoundingClientRect().top - s0.getBoundingClientRect().top) + 2 * lh(t) + 2 * lh(t) : 1e9; }
      if (necesita + lh(s0) / 2 <= libre) add({ quitar: s0.tagName === 'P' ? 'p' + s0.getAttribute('data-p') : 'h' + s0.getAttribute('data-h') });
    }
    // Hueco sin motivo (v1.2): Paged.js a veces lleva entero a la página siguiente un párrafo que
    // cabía en parte (visto tras unos versos). Si aquí caben 2 líneas o más, se parte el párrafo.
    const sig0 = paginas[i + 1] ? elementos(paginas[i + 1])[0] : null;
    if (els.length === 1 && els[0].tagName === 'P' && els[0].classList.contains('corta') && !els[0].classList.contains('sigue') && i > 0)
      add({ veto: els[0].getAttribute('data-p') }); // un corte que no cupo: se quita y no se repite
    if (els.length === 1 && els[0].tagName === 'P' && els[0].classList.contains('corta') && els[0].classList.contains('sigue'))
      add({ unir: [els[0].getAttribute('data-p'), Number(els[0].getAttribute('data-fin'))] }); // trozo suelto entre dos cortes: se une al siguiente
    if (sig0 && sig0.tagName === 'P' && !sig0.hasAttribute('data-split-from') && !sig0.classList.contains('salto') && !sig0.hasAttribute('data-veto')
        && !esTitulo(ult) && ult.tagName !== 'HEADER'
        && ult.closest('section.cap').getAttribute('data-cap') === sig0.closest('section.cap').getAttribute('data-cap')) {
      const area = pg.querySelector('.pagedjs_page_content').getBoundingClientRect();
      const mb = parseFloat(getComputedStyle(ult).marginBottom) || 0, mt = sig0.matches('.verso, .cita') ? lh(sig0) : 0; // arriba de página su margen se quitó: se cuenta igual
      const n = Math.floor((area.bottom - ult.getBoundingClientRect().bottom - Math.max(mb, mt) - lh(sig0) / 2) / lh(sig0)); // con media línea de holgura
      if (n >= 2) {
        const ini = iniciosDeLinea(sig0);
        const k = Math.min(n, ini.length - 2);
        if (k >= 2) add({ corte: [sig0.getAttribute('data-p'), ini[k]], r: 'hueco' });
      }
    }
    // Hueco de una foto que salta (v1.2, opción b): si la página siguiente empieza por una foto del
    // mismo capítulo y aquí queda libre más de un tercio, el párrafo que la sigue pasa delante.
    const sigEls = paginas[i + 1] ? elementos(paginas[i + 1]) : [];
    const f = sigEls[0]; let tras = 1; while (sigEls[tras] && sigEls[tras].tagName === 'FIGURE') tras++;
    if (f && f.tagName === 'FIGURE' && sigEls[tras] && sigEls[tras].tagName === 'P' && !sigEls[tras].hasAttribute('data-split-from')
        && ult.tagName !== 'HEADER' && ult.closest('section.cap').getAttribute('data-cap') === f.closest('section.cap').getAttribute('data-cap')) {
      const area = pg.querySelector('.pagedjs_page_content').getBoundingClientRect();
      const libre = area.bottom - ult.getBoundingClientRect().bottom;
      if (libre > area.height / 3) { // cuántos párrafos caben en el hueco (al menos uno), de una vez
        let n = 0, alto = 0;
        for (let k = tras; sigEls[k] && sigEls[k].tagName === 'P' && !sigEls[k].hasAttribute('data-split-from'); k++) { alto += sigEls[k].getBoundingClientRect().height; n++; if (alto > libre) break; }
        add({ subir: f.getAttribute('data-f'), n: Math.max(1, n) });
      }
    }
  });
  // Foto en la primera página de un capítulo (v1.2, Javier 19/10): nunca. La foto pasa detrás de
  // los párrafos que la siguen en esa página (siempre entre párrafos, nunca en medio de uno).
  const primeraDe = {};
  paginas.forEach((pg, i) => { const h = pg.querySelector('section.cap > header'); if (h) primeraDe[h.closest('section.cap').getAttribute('data-cap')] = i; });
  for (const cap in primeraDe) {
    PG = primeraDe[cap];
    const els = elementos(paginas[primeraDe[cap]]).filter((e) => e.closest('section.cap').getAttribute('data-cap') === cap);
    const k = els.findIndex((e) => e.tagName === 'FIGURE');
    if (k < 0) { // el título del capítulo se quedó solo porque detrás venía la foto: también se mueve
      const sig = paginas[primeraDe[cap] + 1] ? elementos(paginas[primeraDe[cap] + 1]) : [];
      let j = 0; while (esTitulo(sig[j])) j++;
      if (els.every((e) => e.tagName === 'HEADER' || esTitulo(e)) && sig[j] && sig[j].tagName === 'FIGURE' && sig[j].closest('section.cap').getAttribute('data-cap') === cap)
        add({ subir: sig[j].getAttribute('data-f'), n: 2 });
      continue;
    }
    const n = Math.max(1, els.slice(k + 1).filter((e) => e.tagName === 'P' && !e.hasAttribute('data-split-from')).length);
    add({ subir: els[k].getAttribute('data-f'), n });
  }
  // 6.3: por capítulo, su última página.
  const ultimaDe = {};
  paginas.forEach((pg, i) => { for (const s of pg.querySelectorAll('section.cap')) ultimaDe[s.getAttribute('data-cap')] = i; });
  for (const cap in ultimaDe) {
    const i = ultimaDe[cap]; PG = i - 1;
    const els = elementos(paginas[i]).filter((e) => e.closest('section.cap').getAttribute('data-cap') === cap);
    if (!els.length || els.some((e) => e.tagName !== 'P')) continue;
    const n = els.reduce((t, e) => t + lineas(e), 0);
    if (n >= 3 || i === 0) continue;
    const ant = elementos(paginas[i - 1]).filter((e) => e.closest('section.cap').getAttribute('data-cap') === cap);
    const ultAnt = ant[ant.length - 1];
    R = '6.3'; if (ultAnt && ultAnt.tagName === 'P') mover(ultAnt, 3 - n);
  }
  return arreglos;
})()`;

// Pagina el libro: maqueta, mide, arregla y vuelve a maquetar (hasta 4 pasadas; casi siempre 1 o 2).
async function paginar(browser, render) {
  const aj = { cortes: {}, cortePg: {}, saltos: new Set(), quitados: new Set(), subir: new Map(), reducir: new Map(), vetos: new Set() };
  let page = null, pasadas = 0, arreglos = [];
  // Añade un corte (y quita el que sustituye, si lo hay). Devuelve si cambió algo.
  const ponerCorte = (a) => {
    const [id, o] = a.corte; const l = aj.cortes[id] = aj.cortes[id] || []; let cambio = false;
    if (a.reemplaza != null) { const k = l.findIndex((x) => Math.abs(x - a.reemplaza) <= 40); if (k >= 0 && Math.abs(l[k] - o) > 3) { l.splice(k, 1); cambio = true; } }
    if (!l.some((x) => Math.abs(x - o) <= 3)) { l.push(o); aj.cortePg[id] = Math.min(aj.cortePg[id] == null ? 1e9 : aj.cortePg[id], a.pg == null ? 0 : a.pg); cambio = true; }
    return cambio;
  };
  for (; pasadas < 10; pasadas++) { // v1.2: hasta 10 (primero la estructura; después los cortes, de una vez)
    if (page) await page.close();
    page = await browser.newPage();
    await page.emulateMediaType('print'); // v1.2: maquetar con las mismas medidas con que se imprime (ver PDF de Irene en A4, p. 5)
    await page.setContent(render(aj), { waitUntil: 'load', timeout: 120000 });
    await page.evaluate(() => window.__maquetar());
    arreglos = await page.evaluate(MEDIR);
    if (process.env.PDF_DEPURAR) console.log("pasada", pasadas, JSON.stringify(arreglos));
    let nuevos = 0;
    // v1.2: un arreglo de estructura (salto, foto) mueve todo lo que va detrás; los cortes medidos
    // antes ya no valen: se borran y se vuelven a medir en la pasada siguiente.
    const estructura = arreglos.filter((a) => !a.corte && !a.veto && !a.unir); // un veto no mueve nada más: no borra los otros cortes
    const antes = JSON.stringify([[...aj.saltos], [...aj.subir], [...aj.reducir]]);
    for (const a of (estructura.length ? estructura.concat(arreglos.filter((x) => x.veto || x.unir)) : arreglos)) {
      if (a.salto && !aj.saltos.has(a.salto) && !aj.quitados.has(a.salto)) { aj.saltos.add(a.salto); nuevos++; }
      if (a.quitar && aj.saltos.has(a.quitar)) { aj.saltos.delete(a.quitar); aj.quitados.add(a.quitar); nuevos++; }
      if (a.corte && aj.vetos.has(String(a.corte[0]))) { // corte que no cupo: el párrafo entero a la página siguiente
        if (!aj.saltos.has('p' + a.corte[0])) { aj.saltos.add('p' + a.corte[0]); nuevos++; }
      } else if (a.corte) { if (ponerCorte(a)) nuevos++; }
      if (a.unir) { const l = aj.cortes[a.unir[0]] || []; const k = l.findIndex((x) => Math.abs(x - a.unir[1]) <= 40); if (k >= 0) { l.splice(k, 1); nuevos++; } }
      if (a.subir != null && render.orden) { // solo si de verdad cambia el orden (quedan párrafos que subir)
        const f = Number(a.subir), o = render.orden(aj), v = aj.subir.get(f) || 0;
        aj.subir.set(f, v + (a.n || 1));
        if (render.orden(aj) === o) aj.subir.set(f, v); else nuevos++;
      }
      if (a.cabe && aj.saltos.has(a.cabe)) { aj.saltos.delete(a.cabe); nuevos++; }
      if (a.veto && !aj.vetos.has(a.veto)) { aj.vetos.add(a.veto); delete aj.cortes[a.veto]; nuevos++; }
      if (a.reducir) { const [f, px] = a.reducir; if (!aj.reducir.has(f) || aj.reducir.get(f) > px) { aj.reducir.set(f, px); nuevos++; } }
    }
    if (estructura.length && JSON.stringify([[...aj.saltos], [...aj.subir], [...aj.reducir]]) !== antes) {
      // Solo se borran los cortes de las páginas desde el primer cambio: lo de antes no se mueve.
      const desde = Math.min(...estructura.map((a) => a.pg == null ? 0 : a.pg));
      for (const id in aj.cortes) if (!(aj.cortePg[id] < desde)) { delete aj.cortes[id]; delete aj.cortePg[id]; }
      for (const a of arreglos.filter((x) => x.corte && x.pg < desde && !aj.vetos.has(String(x.corte[0])))) ponerCorte(a);
    }
    else if (estructura.length) for (const a of arreglos.filter((x) => x.corte && !aj.vetos.has(String(x.corte[0])))) { if (ponerCorte(a)) nuevos++; }
    if (!nuevos) break;
  }
  return { page, pasadas: pasadas + 1, pendientes: arreglos.length };
}

async function generarPdf(pub, formato) {
  const { render, titulo, autor } = await construirHtml(pub, formato);
  const c = await import('@sparticuz/chromium');
  const p = await import('puppeteer-core');
  const chromium = c.default || c, puppeteer = p.default || p;
  const browser = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true });
  try {
    const { page, pasadas, pendientes } = await paginar(browser, render);
    if (pendientes) console.log(`pdf: ${pendientes} arreglos tipográficos sin resolver tras ${pasadas} pasadas`);
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, timeout: 0 });
    return { pdf: Buffer.from(pdf), titulo, autor };
  } finally {
    await browser.close().catch(() => {});
  }
}

function nombreArchivo(titulo, autor, formato) {
  const limpio = (s) => String(s || '').replace(/[\/\\:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  let t = limpio(titulo) || 'Locus Mundi';
  if (t.length > 80) { t = t.slice(0, 80); const sp = t.lastIndexOf(' '); if (sp > 40) t = t.slice(0, sp); }
  const a = limpio(autor);
  return `${t}${a ? ' - ' + a : ''} (${formato}).pdf`;
}

async function guardar(historia, pdf) {
  const ruta = `${historia}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.pdf`;
  const r = await fetch(`${SB()}/storage/v1/object/${BUCKET}/${ruta}`, { method: 'POST', headers: cab({ 'Content-Type': 'application/pdf', 'x-upsert': 'false' }), body: pdf });
  if (!r.ok) throw new Error(`ALMACEN ${r.status} ${(await r.text()).slice(0, 200)}`);
  return ruta;
}
async function borrar(rutas) {
  if (!rutas.length) return;
  await fetch(`${SB()}/storage/v1/object/${BUCKET}`, { method: 'DELETE', headers: cab({ 'Content-Type': 'application/json' }), body: JSON.stringify({ prefixes: rutas }) }).catch(() => {});
}
async function enlace(ruta, nombre) {
  const r = await fetch(`${SB()}/storage/v1/object/sign/${BUCKET}/${ruta}`, { method: 'POST', headers: cab({ 'Content-Type': 'application/json' }), body: JSON.stringify({ expiresIn: MINUTOS_ENLACE * 60 }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.signedURL) throw new Error(`ENLACE ${r.status}`);
  return `${SB()}/storage/v1${d.signedURL}&download=${encodeURIComponent(nombre)}`;
}

// --- Entrada ----------------------------------------------------------------------------------------
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METODO' });
  const b = req.body || {};
  try {
    const autor = await autorDelToken(b.token);
    if (!autor) return res.status(401).json({ error: 'SESION' });
    const { historia, pub } = await libroDe(autor);
    const lang = pub ? String(pub.idioma_original || '').toUpperCase() : '';
    const disponible = !!pub && !SIN_PDF.includes(lang);

    if (b.accion === 'estado') {
      const e = historia ? await estadoCompra(historia, autor) : { comprado: false, quedan: 0, hoy: 0 };
      return res.status(200).json(Object.assign({ publicado: !!pub, disponible, max_dia: MAX_DIA }, e));
    }
    if (!pub) return res.status(409).json({ error: 'NO_PUBLICADO' });
    if (!disponible) return res.status(409).json({ error: 'NO_DISPONIBLE' });

    if (b.accion === 'comprar') {
      if (!PAGO_SIMULADO) return res.status(403).json({ error: 'PAGO_REAL' });
      await rest('pdf_compras', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ historia_id: historia, autor_id: autor, origen: 'simulado', descargas: DESCARGAS_POR_COMPRA }) });
      return res.status(200).json(Object.assign({ ok: true, publicado: true, disponible: true, max_dia: MAX_DIA }, await estadoCompra(historia, autor))); // v1.1: con publicado y disponible, como "estado"
    }

    if (b.accion === 'generar') {
      const formato = b.formato === 'A4' ? 'A4' : 'A5';
      const e = await estadoCompra(historia, autor);
      if (!e.comprado) return res.status(402).json({ error: 'SIN_COMPRA' });
      if (e.quedan <= 0) return res.status(429).json({ error: 'LIMITE_TOTAL', quedan: 0 });
      if (e.hoy >= MAX_DIA) return res.status(429).json({ error: 'LIMITE_DIA', quedan: e.quedan });
      const t0 = Date.now();
      const { pdf, titulo, autor: nombreAutor } = await generarPdf(pub, formato);
      const ruta = await guardar(historia, pdf);
      let quedan;
      try {
        quedan = await rest('rpc/apuntar_descarga_pdf', { method: 'POST', body: JSON.stringify({ p_historia: historia, p_formato: formato, p_ruta: ruta }) });
      } catch (err) {
        await borrar([ruta]); // no se apuntó: no se entrega
        const codigo = /LIMITE_TOTAL|LIMITE_DIA|SIN_COMPRA/.exec(err.message || '');
        return res.status(429).json({ error: codigo ? codigo[0] : 'APUNTAR' });
      }
      const nombre = nombreArchivo(titulo, nombreAutor, formato);
      console.log(`pdf: ${historia} ${formato} ${(pdf.length / 1e6).toFixed(1)} MB en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      return res.status(200).json({ url: await enlace(ruta, nombre), nombre, quedan });
    }
    return res.status(400).json({ error: 'ACCION' });
  } catch (e) {
    console.error('pdf:', e && e.stack || e);
    return res.status(500).json({ error: 'ERROR' });
  }
};

// Para api/diario.js: borra del almacén los PDF de más de 24 horas (y los que quedaron sin apuntar).
module.exports.limpiarPdf = async function limpiarPdf() {
  const r = await fetch(`${SB()}/storage/v1/object/list/${BUCKET}`, { method: 'POST', headers: cab({ 'Content-Type': 'application/json' }), body: JSON.stringify({ prefix: '', limit: 1000, sortBy: { column: 'created_at', order: 'asc' } }) });
  if (!r.ok) throw new Error(`lista ${r.status}`);
  const lista = await r.json();
  const limite = Date.now() - 24 * 3600 * 1000;
  const viejos = lista.filter((o) => o.name && o.created_at && new Date(o.created_at).getTime() < limite).map((o) => o.name);
  await borrar(viejos);
  const hace = new Date(limite).toISOString();
  await rest(`pdf_descargas?borrado=is.false&creado_en=lt.${hace}`, { method: 'PATCH', body: JSON.stringify({ borrado: true }) });
  return viejos.length;
};
module.exports.construirHtml = construirHtml; // para pruebas
module.exports.generarPdf = generarPdf;       // para pruebas
module.exports.paginar = paginar;             // para pruebas
module.exports.nombreArchivo = nombreArchivo; // para pruebas
module.exports.config = { maxDuration: 300 };
