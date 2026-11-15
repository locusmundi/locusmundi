// api/_paginas.js — Locus Mundi
// Versión 1 · 15/11/2026 · Buscadores (SEO, paso 3). Continuidad, sesión «15/11/2026 (buscadores)».
// Páginas legibles sin programación, para Google y los rastreadores de IA (que no ejecutan JavaScript).
// Lo usa api/contador-historias.js (v10), sin función nueva: el plan Hobby de Vercel no admite una 13.ª.
// Rutas (vercel.json): /libro/<id> · /en · /sitemap.xml.
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
  meta('property', 'og:description', d.descripcion);
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
  const extra = `<script>try{history.replaceState(null,"",${JSON.stringify(d.direccionWeb)}+location.hash)}catch(e){}</script>\n` +
    (d.datos ? `<script type="application/ld+json">${JSON.stringify(d.datos).replace(/</g, '\\u003c')}</script>\n` : '');
  return html.replace('</head>', extra + '</head>');
}

function cambiarRaiz(html, interior) {
  const i = html.indexOf('<div id="root">');
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

// ---- Inicio en inglés (/en) ----------------------------------------------------------------
function inicioEn(res) {
  let html = leerPlantilla();
  html = cambiarCabecera(html, {
    lang: 'en', locale: 'en_GB', url: `${SITIO}/en`, direccionWeb: '/?lang=en',
    altImagen: 'Locus Mundi logo: a figure holding an open book',
    titulo: 'Locus Mundi – Write your memoir, read real lives',
    descripcion: "Write your memoir and publish it for free in an open library of real autobiographies. You don't need to be a writer – just to have a life to tell."
  });
  html = cambiarRaiz(html, MAIN + '\n' +
    '<h1 style="font-family:var(--serif);font-weight:600;font-size:1.9rem;color:var(--navy);line-height:1.2">Write and publish your autobiography</h1>\n' +
    '<p style="font-family:var(--serif);font-style:italic;font-size:1.2rem;color:var(--ink)">You don\'t need to be a writer. Just have a life to tell.</p>\n' +
    '<p style="font-family:var(--body);color:var(--muted);line-height:1.5">Locus Mundi is an open library of biographies, autobiographies and family memoirs. Write yours with your photos – you can also restore old photos – and publish it for free. Reading is free too. And complete your <a href="/arbol" style="color:var(--navy)">family tree for free</a>.</p>\n' +
    CARGA('Loading Locus Mundi…'));
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

async function libro(res, id, url, llave) {
  const m = String(id || '').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i); // aunque traiga pegado un punto u otro signo
  if (m) id = m[0];
  let html = leerPlantilla();
  const filas = UUID_RE.test(id)
    ? await leerPublicaciones(url, llave, `&historia_id=eq.${id.toLowerCase()}`,
      'historia_id,titulo,contenido,idioma_original,portada_url,fecha_publicacion,fecha_actualizacion,extracto,extracto_elegido')
    : [];
  const p = filas && filas[0];
  if (!p) { // no existe o ya no está publicado: la web de siempre dirá «no encontrado»
    html = html.replace('</head>', `<meta name="robots" content="noindex"/>\n<script>try{history.replaceState(null,"","/?libro=${esc(id)}")}catch(e){}</script>\n</head>`);
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
    lang: idioma, locale: ({ es: 'es_ES', ca: 'ca_ES', gl: 'gl_ES', en: 'en_GB' })[idioma] || idioma, url: enlace, direccionWeb: `/?libro=${p.historia_id}`,
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
  const alt = `<xhtml:link rel="alternate" hreflang="es" href="${SITIO}/"/><xhtml:link rel="alternate" hreflang="en" href="${SITIO}/en"/><xhtml:link rel="alternate" hreflang="x-default" href="${SITIO}/"/>`;
  const urls = [
    `<url><loc>${SITIO}/</loc>${alt}</url>`,
    `<url><loc>${SITIO}/en</loc>${alt}</url>`,
    `<url><loc>${SITIO}/arbol</loc></url>`,
    ...filas.map(f => `<url><loc>${SITIO}/libro/${f.historia_id}</loc><lastmod>${dia(f.fecha_actualizacion || f.fecha_publicacion)}</lastmod></url>`)
  ];
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`);
}

// ---- Entrada -----------------------------------------------------------------------------
module.exports = async function paginas(req, res, url, llave) {
  const q = req.query || {};
  try {
    if (q.pagina === 'en') return inicioEn(res);
    if (q.pagina === 'libro') return await libro(res, String(q.id || ''), url, llave);
    if (q.pagina === 'sitemap') return await mapa(res, url, llave);
    return res.status(404).end();
  } catch (err) {
    console.error('paginas:', err.message);
    // Si algo falla, la web de siempre (sin la ficha): el lector no nota nada.
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    const id = UUID_RE.test(String(q.id || '')) ? String(q.id) : '';
    let html = leerPlantilla();
    if (id) html = html.replace('</head>', `<script>try{history.replaceState(null,"","/?libro=${id}")}catch(e){}</script>\n</head>`);
    return res.status(q.pagina === 'sitemap' ? 500 : 200).send(html);
  }
};
