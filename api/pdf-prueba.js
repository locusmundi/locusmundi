// api/pdf-prueba.js — Locus Mundi
// PRUEBA TEMPORAL · v2 · 19/10/2026 (v2: Chrome y puppeteer con import(), no require()) · Fase B2, punto 14 (conversación 12). Se BORRA tras la prueba.
// Comprueba en Vercel que Chrome sin pantalla + Paged.js + las fuentes funcionan, y cuánto tardan,
// con un libro real de `publicaciones` (por defecto, el Nº 2, Olegario). Solo lee datos ya públicos.
// Uso: /api/pdf-prueba (cifras)  ·  /api/pdf-prueba?pdf=1 (el PDF, si cabe en 4,5 MB)  ·  ?n=1..4 (otro libro)

const fs = require('fs');
const path = require('path');
// Chrome y puppeteer son módulos ES: en Vercel no se pueden cargar con require(), solo con import().
async function piezas() {
  const c = await import('@sparticuz/chromium');
  const p = await import('puppeteer-core');
  return { chromium: c.default || c, puppeteer: p.default || p };
}

const NM = path.join(process.cwd(), 'node_modules');
const leer = (r, cod) => fs.readFileSync(path.join(NM, r), cod);
const fuente = (familia, archivo, peso, estilo) =>
  `@font-face{font-family:'${familia}';font-weight:${peso};font-style:${estilo};src:url(data:font/woff2;base64,${leer(archivo).toString('base64')}) format('woff2');}`;

function fuentesCss() {
  const f = [];
  for (const sub of ['latin', 'latin-ext', 'cyrillic']) {
    f.push(fuente('EB Garamond', `@fontsource/eb-garamond/files/eb-garamond-${sub}-400-normal.woff2`, 400, 'normal'));
    f.push(fuente('EB Garamond', `@fontsource/eb-garamond/files/eb-garamond-${sub}-400-italic.woff2`, 400, 'italic'));
    f.push(fuente('Playfair Display', `@fontsource/playfair-display/files/playfair-display-${sub}-400-normal.woff2`, 400, 'normal'));
  }
  return f.join('\n');
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cursivas = (s) => esc(s).replace(/\*([^*\n]+)\*/g, '<em>$1</em>');

function cuerpo(c) {
  const fotos = {};
  (c.fotos || []).forEach((f) => { fotos[f.orden] = f; });
  return String(c.text || '').split(/\n\s*\n/).map((b) => {
    const t = b.trim();
    if (!t) return '';
    if (t.startsWith('¶')) return `<h2 class="cap">${cursivas(t.slice(1).trim())}</h2>`;
    if (t.startsWith('§')) return `<h3>${cursivas(t.slice(1).trim())}</h3>`;
    const m = t.match(/^\[FOTO (\d+)\]$/);
    if (m) { const f = fotos[+m[1]]; return f && f.url ? `<figure><img src="${esc(f.url)}"><figcaption>${cursivas(f.pie_foto || '')}</figcaption></figure>` : ''; }
    return `<p>${t.split('\n').map(cursivas).join('<br>')}</p>`;
  }).join('\n');
}

module.exports = async function handler(req, res) {
  const t = { inicio: Date.now() };
  let browser;
  try {
    const n = Math.min(4, Math.max(1, parseInt(req.query.n, 10) || 2));
    const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/publicaciones?numero_autor=eq.${n}&select=titulo,contenido,idioma_original`, {
      headers: { apikey: llave, Authorization: `Bearer ${llave}` },
    });
    const [pub] = await r.json();
    if (!pub) return res.status(404).json({ error: 'no hay libro' });
    t.datos = Date.now();

    const paged = leer('pagedjs/dist/paged.polyfill.min.js', 'utf8');
    const html = `<!doctype html><html lang="${String(pub.idioma_original || 'es').toLowerCase()}"><head><meta charset="utf-8"><style>
${fuentesCss()}
@page{size:A5;margin:20mm 18mm 22mm;@bottom-center{content:counter(page);font-family:'EB Garamond';font-size:10pt}}
@page:blank{@bottom-center{content:none}}
body{font-family:'EB Garamond',serif;font-size:11pt;line-height:1.35}
h2.cap{font-family:'Playfair Display',serif;font-weight:400;break-before:right;margin:25mm 0 10mm}
h3{font-family:'Playfair Display',serif;font-weight:400;break-after:avoid}
p{widows:2;orphans:2;text-align:justify;hyphens:auto;margin:0;text-indent:1.2em}
figure{break-inside:avoid;margin:4mm 0;text-align:center}img{max-width:100%;max-height:120mm}
figcaption{font-size:9.5pt;font-style:italic}
</style><script>window.PagedConfig={auto:true,after:()=>{window.__listo=true}}</script><script>${paged}</script></head>
<body><h1 style="font-family:'Playfair Display';break-after:page">${esc(pub.titulo)}</h1>${cuerpo(pub.contenido)}</body></html>`;

    const { chromium, puppeteer } = await piezas();
    browser = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true });
    t.chrome = Date.now();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 120000 });
    t.cargado = Date.now();
    await page.waitForFunction('window.__listo === true', { timeout: 240000, polling: 500 });
    t.maquetado = Date.now();
    const paginas = await page.evaluate(() => document.querySelectorAll('.pagedjs_page').length);
    const fuentes = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family + ' ' + f.style));
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, timeout: 0 });
    t.pdf = Date.now();

    if (req.query.pdf === '1' && pdf.length < 4.4e6) {
      res.setHeader('Content-Type', 'application/pdf');
      return res.status(200).send(Buffer.from(pdf));
    }
    const s = (a, b) => ((t[b] - t[a]) / 1000).toFixed(1) + ' s';
    return res.status(200).json({
      libro: pub.titulo, paginas, megas: (pdf.length / 1e6).toFixed(1),
      tiempos: { datos: s('inicio', 'datos'), arranque_chrome: s('datos', 'chrome'), carga_y_fotos: s('chrome', 'cargado'), maquetacion: s('cargado', 'maquetado'), pdf: s('maquetado', 'pdf'), total: s('inicio', 'pdf') },
      fuentes: [...new Set(fuentes)],
      memoria_mb: Math.round(process.memoryUsage().rss / 1e6),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message, segundos: ((Date.now() - t.inicio) / 1000).toFixed(1) });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
};
