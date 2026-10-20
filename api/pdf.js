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
//   20/10 (2): corte viejo que dejaba media página en blanco (A4 de Irene, p. 14): se corre o se
//   quita; corte en punto de partición silábica, con su guion (no cambia la maqueta); foto de media
//   página o más con una línea en blanco de más arriba y abajo (figure.grande).
// Versión 1.3 · 20/10/2026 · Paginación más simple y robusta (propuesta de Javier, conversación 12-2):
//   A5: cada foto, sola en su página (lámina), sin número y con su pie, justo después de la página
//   del texto donde la puso el Autor; el texto no se corta (la lámina puede ir en medio de un párrafo).
//   A4: la foto, en su sitio o, si no cabe, arriba de la página siguiente (sin rellenar su hueco).
//   Viuda: la página anterior acaba una línea antes (o el párrafo entero, si allí solo quedaban dos).
//   Apartado: en página nueva si no cabe con su primer párrafo (o dos líneas de él).
//   COMPROBACIÓN FINAL (maquetarLibro, VERIFICAR): todo el texto de cada párrafo, ninguna línea fuera
//   de su caja (también la columna oculta de Paged.js, donde se perdían líneas), ningún signo raro,
//   todas las fotos y apartados. Si falla, otra vez sin partición silábica; si vuelve a fallar, error
//   (no se entrega ni cuenta la descarga).
// Versión 1.4 · 20/10/2026 · El texto se maqueta una sola vez y el libro se MONTA sobre esa misma
//   maqueta (planLibro, __montar): portadas, blancas para empezar en impar (A5), dedicatoria, láminas
//   detrás de la página de su foto, colofón y folios, que se ponen al final. Así lo que se mide es lo
//   que se imprime (antes, las láminas se calculaban en una maqueta y se imprimían en otra: p. 37 y
//   páginas en blanco con número de Olegario). La comprobación final mira también la composición:
//   ninguna página vacía, folios correctos, ninguna página corta sin motivo, A5 con páginas pares.
// Versión 2 · 20/10/2026 · SIN PAGED.JS (perdía o escondía líneas y metía signos raros al partir
//   párrafos; cada arreglo obligaba a repaginar). Paginación propia de una sola pasada: Chrome compone
//   cada capítulo en una columna del ancho de la caja (con la partición silábica); se mide dónde empieza
//   cada línea; paginarLibro corta las páginas línea a línea con las reglas (viuda, huérfana, apartado con
//   su texto, foto, fin de capítulo) y cada trozo se imprime exactamente como se midió. El montaje
//   (planLibro) y la comprobación final, como en la 1.4; sin modo seguro (ya no hace falta). Azul de la
//   web en el título de la portada y en los títulos de capítulo. 6 a 9 s para 230-290 páginas (antes, 35-70).
//   20/10 (2): A4, foto con una línea en blanco arriba y abajo; nunca justo bajo el título de un apartado
//   (va delante del título).
//   Pendiente: quitar pagedjs de package.json y de vercel.json (ya no se usa; no estorba).
// ARCHIVO IMPRIMIBLE (PDF) del libro PUBLICADO del Autor (tabla `publicaciones`, nunca el borrador).
// Estrategia: Continuidad, sesión "19/10/2026 (conversación 11: PDF, estrategia)"; formato:
// LOCUS_MUNDI_FORMATO_IMPRESION.md v2. Chrome sin pantalla (@sparticuz/chromium), en
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

async function construirHtml(pub, formato, opciones) {
  opciones = opciones || {};
  const c = pub.contenido || {};
  const lang = String(pub.idioma_original || 'ES').toUpperCase();
  const silabas = opciones.sinSilabas ? (t) => t : partidor(lang); // v1.3: modo seguro, sin partición
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
    // Punto de partición silábica (la línea acababa con guion): se corta ahí y el trozo lleva su guion.
    for (const d of [0, 1, -1]) { const k = o + d; if (k > 0 && k < texto.length && texto[k - 1] === SHY) return k; }
    // v1.2: si cae dentro de una palabra (línea partida con guion), la palabra entera pasa al trozo
    // siguiente: nunca se corta una palabra en un cambio de página (el "banq□uete" del A4 de Irene).
    for (let k = o - 1; k > 0 && k > o - 40; k--) if (/\s/.test(texto[k - 1]) && !/\s/.test(texto[k])) return k;
    return o;
  };
  const firmaHtml = (trozos) => htmlTrozos(trozos, 0, trozos.map((x) => x.t).join('').length).replace(/^\s+|\s+$/g, '');
  const figuras = {};
  for (const sec of secciones) for (const el of sec.cuerpo) {
    if (el.tipo === 'fig') figuras[el.id] = el;
    if (el.tipo === 'p') el.texto = el.trozos.map((x) => x.t).join('');
  }
  const A5 = formato === 'A5';

  // v2: cada sección (preliminares o capítulo) como lista de elementos, en orden. Lo que antes
  // dependía del vecino en la hoja de estilo (sin sangría tras un título, sin margen tras un título)
  // va como clase fija: así el elemento se compone igual al medir y al imprimir, aunque cambie de sitio.
  secciones.forEach((sec, i) => {
    sec.i = i;
    sec.items = [];
    if (sec.cap) sec.items.push({ t: 'header' });
    let previo = sec.cap ? 'titulo' : 'inicio';
    for (const el of sec.cuerpo) {
      if (el.tipo === 'h3') {
        sec.items.push({ t: 'h3', el, clase: [previo === 'titulo' && sec.items.length === 1 ? 'tras-cab' : '', el.firma ? 'con-firma' : ''].filter(Boolean).join(' ') });
        if (el.firma) sec.items.push({ t: 'firma', el });
        previo = 'titulo';
      } else if (el.tipo === 'fig') {
        // A4 (20/10): una foto nunca justo debajo del título de un apartado: va delante del título.
        let pos = sec.items.length;
        if (!A5) while (pos > 0 && ['h3', 'firma'].includes(sec.items[pos - 1].t)) pos--;
        if (!A5 && pos < sec.items.length && sec.items[pos].t === 'h3') {
          sec.items.splice(pos, 0, { t: 'fig', el });
          const h = sec.items[pos + 1]; if (h.clase) h.clase = h.clase.replace('tras-cab', '').trim(); // ya no va tras el capítulo
          continue;
        }
        sec.items.push({ t: A5 ? 'marca' : 'fig', el });
        if (!A5) previo = 'foto';
      } else {
        const tras = previo === 'titulo' || previo === 'foto' || previo === 'inicio';
        sec.items.push({ t: 'p', el, clase: [el.clase, tras ? 'sin-sangria' : '', el.clase && previo === 'titulo' ? 'tras-titulo' : ''].filter(Boolean).join(' ') });
        previo = 'p';
      }
    }
  });

  const titulo = pub.titulo || c.title || '';
  const autor = c.name || '';
  const subtitulo = c.subtitle || '';
  const logo = fs.readFileSync(path.join(process.cwd(), 'logo_locus_mundi_fondo_blanco.png')).toString('base64');
  const fechaColofon = colofonFecha(pub.fecha_actualizacion, lang, (c.pubCity || '').trim());

  // Medidas (mm y pt). A5: libro (márgenes de espejo); A4: documento. "alto": caja de texto.
  const M = A5
    ? { tam: 'A5', ancho: 148, altoPag: 210, arriba: 17, abajo: 20, dentro: 19, fuera: 15, cuerpo: 11, linea: 1.38, img: 120, imgPx: 1400, portadaImg: 95, alto: 210 - 37, logo: 13 }
    : { tam: 'A4', ancho: 210, altoPag: 297, arriba: 25, abajo: 25, dentro: 28, fuera: 28, cuerpo: 13, linea: 1.4, img: 150, imgPx: 2000, portadaImg: 150, alto: 297 - 50, logo: 16 };
  const caja = M.ancho - M.dentro - M.fuera; // ancho de la caja de texto (mm)
  const L1 = `${(M.cuerpo * M.linea).toFixed(2)}pt`; // una línea en blanco
  const L2 = `${(2 * M.cuerpo * M.linea).toFixed(2)}pt`;
  const AZUL = '#1B3A6B'; // el de la web (Biblioteca): título de portada y títulos de capítulo
  const css = `${fuentesCss()}
@page { size: ${M.tam}; margin: 0; }
html { font-family: 'EB Garamond', serif; font-size: ${M.cuerpo}pt; line-height: ${M.linea}; color: #111; }
body { margin: 0; }
p { margin: 0; text-align: justify; text-indent: 1.2em; hyphens: manual; }
p.sin-sangria, p.sigue { text-indent: 0; }
p.corta { text-align-last: justify; }
em { font-style: italic; }
.cap-cab { margin: ${A5 ? 22 : 30}mm 0 ${A5 ? 9 : 12}mm; text-align: center; }
.cap-etq { font-family: 'Playfair Display', serif; font-size: ${M.cuerpo - 1.5}pt; letter-spacing: 0.18em; text-transform: uppercase; color: ${AZUL}; margin-bottom: 3mm; }
h2 { font-family: 'Playfair Display', serif; font-weight: 400; font-size: ${A5 ? 16 : 19}pt; line-height: 1.25; margin: 0; color: ${AZUL}; }
.firma-cap { font-size: ${M.cuerpo}pt; margin-top: ${L1}; }
h3 { font-family: 'Playfair Display', serif; font-weight: 400; font-style: italic; font-size: ${M.cuerpo + 1.5}pt; line-height: 1.3; margin: ${L2} 0 ${L1}; text-align: left; }
h3.tras-cab { margin-top: 0; }
h3.con-firma { margin-bottom: 0; }
.firma { margin: 0 0 ${L1}; text-align: left; }
p.verso, p.cita { text-align: left; text-align-last: auto; text-indent: 0; margin: ${L1} 0; }
p.verso.tras-titulo, p.cita.tras-titulo { margin-top: 0; }
p.verso.corta, p.cita.corta { margin-bottom: 0; }
p.verso.sigue, p.cita.sigue { margin-top: 0; }
figure { margin: calc(${L1} + 1mm) 0; text-align: center; } /* 20/10: una línea en blanco entre foto y texto */
figure.grande { margin: calc(${L1} + 5mm) 0; }
figure img { max-width: 100%; max-height: ${M.img}mm; }
figcaption { font-size: ${M.cuerpo - 1.5}pt; font-style: italic; line-height: 1.3; margin-top: 2mm; text-align: center; }
.marca { height: 0; margin: 0; padding: 0; }
section.col { width: ${caja}mm; margin-bottom: 40mm; display: flow-root; }
/* Hojas del libro: cada una, una página; las de texto llevan su caja y su folio. */
.hoja { width: ${M.ancho}mm; height: ${M.altoPag}mm; box-sizing: border-box; padding: ${M.arriba}mm ${M.fuera}mm ${M.abajo}mm ${M.dentro}mm; break-after: page; overflow: hidden; position: relative; background: white; }
.hoja:last-child { break-after: auto; }
.hoja.izq { padding-left: ${M.fuera}mm; padding-right: ${M.dentro}mm; }
.hoja.der { padding-left: ${M.dentro}mm; padding-right: ${M.fuera}mm; }
section.caja { width: ${caja}mm; height: ${M.alto}mm; display: flow-root; }
.folio { position: absolute; bottom: ${(M.abajo / 2 - 2).toFixed(1)}mm; left: ${M.dentro}mm; right: ${M.fuera}mm; text-align: center; font-size: ${M.cuerpo - 1}pt; color: #222; line-height: 1; }
.hoja.izq .folio { left: ${M.fuera}mm; right: ${M.dentro}mm; }
.dedic-caja, .colofon-caja { height: ${M.alto - 8}mm; display: flex; flex-direction: column; justify-content: center; text-align: center; }
.dedic-caja p { text-align: center; text-indent: 0; }
figure.lamina { margin: 0; height: ${M.alto - 8}mm; display: flex; flex-direction: column; justify-content: center; align-items: center; }
figure.lamina img { max-width: 100%; max-height: ${M.alto - 30}mm; }
.portada { text-align: center; }
.portada h1 { font-family: 'Playfair Display', serif; font-weight: 400; font-size: ${A5 ? 22 : 28}pt; line-height: 1.2; margin: 0; }
.portada.completa h1 { color: ${AZUL}; }
.solo-titulo { padding-top: 55mm; }
.pc-texto { height: ${A5 ? 58 : 85}mm; padding-top: ${A5 ? 8 : 15}mm; box-sizing: border-box; }
.pc-autor { font-size: ${M.cuerpo + 2}pt; letter-spacing: 0.06em; margin-bottom: 6mm; }
.pc-sub { font-style: italic; font-size: ${M.cuerpo + 1.5}pt; margin-top: 4mm; }
.pc-img img { max-width: 100%; max-height: ${M.portadaImg}mm; }
.colofon { text-align: center; font-size: ${M.cuerpo - 1}pt; }
.colofon img { width: ${M.logo}mm; display: block; margin: 0 auto 5mm; }
.colofon div { margin-top: 2mm; }`;

  // En el navegador: reducir las imágenes a calidad de imprenta y medir cada elemento y cada línea.
  const guion = `
const ESCALAR = ${M.imgPx};
async function escalar(img){
  await (img.decode ? img.decode().catch(()=>{}) : null);
  const w=img.naturalWidth, h=img.naturalHeight; if(!w||!h) return;
  const k=Math.min(1, ESCALAR/Math.max(w,h)); if(k>=1 && img.src.startsWith('data:image/jpeg')) return;
  const cv=document.createElement('canvas'); cv.width=Math.round(w*k); cv.height=Math.round(h*k);
  const cx=cv.getContext('2d'); cx.fillStyle='#fff'; cx.fillRect(0,0,cv.width,cv.height); cx.drawImage(img,0,0,cv.width,cv.height);
  img.src=cv.toDataURL('image/jpeg',0.86); await (img.decode ? img.decode().catch(()=>{}) : null);
}
// Principio (posición en el texto del párrafo; un salto de línea <br> cuenta 1) de cada línea.
function inicios(p){
  const out=[]; let pos=0, arriba=-1e9; const lh=parseFloat(getComputedStyle(p).lineHeight);
  const w=document.createTreeWalker(p, NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT); const r=document.createRange();
  while(w.nextNode()){ const n=w.currentNode;
    if(n.nodeType===1){ if(n.tagName==='BR') pos+=1; continue; }
    for(let i=0;i<n.length;i++){ r.setStart(n,i); r.setEnd(n,i+1);
      // La última caja con anchura (tras un corte por sílabas, la primera puede quedar al final de la línea anterior).
      const rs=[...r.getClientRects()].filter((q)=>q.width>0); const rc=rs[rs.length-1];
      if(rc && rc.top>arriba+lh/2){ out.push(pos); arriba=rc.top; } pos++; } }
  return out;
}
window.__medir = async function(){
  await document.fonts.ready;
  await Promise.all([...document.querySelectorAll('img[data-escalar]')].map(escalar));
  // Foto de media página o más: figure.grande (una línea en blanco de más arriba y abajo).
  const MM=96/25.4, ANCHO=${caja}*MM, ALTO=${M.alto}*MM, MAXH=${M.img}*MM, grandes=[];
  for(const f of document.querySelectorAll('section.col figure')){ const im=f.querySelector('img'); if(!im||!im.naturalWidth) continue;
    const h=Math.min(MAXH, ANCHO*im.naturalHeight/im.naturalWidth, im.naturalHeight); if(h>=ALTO/2){ f.classList.add('grande'); grandes.push(Number(f.getAttribute('data-f'))); } }
  const srcs={}; for(const im of document.querySelectorAll('img[data-id]')) srcs[im.getAttribute('data-id')]=im.src;
  const secs=[...document.querySelectorAll('section.col')].map((sc)=>[...sc.children].map((e)=>{
    const cs=getComputedStyle(e), r=e.getBoundingClientRect();
    const o={ h:r.height, mt:parseFloat(cs.marginTop)||0, mb:parseFloat(cs.marginBottom)||0 };
    if(e.tagName==='P'){ o.lh=parseFloat(cs.lineHeight); o.ini=inicios(e); }
    return o; }));
  return { secs, grandes, srcs, H: ${M.alto}*MM };
};`;
  const cabeza = `<!doctype html><html lang="${ETIQUETA_IDIOMA[lang] || 'es'}"><head><meta charset="utf-8"><style>${css}</style><script>${guion}</script></head><body>`;

  // HTML de cada elemento. Un párrafo puede ir entero o en un trozo (de "a" a "z" en su texto, siempre
  // en principio de línea): el trozo que corta lleva su última línea justificada y, si la línea
  // acababa partida por sílabas, su guion; el que sigue, sin sangría ni margen de arriba.
  const cabeceraHtml = (sec) => `<header class="cap-cab">${sec.cap.etiqueta ? `<div class="cap-etq">${esc(sec.cap.etiqueta)}</div>` : ''}${sec.cap.titulo ? `<h2>${esc(sec.cap.titulo)}</h2>` : ''}${sec.firmaCap ? `<div class="firma-cap">${firmaHtml(sec.firmaCap)}</div>` : ''}</header>`;
  const conSrc = (html, id, srcs) => (srcs && srcs[id] ? html.replace(/src="[^"]*"/, `src="${srcs[id]}"`) : html.replace('<img ', `<img data-id="${id}" `));
  const itemHtml = (sec, it, trozo, srcs, grandes, arriba) => {
    const st = arriba && it.t !== 'header' ? ' style="margin-top:0"' : '';
    if (it.t === 'header') return cabeceraHtml(sec);
    if (it.t === 'h3') return `<h3 data-h="${it.el.id}"${it.clase ? ` class="${it.clase}"` : ''}${st}>${esc(it.el.texto)}</h3>`;
    if (it.t === 'firma') return `<div class="firma"${st}>${firmaHtml(it.el.firma)}</div>`;
    if (it.t === 'marca') return `<div class="marca" data-f="${it.el.id}"></div>`;
    if (it.t === 'fig') return `<figure data-f="${it.el.id}"${grandes && grandes.includes(it.el.id) ? ' class="grande"' : ''}${st}>${conSrc(it.el.html, 'f' + it.el.id, srcs)}</figure>`;
    const texto = it.el.texto;
    const a = trozo ? trozo.a : 0, z = trozo ? trozo.z : texto.length;
    let fin = z; while (fin > a && (texto[fin - 1] === '\n' || texto[fin - 1] === SHY)) fin--;
    let h = htmlTrozos(it.el.trozos, a, fin);
    if (z < texto.length && texto[z - 1] === SHY) h += '-'; // el mismo guion (y el mismo ancho) que pone Chrome al partir por sílabas
    const cls = [it.clase, a > 0 ? 'sigue' : '', z < texto.length ? 'corta' : ''].filter(Boolean).join(' ');
    return `<p data-p="${it.el.id}"${cls ? ` class="${cls}"` : ''}${st}>${h}</p>`;
  };
  // Documento para medir: cada sección en una columna del ancho de la caja, entera; y aparte (oculta)
  // la portada y las fotos de las láminas del A5, solo para reducirlas.
  const htmlMedida = () => `${cabeza}<div style="display:none">${portada ? `<img data-escalar data-id="portada" src="${portada}"/>` : ''}${A5 ? Object.values(figuras).map((f) => conSrc(f.html, 'f' + f.id)).join('') : ''}</div>
${secciones.map((sec) => `<section class="cap col" data-cap="${sec.i}">${sec.items.map((it) => itemHtml(sec, it)).join('')}</section>`).join('\n')}</body></html>`;

  // Piezas sueltas (hojas sin número), con las imágenes ya reducidas.
  const piezas = (srcs) => ({
    portadilla: `<div class="portada solo-titulo"><h1>${esc(titulo)}</h1></div>`,
    portada: `<div class="portada completa"><div class="pc-texto"><div class="pc-autor">${esc(autor)}</div><h1>${esc(titulo)}</h1>${subtitulo ? `<div class="pc-sub">${esc(subtitulo)}</div>` : ''}</div>${portada ? `<div class="pc-img"><img src="${srcs.portada || portada}" alt=""/></div>` : ''}</div>`,
    dedicatorias: dedicatorias.map((el) => `<div class="dedic-caja"><p>${firmaHtml(el.trozos)}</p></div>`),
    colofon: `<div class="colofon"><div class="colofon-caja"><img src="data:image/png;base64,${logo}" alt=""/><div>${esc(fechaColofon)}</div><div>${esc(LEYENDA[lang] || LEYENDA.ES)}</div></div></div>`,
    lamina: (f) => `<figure class="lamina" data-f="${f}">${conSrc(figuras[f].html, 'f' + f, srcs)}</figure>`,
  });
  // El libro entero: cada hoja del plan, en orden.
  const htmlLibro = (plan, paginas, med) => {
    const pz = piezas(med.srcs);
    const hojas = plan.map((it) => {
      if (it.texto == null) return `<div class="hoja ${it.lado}">${it.hoja}</div>`;
      const pg = paginas[it.texto], sec = secciones[pg.sec];
      const cuerpo = pg.items.map((x, k) => itemHtml(sec, sec.items[x.k], x.trozo, med.srcs, med.grandes, k === 0)).join('');
      return `<div class="hoja texto ${it.lado}"><section class="cap caja${sec.cap ? '' : ' preliminar'}" data-cap="${sec.i}">${cuerpo}</section><div class="folio">${it.n}</div></div>`;
    });
    return `${cabeza}${hojas.join('\n')}</body></html>`;
  };

  // Lo que debe salir en el PDF, para la comprobación final (solo letras y cifras).
  const limpio = (t) => String(t).replace(/[^\p{L}\p{N}]/gu, '');
  const esperado = {};
  for (const sec of secciones) for (const el of sec.cuerpo) if (el.tipo === 'p') esperado[el.id] = limpio(el.texto);
  return {
    titulo, autor, A5, secciones, piezas, htmlMedida, htmlLibro, esperado,
    nFiguras: Object.keys(figuras).length,
    nApartados: secciones.reduce((n, sec) => n + sec.cuerpo.filter((el) => el.tipo === 'h3').length, 0),
  };
}

// v2: PAGINACIÓN PROPIA, de una sola pasada, sobre lo medido (sin Paged.js). Por sección (cada una en
// página nueva), elemento a elemento, línea a línea:
//  - Párrafo: caben "c" líneas. Viuda (quedaría 1 sola línea para la página siguiente): una menos.
//    Huérfana (1 sola línea aquí): el párrafo entero a la siguiente. El resto sigue en la página nueva.
//  - Apartado (con su firma): solo si cabe con lo que le sigue (2 líneas, o el párrafo si tiene 3 o
//    menos, o la foto entera); si no, a la página siguiente.
//  - Foto (A4): entera; si no cabe, arriba de la página siguiente. Nunca en la primera página de un
//    capítulo: pasa a la siguiente y el texto que la sigue llena esa primera página.
//  - Marca de foto (A5): no ocupa; dice en qué página va su lámina.
//  - Fin de capítulo: al menos 3 líneas en su última página (la anterior cede líneas).
//  - Arriba de página, sin margen de arriba (salvo el título de capítulo).
function paginarLibro(libro, med) {
  const H = med.H + 0.5;
  const paginas = [];
  libro.secciones.forEach((sec, si) => {
    const m = med.secs[si];
    let limites = {};
    for (let intento = 0; intento < 4; intento++) {
      const pags = paginarSeccion(sec, m, H, limites);
      // Fin de capítulo con menos de 3 líneas en su última página: la anterior cede las que falten.
      const ult = pags[pags.length - 1];
      const lin = (x) => (x.trozo ? x.trozo.n : (m[x.k].ini || []).length);
      if (pags.length > 1 && ult.items.length && ult.items.every((x) => sec.items[x.k].t === 'p')) {
        const t = ult.items.reduce((s, x) => s + lin(x), 0);
        const pri = ult.items[0], ant = pags[pags.length - 2].items.slice(-1)[0];
        if (t < 3 && pri.trozo && pri.trozo.a > 0 && ant && ant.k === pri.k && ant.trozo) {
          const nuevo = ant.trozo.n - (3 - t);
          if (nuevo >= 2) { limites = Object.assign({}, limites, { [`${ant.k}@${ant.trozo.a}`]: nuevo }); continue; }
        }
      }
      pags.forEach((p) => paginas.push(Object.assign(p, { sec: si })));
      break;
    }
  });
  return paginas;
}

function paginarSeccion(sec, m, H, limites) {
  const items = sec.items;
  const pags = [];
  let pg = null, y = 0, ultReal = null; // ultReal: último elemento con altura colocado en la página
  const nueva = () => { pg = { items: [], marcas: [] }; pags.push(pg); y = 0; ultReal = null; };
  const hueco = (k) => (ultReal == null ? 0 : Math.max(m[ultReal].mb, m[k].mt)); // márgenes que se juntan
  const poner = (k, alto, trozo) => { y += hueco(k) + alto; pg.items.push({ k, trozo }); ultReal = k; };
  const lineas = (k) => m[k].ini.length;
  const lh = (k) => m[k].lh;
  // Lo que necesita, como mínimo, lo que sigue a un título (índice del siguiente elemento con altura).
  const siguiente = (k) => { let j = k + 1; while (items[j] && items[j].t === 'marca') j++; return items[j] ? j : null; };
  const minimo = (j) => {
    if (j == null) return 0;
    if (items[j].t === 'p') return Math.min(lineas(j) <= 3 ? lineas(j) : 2, lineas(j)) * lh(j);
    if (items[j].t === 'fig') return m[j].h;
    return 0;
  };
  const pendientes = []; // fotos que no pueden ir en la primera página del capítulo
  const primeraDelCap = () => sec.cap && pags.length === 1;
  const nuevaConPendientes = () => { nueva(); while (pendientes.length) { const f = pendientes.shift(); poner(f, m[f].h); } };
  nueva();
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    if (it.t === 'header') { y = m[k].mt + m[k].h; pg.items.push({ k }); ultReal = k; continue; }
    if (it.t === 'marca') { pg.marcas.push({ f: it.el.id, arriba: !pg.items.length }); pg.items.push({ k }); continue; }
    if (it.t === 'fig') {
      if (primeraDelCap()) { pendientes.push(k); continue; }
      if (pg.items.some((x) => items[x.k].t !== 'marca') && y + hueco(k) + m[k].h > H) nuevaConPendientes();
      poner(k, m[k].h); continue;
    }
    if (it.t === 'h3') {
      const fin = items[k + 1] && items[k + 1].t === 'firma' ? k + 1 : k;
      const altoTit = fin > k ? m[k].h + Math.max(m[k].mb, m[fin].mt) + m[fin].h : m[k].h;
      const j = siguiente(fin);
      const tras = j == null ? 0 : (items[j].t === 'p' || items[j].t === 'fig' ? Math.max(m[fin].mb, m[j].mt) : 0) + minimo(j);
      if (ultReal != null && y + hueco(k) + altoTit + tras > H) {
        nuevaConPendientes();
      }
      poner(k, m[k].h);
      if (fin > k) { poner(fin, m[fin].h); k = fin; }
      continue;
    }
    // Párrafo, entero o por trozos.
    const ini = m[k].ini, n = ini.length, l = lh(k);
    let desde = 0; // línea por la que va
    for (;;) {
      const resto = n - desde;
      const disp = H - y - hueco(k);
      let c = Math.floor((disp + 0.5) / l);
      if (ultReal == null) c = Math.max(c, 1); // página vacía: algo tiene que caber
      const clave = `${k}@${ini[desde]}`;
      if (limites[clave] != null) c = Math.min(c, limites[clave]);
      if (c >= resto) { poner(k, resto * l, desde ? { a: ini[desde], z: Infinity, n: resto } : null); break; } // cabe (lo que queda)
      if (resto - c === 1) c--;          // viuda
      if (c === 1 && ultReal != null) c = 0; // huérfana
      if (c <= 0) {
        // No cabe ninguna línea: si lo de arriba en esta página es solo un título, se va con el párrafo.
        if (ultReal != null && desde === 0) {
          let r = pg.items.length - 1; while (r >= 0 && ['h3', 'firma', 'marca'].includes(items[pg.items[r].k].t)) r--;
          const titulo = pg.items.slice(r + 1);
          if (titulo.some((x) => items[x.k].t === 'h3') && r >= 0) {
            pg.items.length = r + 1;
            nuevaConPendientes();
            for (const x of titulo) { if (items[x.k].t === 'marca') { pg.marcas.push({ f: items[x.k].el.id, arriba: !pg.items.length }); pg.items.push(x); } else poner(x.k, m[x.k].h); }
            continue;
          }
        }
        nuevaConPendientes(); continue;
      }
      poner(k, c * l, { a: ini[desde], z: ini[desde + c], n: c });
      desde += c;
      nuevaConPendientes();
    }
  }
  if (pendientes.length) { nueva(); while (pendientes.length) { const f = pendientes.shift(); poner(f, m[f].h); } }
  // Los trozos que llegan al final del párrafo: z = Infinity → longitud del texto.
  for (const p of pags) for (const x of p.items) if (x.trozo && x.trozo.z === Infinity) x.trozo.z = items[x.k].el.texto.length;
  return pags.filter((p) => p.items.length);
}

// v1.4: el plan del libro, página a página. A5: portadilla (1), blanca, portada (3), blanca,
// dedicatoria(s) en impar, cada capítulo en impar (blanca sin número si hace falta), cada lámina
// detrás de la página de su foto, colofón en impar y blanca final. A4: portadilla, blanca, portada,
// dedicatoria(s) o blanca (4), texto y colofón. Solo llevan número las páginas de texto.
function planLibro(info, piezas, A5) {
  const plan = [];
  const lado = () => (A5 ? ((plan.length + 1) % 2 ? 'der' : 'izq') : 'der');
  const hoja = (html) => plan.push({ hoja: html || '', lado: lado() });
  const impar = () => { if (A5 && (plan.length + 1) % 2 === 0) hoja(''); };
  hoja(piezas.portadilla); hoja(''); hoja(piezas.portada);
  if (A5) { hoja(''); for (const d of piezas.dedicatorias) { impar(); hoja(d); } }
  else if (piezas.dedicatorias.length) for (const d of piezas.dedicatorias) hoja(d); else hoja('');
  // Láminas: en la página de su marca (o en la anterior, si la marca abre página); páginas vacías fuera.
  const tras = info.map(() => []);
  let ultima = -1;
  info.forEach((pg, i) => {
    for (const mc of pg.marcas) {
      const dest = (mc.arriba && ultima >= 0 && info[ultima].cap === pg.cap) || (pg.vacia && ultima >= 0) ? ultima : i;
      tras[dest].push(mc.f);
    }
    if (!pg.vacia) ultima = i;
  });
  let capAnt = null;
  info.forEach((pg, i) => {
    if (pg.vacia) return;
    if (pg.cap !== capAnt) impar();
    capAnt = pg.cap;
    plan.push({ texto: i, n: plan.length + 1, lado: lado() });
    for (const f of tras[i]) hoja(piezas.lamina(f));
  });
  impar(); hoja(piezas.colofon); if (A5) hoja('');
  return plan;
}

// Comprobación final, sobre el libro ya montado, antes de entregar. GRAVES (no se entrega): todo el
// texto de cada párrafo (letras y cifras, trozos juntos), ninguna línea fuera de su caja, ningún signo
// raro, todas las fotos y apartados, ninguna página de texto vacía, folios correctos, A5 con páginas
// pares. LEVES (se avisa en el registro): viudas y páginas cortas sin motivo (más de 4 líneas libres
// al pie, seguidas de texto del mismo capítulo que no empieza por apartado ni foto).
const VERIFICAR = `(() => {
  const limpio = (t) => String(t).replace(/[^\\p{L}\\p{N}]/gu, '');
  const textos = {};
  for (const e of document.querySelectorAll('section.caja > p[data-p]')) { const id = e.getAttribute('data-p'); textos[id] = (textos[id] || '') + limpio(e.textContent); }
  let fuera = 0; const donde = [], comp = [], leves = [];
  const hojas = [...document.querySelectorAll('.hoja')];
  const pags = hojas.filter((h) => h.matches('.texto'));
  const num = (pg) => hojas.indexOf(pg) + 1;
  for (const pg of pags) {
    const a = pg.querySelector('section.caja'); const r = a.getBoundingClientRect();
    for (const e of a.children) {
      const q = e.getBoundingClientRect(); if (q.height && (q.bottom > r.bottom + 2 || q.top < r.top - 2)) { fuera++; donde.push((e.getAttribute('data-p') || e.tagName) + '@' + num(pg)); }
      if (e.matches('p')) { const rg = document.createRange(); rg.selectNodeContents(e);
        for (const l of rg.getClientRects()) if (l.width && (l.bottom > r.bottom + 2 || l.right > r.right + 4 || l.left < r.left - 4)) { fuera++; donde.push('L' + e.getAttribute('data-p') + '@' + num(pg)); break; } }
    }
  }
  const lh = parseFloat(getComputedStyle(document.querySelector('section.caja p') || document.body).lineHeight) || 20;
  const elems = (pg) => [...pg.querySelectorAll('section.caja > *')].filter((e) => !e.matches('.marca') && (e.matches('figure') || e.textContent.trim()));
  pags.forEach((pg, k) => {
    const els = elems(pg);
    if (!els.length) comp.push('página ' + num(pg) + ' vacía');
    const f = pg.querySelector('.folio'); if (!f || f.textContent !== String(num(pg))) comp.push('folio de la página ' + num(pg));
    const sig = pags[k + 1]; if (!sig || !els.length) return;
    const ult = els[els.length - 1], pri = elems(sig)[0]; if (!pri) return;
    if (pri.matches('p') && ult.matches('p') && pri.getAttribute('data-p') === ult.getAttribute('data-p') && Math.round(pri.getBoundingClientRect().height / lh) < 2) leves.push('viuda arriba de la página ' + num(sig));
    if (ult.closest('section').getAttribute('data-cap') !== pri.closest('section').getAttribute('data-cap') || pri.matches('h3, .firma, figure, header')) return;
    const libre = pg.querySelector('section.caja').getBoundingClientRect().bottom - ult.getBoundingClientRect().bottom;
    if (libre > 4.5 * lh) leves.push('página ' + num(pg) + ' corta (' + Math.round(libre / lh) + ' líneas)');
  });
  const raros = (document.body.innerText.match(/[\\u2011\\uFFFD]/g) || []).length;
  const marcasTitulo = [...document.querySelectorAll('h2, h3')].filter((h) => /[*_]/.test(h.textContent)).length;
  return { textos, fuera, donde, comp, leves, raros, marcasTitulo, total: hojas.length,
    figuras: document.querySelectorAll('figure img').length,
    apartados: new Set([...document.querySelectorAll('section.caja > h3')].map((h) => h.getAttribute('data-h'))).size };
})()`;
async function verificar(page, libro) {
  const v = await page.evaluate(VERIFICAR);
  const fallos = [];
  for (const id in libro.esperado) if ((v.textos[id] || '') !== libro.esperado[id]) fallos.push('texto ' + id);
  if (v.fuera) fallos.push('fuera de caja: ' + v.fuera + ' (' + v.donde.slice(0, 4).join(', ') + ')');
  if (v.raros) fallos.push('signos raros: ' + v.raros);
  if (v.figuras !== libro.nFiguras) fallos.push('fotos ' + v.figuras + '/' + libro.nFiguras);
  if (v.apartados !== libro.nApartados) fallos.push('apartados ' + v.apartados + '/' + libro.nApartados);
  fallos.push(...v.comp);
  if (libro.A5 && v.total % 2) fallos.push('número impar de páginas');
  if (v.marcasTitulo) console.log(`pdf: ${v.marcasTitulo} títulos con * o _ (revisar el texto)`);
  return { ok: !fallos.length, graves: fallos, leves: v.leves, total: v.total };
}

// Maqueta el libro: mide, pagina, monta y comprueba. Con un fallo grave, error: no se entrega nada
// ni cuenta la descarga.
async function maquetarLibro(browser, pub, formato) {
  const libro = await construirHtml(pub, formato);
  const page = await browser.newPage();
  await page.emulateMediaType('print');
  await page.setContent(libro.htmlMedida(), { waitUntil: 'load', timeout: 120000 });
  const med = await page.evaluate(() => window.__medir());
  const paginas = paginarLibro(libro, med);
  const info = paginas.map((p) => ({ cap: p.sec, marcas: p.marcas, vacia: !p.items.some((x) => libro.secciones[p.sec].items[x.k].t !== 'marca') }));
  const plan = planLibro(info, libro.piezas(med.srcs), libro.A5);
  await page.setContent(libro.htmlLibro(plan, paginas, med), { waitUntil: 'load', timeout: 120000 });
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => (i.decode ? i.decode().catch(() => {}) : null))); });
  const v = await verificar(page, libro);
  if (!v.ok) { console.error(`pdf: comprobación fallida (${formato}): ${v.graves.slice(0, 8).join('; ')}`); const e = new Error('VERIFICACION'); if (process.env.PDF_DEPURAR) e.page = page; else await page.close().catch(() => {}); throw e; }
  if (v.leves.length) console.log(`pdf: avisos (${formato}): ${v.leves.slice(0, 8).join('; ')}`);
  return { page, titulo: libro.titulo, autor: libro.autor, paginas: v.total, leves: v.leves };
}

async function generarPdf(pub, formato) {
  const c = await import('@sparticuz/chromium');
  const p = await import('puppeteer-core');
  const chromium = c.default || c, puppeteer = p.default || p;
  const browser = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true });
  try {
    const { page, titulo, autor } = await maquetarLibro(browser, pub, formato);
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
module.exports.maquetarLibro = maquetarLibro; // para pruebas
module.exports.paginarLibro = paginarLibro;   // para pruebas
module.exports.nombreArchivo = nombreArchivo; // para pruebas
module.exports.config = { maxDuration: 300 };
