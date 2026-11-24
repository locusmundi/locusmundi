// api/_paginas.js — Locus Mundi
// Versión 1.5 · 24/11/2026 · Al pasar a la dirección de la web (replaceState), se conservan «c» (canal) y
//  «regalar»: antes se perdían en /libro/<id>, /en y /ca, y las visitas etiquetadas no contaban (D14).
// Versión 1.4 · 23/11/2026 · /ca: Inicio en catalán para los buscadores (como /en), con hreflang ca en el
//  sitemap; la web pasa a /?lang=ca. inicioEn queda como inicioIdioma('en'), igual que antes.
// Versión 1.3 · 21/11/2026 · Versión de archivo para el PADICAT (Biblioteca de Catalunya). Continuidad,
//  sesión «20-21/11/2026 (PADICAT)». /archivo: índice de todo el fondo publicado; /archivo/<id>: el libro
//  completo, con sus fotos en su sitio, en HTML sencillo y SIN programación (el rastreador del PADICAT
//  no ejecuta JavaScript ni hace búsquedas). Usa lectura.js (las mismas reglas que la web y el PDF).
//  El índice se puede indexar; cada libro lleva «noindex» (los buscadores no muestran el texto
//  completo: Condiciones §2) y robots.txt cierra /archivo/ a los rastreadores de IA conocidos.
// Versión 1.2 · 18/11/2026 · /en: «read real stories» (antes «real lives») y og:description corta para WhatsApp
//  («You don't need to be a writer – just a life to tell.»); la meta description no cambia (d.ogDescripcion).
// Versión 1.1 · 15/11/2026 · El botón «Compartir» enlaza ya a /libro/<id>[?lang=xx] (index.html, [SEO-5]):
//  se conserva el idioma de lectura al pasar a /?libro=<id>&lang=xx. El #root se busca con «<main» (el
//  comentario [SEO-2] lleva dentro el antiguo) y el identificador se saca aunque traiga un signo pegado.
// Versión 1 · 15/11/2026 · Buscadores (SEO, paso 3). Continuidad, sesión «15/11/2026 (buscadores)».
// Páginas legibles sin programación, para Google y los rastreadores de IA (que no ejecutan JavaScript).
// Lo usa api/contador-historias.js (v10), sin función nueva: el plan Hobby de Vercel no admite una 13.ª.
// Rutas (vercel.json): /libro/<id> · /en · /ca · /sitemap.xml.
//  - Parte de index.html (el mismo de la web) y le cambia la cabecera (título, descripción, vista previa,
//    canónica, datos estructurados) y la pantalla de carga (#root), que React sustituye al arrancar.
//  - Antes de arrancar la web, history.replaceState lleva la dirección a la de siempre (/?libro=<id>,
//    /?lang=en), así que la web funciona exactamente igual.
//  - Libro: ficha (título, subtítulo, autor, año), extracto y el primer capítulo (decisión de Javier, B),
//    con un tope de 20 000 caracteres. Solo lo publicado (tabla `publicaciones`, de lectura pública).

const fs = require('fs');
const path = require('path');

const SITIO = 'https://www.locusmundi.com';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOPE_TEXTO = 20000;

let plantilla = null;
function leerPlantilla() {
  if (!plantilla) plantilla = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  return plantilla;
}

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const corta = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; };

// Etiquetas de la ficha, en el idioma del libro (si no está, en inglés).
const ETQ = {
  es: { vida: 'Historia de vida de', leer: 'Leer el libro completo en Locus Mundi', carga: 'Cargando Locus Mundi…' },
  gl: { vida: 'Historia de vida de', leer: 'Ler o libro completo en Locus Mundi', carga: 'Cargando Locus Mundi…' },
  ca: { vida: 'Història de vida de', leer: 'Llegir el llibre sencer a Locus Mundi', carga: 'Carregant Locus Mundi…' },
  en: { vida: 'Life story of', leer: 'Read the full book on Locus Mundi', carga: 'Loading Locus Mundi…' }
};

// ---- Piezas comunes ----------------------------------------------------------------------
// v1.5: script que lleva la dirección a la de la web conservando «c» (canal) y «regalar» de la de llegada.
// Antes: history.replaceState(null,"",<destino>+location.hash), que los perdía.
function scriptDireccion(destino) {
  return `<script>try{var q=new URLSearchParams(location.search),d=new URL(${JSON.stringify(destino)},location.origin);` +
    `["c","regalar"].forEach(function(k){if(q.has(k))d.searchParams.set(k,q.get(k))});` +
    `history.replaceState(null,"",d.pathname+d.search+location.hash)}catch(e){}</script>`;
}

function cambiarCabecera(html, d) {
  const meta = (atr, clave, valor) => {
    const re = new RegExp(`<meta ${atr}="${clave}" content="[^"]*"\\s*/?>`);
    const nueva = `<meta ${atr}="${clave}" content="${esc(valor)}"/>`;
    return re.test(html) ? (html = html.replace(re, nueva)) : (html = html.replace('</head>', nueva + '\n</head>'));
  };
  html = html.replace(/<html lang="[^"]*">/, `<html lang="${esc(d.lang)}">`);
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(d.titulo)}</title>`);
  meta('name', 'description', d.descripcion);
  meta('property', 'og:title', d.titulo);
  meta('property', 'og:description', d.ogDescripcion || d.descripcion);
  meta('property', 'og:type', d.ogTipo || 'website');
  meta('property', 'og:locale', d.locale);
  meta('property', 'og:url', d.url);
  if (d.altImagen) meta('property', 'og:image:alt', d.altImagen);
  if (d.imagen) {
    meta('property', 'og:image', d.imagen);
    html = html.replace(/<meta property="og:image:(width|height|alt)"[^>]*>\n?/g, '');
  }
  html = html.replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${esc(d.url)}"/>`);
  if (d.sinIdiomas) html = html.replace(/<link rel="alternate" hreflang="[^"]*"[^>]*>\n?/g, '');
  const extra = scriptDireccion(d.direccionWeb) + '\n' + // v1.5
    (d.datos ? `<script type="application/ld+json">${JSON.stringify(d.datos).replace(/</g, '\\u003c')}</script>\n` : '');
  return html.replace('</head>', extra + '</head>');
}

function cambiarRaiz(html, interior) {
  const i = html.indexOf('<div id="root"><main'); // el de verdad: el comentario [SEO-2] de index.html lleva dentro el #root antiguo
  const j = html.indexOf('</main></div>', i);
  if (i < 0 || j < 0) throw new Error('index.html sin #root reconocible');
  return html.slice(0, i) + '<div id="root">' + interior + '</main></div>' + html.slice(j + '</main></div>'.length);
}

const MAIN = '<main style="display:flex;align-items:center;justify-content:center;min-height:60vh;flex-direction:column;gap:0.9rem;text-align:center;padding:2rem 1.5rem;max-width:40rem;margin:0 auto">';
const CARGA = t => `<p style="display:flex;align-items:center;gap:0.5rem;font-family:Georgia,serif;color:#7A6248"><span class="sp" style="width:16px;height:16px"></span>${esc(t)}</p>\n`;

function enviarHtml(res, html, estado) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', estado === 200 ? 'public, s-maxage=600, stale-while-revalidate=86400' : 'no-store');
  return res.status(estado).send(html);
}

// ---- Inicio en inglés (/en) y en catalán (/ca, v1.4) ----------------------------------------
const INICIOS = {
  en: {
    locale: 'en_GB', altImagen: 'Locus Mundi logo: a figure holding an open book',
    titulo: 'Locus Mundi – Write your memoir, read real stories',
    ogDescripcion: "You don't need to be a writer – just a life to tell.",
    descripcion: "Write your memoir and publish it for free in an open library of real autobiographies. You don't need to be a writer – just to have a life to tell.",
    h1: 'Write and publish your autobiography',
    lema: 'You don\'t need to be a writer. Just have a life to tell.',
    texto: 'Locus Mundi is an open library of biographies, autobiographies and family memoirs. Write yours with your photos – you can also restore old photos – and publish it for free. Reading is free too. And complete your <a href="/arbol" style="color:var(--navy)">family tree for free</a>.',
    carga: 'Loading Locus Mundi…'
  },
  ca: { // v1.4
    locale: 'ca_ES', altImagen: 'Logotip de Locus Mundi: una figura que sosté un llibre obert',
    titulo: 'Locus Mundi – Escriu les teves memòries, llegeix històries reals',
    ogDescripcion: 'No cal ser escriptor: només tenir una vida per explicar.',
    descripcion: "Escriu les teves memòries i publica-les gratis en una biblioteca oberta d'autobiografies reals. No cal ser escriptor: només tenir una vida per explicar.",
    h1: 'Escriu i publica la teva autobiografia',
    lema: 'No cal ser escriptor. Només tenir una vida per explicar.',
    texto: "Locus Mundi és una biblioteca oberta de biografies, autobiografies i memòries familiars. Escriu la teva amb les teves fotos – també pots restaurar fotos antigues – i publica-la gratis. Llegir també és gratis. I completa el teu <a href=\"/arbol?lang=ca\" style=\"color:var(--navy)\">Arbre genealògic gratis</a>.",
    carga: 'Carregant Locus Mundi…'
  }
};
function inicioIdioma(res, idioma) {
  const d = INICIOS[idioma];
  let html = leerPlantilla();
  html = cambiarCabecera(html, {
    lang: idioma, locale: d.locale, url: `${SITIO}/${idioma}`, direccionWeb: `/?lang=${idioma}`,
    altImagen: d.altImagen, titulo: d.titulo, ogDescripcion: d.ogDescripcion, descripcion: d.descripcion
  });
  html = cambiarRaiz(html, MAIN + '\n' +
    `<h1 style="font-family:var(--serif);font-weight:600;font-size:1.9rem;color:var(--navy);line-height:1.2">${esc(d.h1)}</h1>\n` +
    `<p style="font-family:var(--serif);font-style:italic;font-size:1.2rem;color:var(--ink)">${esc(d.lema)}</p>\n` +
    `<p style="font-family:var(--body);color:var(--muted);line-height:1.5">${d.texto}</p>\n` +
    CARGA(d.carga));
  return enviarHtml(res, html, 200);
}

// ---- Libro (/libro/<id>) -----------------------------------------------------------------
async function leerPublicaciones(url, llave, filtro, columnas) {
  const r = await fetch(`${url}/rest/v1/publicaciones?select=${columnas}${filtro}`, {
    headers: { apikey: llave, Authorization: `Bearer ${llave}` }
  });
  if (!r.ok) throw new Error(`publicaciones: ${r.status}`);
  return r.json();
}

// Texto del libro a HTML sencillo: ¶ capítulo (h2), § apartado (h3), *cursiva*, sin marcas de foto.
function primerCapitulo(texto) {
  const t = String(texto || '').replace(/\r/g, '');
  const trozos = t.split(/\n(?=¶)/);
  let fuera = '';
  for (const tr of trozos) { // lo de antes del primer capítulo (dedicatoria, cita) y el primer capítulo
    fuera += (fuera ? '\n' : '') + tr;
    if (/^\s*¶/.test(tr)) break;
  }
  if (fuera.length > TOPE_TEXTO) {
    const corte = fuera.lastIndexOf('\n\n', TOPE_TEXTO);
    fuera = fuera.slice(0, corte > TOPE_TEXTO / 2 ? corte : TOPE_TEXTO) + '\n\n…';
  }
  const linea = s => esc(s).replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  return fuera.split(/\n{2,}/).map(p => p.replace(/\[FOTO[^\]]*\]/g, '').trim()).filter(Boolean).map(p => {
    if (p.startsWith('¶')) return `<h2 style="font-family:var(--serif);color:var(--navy);font-size:1.3rem">${linea(p.replace(/^¶\s*/, ''))}</h2>`;
    if (p.startsWith('§')) return `<h3 style="font-family:var(--serif);font-size:1.1rem">${linea(p.replace(/^§\s*/, ''))}</h3>`;
    return `<p>${p.split('\n').map(linea).join('<br>')}</p>`;
  }).join('\n');
}

async function libro(res, id, url, llave, idioma0) {
  const conIdioma = /^[a-z]{2}(-[a-z]{2})?$/i.test(String(idioma0 || '')) ? `&lang=${String(idioma0).toLowerCase()}` : '';
  const m = String(id || '').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i); // aunque traiga pegado un punto u otro signo
  if (m) id = m[0];
  let html = leerPlantilla();
  const filas = UUID_RE.test(id)
    ? await leerPublicaciones(url, llave, `&historia_id=eq.${id.toLowerCase()}`,
      'historia_id,titulo,contenido,idioma_original,portada_url,fecha_publicacion,fecha_actualizacion,extracto,extracto_elegido')
    : [];
  const p = filas && filas[0];
  if (!p) { // no existe o ya no está publicado: la web de siempre dirá «no encontrado»
    html = html.replace('</head>', `<meta name="robots" content="noindex"/>\n${scriptDireccion(`/?libro=${esc(id)}${conIdioma}`)}\n</head>` /* v1.5 */);
    return enviarHtml(res, html, 404);
  }
  const c = p.contenido || {};
  const idioma = String(p.idioma_original || c.lang || 'ES').toLowerCase().split('-')[0];
  const e = ETQ[idioma] || ETQ.en;
  const nombre = c.name || '';
  const nacido = parseInt(c.born) || 0;
  const titulo = p.titulo || c.title || nombre;
  const quien = `${e.vida} ${nombre}${nacido ? ` (${nacido})` : ''}`;
  const extracto = p.extracto_elegido || p.extracto || '';
  const enlace = `${SITIO}/libro/${p.historia_id}`;

  html = cambiarCabecera(html, {
    lang: idioma, locale: ({ es: 'es_ES', ca: 'ca_ES', gl: 'gl_ES', en: 'en_GB' })[idioma] || idioma, url: enlace, direccionWeb: `/?libro=${p.historia_id}${conIdioma}`,
    titulo: `${titulo} – ${nombre} · Locus Mundi`,
    descripcion: corta(`${quien}. ${c.subtitle ? c.subtitle + '. ' : ''}${extracto}`, 160),
    ogTipo: 'book', imagen: p.portada_url || '', sinIdiomas: true,
    datos: {
      '@context': 'https://schema.org', '@type': 'Book',
      name: titulo, url: enlace, inLanguage: idioma,
      author: { '@type': 'Person', name: nombre, ...(nacido ? { birthDate: String(nacido) } : {}) },
      ...(c.subtitle ? { alternativeHeadline: c.subtitle } : {}),
      ...(p.portada_url ? { image: p.portada_url } : {}),
      ...(extracto ? { abstract: extracto } : {}),
      genre: 'Autobiography', bookFormat: 'https://schema.org/EBook', isAccessibleForFree: true,
      datePublished: String(p.fecha_publicacion || '').slice(0, 10),
      ...(p.fecha_actualizacion ? { dateModified: String(p.fecha_actualizacion).slice(0, 10) } : {}),
      publisher: { '@type': 'Organization', name: 'Locus Mundi', url: SITIO }
    }
  });
  html = cambiarRaiz(html, MAIN.replace('text-align:center', 'text-align:left') + '\n<article lang="' + esc(idioma) + '" style="font-family:var(--body);color:var(--ink);line-height:1.6;display:flex;flex-direction:column;gap:0.8rem">\n' +
    `<h1 style="font-family:var(--serif);font-weight:600;font-size:1.9rem;color:var(--navy);line-height:1.2;text-align:center">${esc(titulo)}</h1>\n` +
    (c.subtitle ? `<p style="font-family:var(--serif);font-style:italic;font-size:1.15rem;text-align:center">${esc(c.subtitle)}</p>\n` : '') +
    `<p style="text-align:center;color:var(--muted)">${esc(quien)}</p>\n` +
    primerCapitulo(c.text) + '\n' +
    `<p style="text-align:center"><a href="/?libro=${p.historia_id}" style="color:var(--navy)">${esc(e.leer)}</a></p>\n</article>\n` +
    CARGA(e.carga));
  return enviarHtml(res, html, 200);
}

// ---- sitemap.xml -------------------------------------------------------------------------
async function mapa(res, url, llave) {
  const filas = await leerPublicaciones(url, llave, '&order=fecha_publicacion.asc', 'historia_id,fecha_publicacion,fecha_actualizacion');
  const dia = f => String(f || '').slice(0, 10);
  const alt = `<xhtml:link rel="alternate" hreflang="es" href="${SITIO}/"/><xhtml:link rel="alternate" hreflang="en" href="${SITIO}/en"/><xhtml:link rel="alternate" hreflang="ca" href="${SITIO}/ca"/><xhtml:link rel="alternate" hreflang="x-default" href="${SITIO}/"/>`;
  const urls = [
    `<url><loc>${SITIO}/</loc>${alt}</url>`,
    `<url><loc>${SITIO}/en</loc>${alt}</url>`,
    `<url><loc>${SITIO}/ca</loc>${alt}</url>`, // v1.4
    `<url><loc>${SITIO}/arbol</loc></url>`,
    `<url><loc>${SITIO}/archivo</loc></url>`, // v1.3
    ...filas.map(f => `<url><loc>${SITIO}/libro/${f.historia_id}</loc><lastmod>${dia(f.fecha_actualizacion || f.fecha_publicacion)}</lastmod></url>`)
  ];
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`);
}

// ---- Versión de archivo (/archivo, /archivo/<id>) ------------------------------------------
// Página propia, sin index.html ni React: lo que llega es lo que se conserva.
function hojaArchivo(d) {
  return `<!DOCTYPE html>
<html lang="${esc(d.lang)}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(d.titulo)}</title>
<meta name="robots" content="${d.indexar ? 'index, follow' : 'noindex, follow'}"/>
<link rel="canonical" href="${esc(d.url)}"/>
<link rel="icon" type="image/png" sizes="32x32" href="/icono-32.png"/>
<style>
a{color:#1B355E}
body{margin:0;background:#F6EFE2;color:#2B2118;font-family:Georgia,'Times New Roman',serif;line-height:1.6}
.hoja{max-width:42rem;margin:0 auto;padding:2rem 1.25rem 4rem}
.marca{font-size:.85rem;letter-spacing:.12em;text-transform:uppercase;color:#7A6248;text-align:center;margin:0 0 2rem}
.marca a{color:inherit}
h1{font-size:2rem;line-height:1.2;text-align:center;color:#1B355E;margin:.5rem 0}
h2{font-size:1.35rem;color:#1B355E;margin:2.5rem 0 1rem;text-align:center}
h2 small{display:block;font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;color:#7A6248}
h3{font-size:1.1rem;margin:1.8rem 0 .6rem}
.sub{font-style:italic;text-align:center;font-size:1.15rem;margin:0}
.autor{text-align:center;color:#7A6248;margin:.4rem 0 1.5rem}
.dedic{font-style:italic;text-align:center;white-space:pre-line;margin:2rem 0}
figure{margin:1.5rem 0;text-align:center}
img{max-width:100%;height:auto}
figcaption{font-size:.9rem;font-style:italic;color:#7A6248;margin-top:.4rem}
.verso{white-space:pre-line}
.nota{font-size:.85rem;color:#7A6248;border-top:1px solid #D8C8A8;margin-top:3rem;padding-top:1rem}
ol.fondo{padding-left:1.5rem} ol.fondo li{margin:.7rem 0}
</style>
</head>
<body>
<div class="hoja">
<p class="marca"><a href="/">Locus Mundi</a> · <a href="/archivo">Archivo</a></p>
${d.cuerpo}
</div>
</body>
</html>
`;
}

const fechaCorta = f => String(f || '').slice(0, 10);

async function archivoIndice(res, url, llave) {
  const filas = await leerPublicaciones(url, llave, '&order=fecha_publicacion.asc',
    'historia_id,titulo,contenido->>name,contenido->>born,contenido->>subtitle,idioma_original,fecha_publicacion');
  const items = filas.map(f => {
    const nacido = parseInt(f.born) || 0;
    return `<li lang="${esc(String(f.idioma_original || 'es').toLowerCase().split('-')[0])}"><a href="/archivo/${f.historia_id}">${esc(f.titulo || f.name || '')}</a>` +
      (f.subtitle ? `. <i>${esc(f.subtitle)}</i>` : '') +
      `<br/>${esc(f.name || '')}${nacido ? ` (${nacido})` : ''} · ${esc(String(f.idioma_original || '').toUpperCase())} · ${fechaCorta(f.fecha_publicacion)}</li>`;
  }).join('\n');
  const html = hojaArchivo({
    lang: 'es', indexar: true, url: `${SITIO}/archivo`,
    titulo: 'Archivo de Locus Mundi – Todos los libros publicados',
    cuerpo: `<h1>Archivo de Locus Mundi</h1>\n<p class="sub">Todos los libros publicados, en versión de archivo</p>\n` +
      `<p class="autor">${filas.length} ${filas.length === 1 ? 'libro' : 'libros'}</p>\n<ol class="fondo">\n${items}\n</ol>\n` +
      `<p class="nota">Versión sencilla de cada libro, con su texto completo y sus fotografías, para su conservación en archivos públicos. Para leerlos con todas las funciones, <a href="/">www.locusmundi.com</a>.</p>`
  });
  return enviarHtml(res, html, 200);
}

async function archivoLibro(res, id, url, llave) {
  const m = String(id || '').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  const filas = m ? await leerPublicaciones(url, llave, `&historia_id=eq.${m[0].toLowerCase()}`,
    'historia_id,titulo,contenido,idioma_original,portada_url,fecha_publicacion,fecha_actualizacion') : [];
  const p = filas && filas[0];
  if (!p) return enviarHtml(res, hojaArchivo({ lang: 'es', url: `${SITIO}/archivo`, titulo: 'Archivo de Locus Mundi',
    cuerpo: '<h1>Libro no encontrado</h1>\n<p class="sub"><a href="/archivo">Ver todos los libros</a></p>' }), 404);
  const L = require('../lectura.js');
  const c = p.contenido || {};
  const LANG = String(p.idioma_original || c.lang || 'ES').toUpperCase();
  const idioma = LANG.toLowerCase().split('-')[0];
  const nombre = c.name || '';
  const nacido = parseInt(c.born) || 0;
  const titulo = p.titulo || c.title || nombre;
  const linea = trozos => trozos.map(x => x.cursiva ? `<i>${esc(x.texto)}</i>` : esc(x.texto)).join('');
  const partes = [];
  for (const b of L.bloquesLectura(c.text, c.fotos || [], LANG)) {
    if (!b) continue;
    if (b.tipo === 'foto') {
      partes.push(`<figure><img src="${esc(b.foto.url)}" alt="${esc(b.foto.pie_foto || '')}" loading="lazy"/>` +
        (b.foto.pie_foto ? `<figcaption>${esc(b.foto.pie_foto)}</figcaption>` : '') + '</figure>');
    } else if (b.tipo === 'capitulo') {
      partes.push(`<h2>${b.etiqueta ? `<small>${esc(b.etiqueta)}</small>` : ''}${esc(b.titulo)}</h2>`);
    } else if (b.tipo === 'apartado') {
      partes.push(`<h3>${esc(b.texto)}</h3>`);
    } else {
      const t = linea(b.trozos);
      if (!t.trim()) continue;
      partes.push(/\n/.test(t.trim()) ? `<p class="verso">${t.trim()}</p>` : `<p>${t}</p>`);
    }
  }
  const dedic = String(c.dedication || '').replace(/\r\n?/g, '\n').replace(/\n{2,}/g, '\n').trim();
  const html = hojaArchivo({
    lang: idioma, url: `${SITIO}/archivo/${p.historia_id}`,
    titulo: `${titulo} – ${nombre} · Archivo de Locus Mundi`,
    cuerpo: `<article lang="${esc(idioma)}">\n` +
      (p.portada_url ? `<figure><img src="${esc(p.portada_url)}" alt=""/></figure>\n` : '') +
      `<h1>${esc(titulo)}</h1>\n` + (c.subtitle ? `<p class="sub">${esc(c.subtitle)}</p>\n` : '') +
      `<p class="autor">${esc(nombre)}${nacido ? ` (${nacido})` : ''}</p>\n` +
      (dedic ? `<p class="dedic">${esc(dedic)}</p>\n` : '') +
      partes.join('\n') + '\n</article>\n' +
      `<p class="nota">Versión de archivo del libro publicado en Locus Mundi el ${fechaCorta(p.fecha_publicacion)}` +
      (p.fecha_actualizacion ? ` (última actualización: ${fechaCorta(p.fecha_actualizacion)})` : '') +
      `. Leer en el lector: <a href="${SITIO}/libro/${p.historia_id}">${SITIO}/libro/${p.historia_id}</a>. <a href="/archivo">Todos los libros</a>.</p>`
  });
  return enviarHtml(res, html, 200);
}

// ---- Entrada -----------------------------------------------------------------------------
module.exports = async function paginas(req, res, url, llave) {
  const q = req.query || {};
  try {
    if (q.pagina === 'en' || q.pagina === 'ca') return inicioIdioma(res, q.pagina); // v1.4: antes, solo en
    if (q.pagina === 'libro') return await libro(res, String(q.id || ''), url, llave, q.lang);
    if (q.pagina === 'sitemap') return await mapa(res, url, llave);
    if (q.pagina === 'archivo') return q.id ? await archivoLibro(res, String(q.id), url, llave) : await archivoIndice(res, url, llave); // v1.3
    return res.status(404).end();
  } catch (err) {
    console.error('paginas:', err.message);
    // Si algo falla, la web de siempre (sin la ficha): el lector no nota nada.
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (q.pagina === 'archivo') return res.status(500).send('<!DOCTYPE html><meta charset="utf-8"><p>Archivo no disponible ahora mismo. Vuelva a intentarlo más tarde.</p>'); // v1.3
    const id = UUID_RE.test(String(q.id || '')) ? String(q.id) : '';
    let html = leerPlantilla();
    if (id) html = html.replace('</head>', scriptDireccion(`/?libro=${id}${/^[a-z]{2}(-[a-z]{2})?$/i.test(String(q.lang || '')) ? '&lang=' + String(q.lang).toLowerCase() : ''}`) + '\n</head>'); // v1.5
    return res.status(q.pagina === 'sitemap' ? 500 : 200).send(html);
  }
};
