// api/moderar.js — Locus Mundi
// Versión 1 · 06/10/2026 · Nuevo. Primera subida de las dos versiones de cada libro, SIN IA.
// Diseño: LOCUS_MUNDI_DISENO_MODERACION.md v6, §2, §11.2, §11.4, §11.6 y §11.8 (decisiones
// 2, 3, 7 y 9; añadidos: anotación LSSI y lista cerrada de lo que se copia).
// La v2 (segunda subida) añadirá la revisión con IA de texto e imágenes, los límites
// diarios, el fusible y las operaciones revisarImagen, consultar y error.
//
// Operación (POST, JSON):
//   subir {token, historia_id}  → "Subir a la Biblioteca"
// Respuestas:
//   200 {ok, nueva, fecha_publicacion, fecha_actualizacion}
//   400 PETICION_NO_VALIDA · FALTAN_DATOS (nombre, texto o país) · DIRECCION_NO_VALIDA
//   401 SIN_SESION · 404 NO_ENCONTRADA · 405 · 500 ERROR
//
// Qué hace "subir", por este orden:
//   1. Comprueba la sesión y que el libro es del Autor y no está marcado para eliminar.
//   2. Lee de Supabase lo que el Autor escribe (nunca lo que envíe el navegador).
//   3. Comprueba que la portada y cada foto están en nuestro almacén y en la carpeta de
//      ese libro ({autor}/{historia}/); si no, no publica.
//   4. Prepara la copia: solo lo que usa la lectura (decisión 9) y la lista de fotos.
//   5. Publica de una sola vez con la función publicar_historia de Supabase (decisión 7).
//   6. Anota la subida en registro_gasto (coste 0) y la publicación en registro_lssi.
//   7. Limpia: traducciones de tramos que ya no existen y archivos que ya no usa nadie.
//      La limpieza nunca tumba la subida: un fallo se anota y se limpia la vez siguiente.
//
// Variables de entorno (Vercel): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

const { huellasVigentes } = require('./_tramos'); // compartido con api/traducir.js
const almacen = require('./_almacen');            // compartido con api/foto-editor.js

// ─── Constantes ─────────────────────────────────────────────────────────

const BUCKET = almacen.BUCKET;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MARGEN_LIMPIEZA_MS = 60 * 60 * 1000; // una hora (diseño v6, §11.4)

// Decisión 9: lo único del contenido del editor que se copia a lo publicado (lo que usan
// la lectura, rowToAuto en index.html, y api/traducir.js). Añadir un campo es a propósito.
const CAMPOS_PUBLICADOS = [
  'name', 'born', 'country', 'lang', 'title', 'subtitle', 'text',
  'pubCity', 'pubProfession', 'pubConcept'
];

// ─── Supabase (REST, sin librerías) ─────────────────────────────────────

const SUPA_URL = () => process.env.SUPABASE_URL;

function cabeceras(extra) {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', ...(extra || {}) };
}

async function autorDeLaSesion(token) {
  if (!token || typeof token !== 'string') return null;
  const r = await fetch(`${SUPA_URL()}/auth/v1/user`, {
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` }
  });
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  return u && u.id ? u.id : null;
}

async function leer(ruta) {
  const r = await fetch(`${SUPA_URL()}/rest/v1/${ruta}`, { headers: cabeceras() });
  if (!r.ok) throw new Error(`leer ${ruta.split('?')[0]}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function insertar(tabla, fila) {
  const r = await fetch(`${SUPA_URL()}/rest/v1/${tabla}`, {
    method: 'POST',
    headers: cabeceras({ Prefer: 'return=minimal' }),
    body: JSON.stringify(fila)
  });
  if (!r.ok) throw new Error(`insertar ${tabla}: ${r.status} ${await r.text()}`);
}

// ─── Direcciones del almacén (reglas en api/_almacen.js) ────────────────

const rutaDeDireccion = d => almacen.rutaDeDireccion(d, SUPA_URL());
const esDeLaCarpeta = (d, carpeta) => almacen.esDeLaCarpeta(d, carpeta, SUPA_URL());

// ─── Subir ──────────────────────────────────────────────────────────────

async function subir(body, autorId, ip, res) {
  const historiaId = String(body.historia_id || '');
  if (!UUID.test(historiaId)) return res.status(400).json({ error: 'PETICION_NO_VALIDA' });

  // 1 y 2. Lo que el Autor escribe, leído aquí.
  const h = (await leer(
    `historias?id=eq.${historiaId}` +
    `&select=id,autor_id,titulo,contenido,portada_url,idioma_original,marcado_borrado&limit=1`
  ))[0];
  if (!h || h.autor_id !== autorId || h.marcado_borrado === true) {
    return res.status(404).json({ error: 'NO_ENCONTRADA' });
  }
  if (!UUID.test(String(h.autor_id))) return res.status(404).json({ error: 'NO_ENCONTRADA' });
  const c = h.contenido || {};
  if (!String(c.name || '').trim() || !String(c.text || '').trim() || !String(c.country || '').trim()) {
    return res.status(400).json({ error: 'FALTAN_DATOS' });
  }

  const fotos = (await leer(
    `fotos?historia_id=eq.${historiaId}&url=not.is.null&select=id,orden,url,pie_foto`
  )).sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));

  // 3. Direcciones: solo de nuestro almacén y de la carpeta de este libro.
  const carpeta = `${h.autor_id}/${h.id}`;
  if (h.portada_url && !esDeLaCarpeta(h.portada_url, carpeta)) {
    return res.status(400).json({ error: 'DIRECCION_NO_VALIDA', que: 'portada' });
  }
  for (const f of fotos) {
    if (!esDeLaCarpeta(f.url, carpeta)) {
      return res.status(400).json({ error: 'DIRECCION_NO_VALIDA', que: 'foto', orden: f.orden });
    }
  }

  // 4. La copia: lista cerrada de campos y la lista de fotos.
  const contenido = {};
  for (const k of CAMPOS_PUBLICADOS) if (c[k] !== undefined) contenido[k] = c[k];
  contenido.fotos = fotos.map(f => ({
    id: f.id, orden: f.orden, url: f.url, pie_foto: f.pie_foto || ''
  }));
  const titulo = String(h.titulo || '');
  const idioma = String(h.idioma_original || c.lang || 'ES').toUpperCase();

  // 5. Publicar de una sola vez (bloquea el libro; todo o nada).
  const r = await fetch(`${SUPA_URL()}/rest/v1/rpc/publicar_historia`, {
    method: 'POST',
    headers: cabeceras(),
    body: JSON.stringify({
      p_historia_id: h.id,
      p_autor_id: autorId,
      p_titulo: titulo,
      p_contenido: contenido,
      p_portada_url: h.portada_url || null,
      p_idioma_original: idioma
    })
  });
  if (!r.ok) {
    const texto = await r.text();
    console.error('moderar: publicar_historia', r.status, texto);
    if (/HISTORIA_NO_ENCONTRADA|NO_ES_DEL_AUTOR|HISTORIA_ELIMINADA/.test(texto)) {
      return res.status(404).json({ error: 'NO_ENCONTRADA' });
    }
    return res.status(500).json({ error: 'ERROR' });
  }
  const publicado = await r.json();

  // 6. Anotaciones. Un fallo aquí no deshace la publicación, pero queda en el registro.
  try {
    await insertar('registro_gasto', {
      servicio: 'subida', autor_id: autorId, historia_id: h.id, coste_euros: 0,
      detalle: { version: 'moderar v1', nueva: !!publicado.nueva }
    });
  } catch (e) { console.error('moderar: registro_gasto', e.message); }
  try {
    await insertar('registro_lssi', { autor_id: autorId, accion: 'publicacion', ip });
  } catch (e) { console.error('moderar: registro_lssi', e.message); }

  // 7. Limpieza (nunca tumba la subida).
  await limpiar(h.id, carpeta);

  return res.status(200).json({
    ok: true,
    nueva: !!publicado.nueva,
    fecha_publicacion: publicado.fecha_publicacion,
    fecha_actualizacion: publicado.fecha_actualizacion
  });
}

// ─── Limpieza al subir (diseño v6, §11.4, "Limpieza al subir") ──────────

async function limpiar(historiaId, carpeta) {
  // Se relee todo en este momento: si otra subida o el Autor han cambiado algo, cuenta lo último.
  let pub = null, hist = null, filasFotos = [];
  try {
    pub = (await leer(`publicaciones?historia_id=eq.${historiaId}&select=titulo,contenido,portada_url&limit=1`))[0] || null;
    hist = (await leer(`historias?id=eq.${historiaId}&select=portada_url,portada_original_url&limit=1`))[0] || null;
    filasFotos = await leer(`fotos?historia_id=eq.${historiaId}&select=url,original_url`);
  } catch (e) {
    console.error('moderar: limpieza, lectura', historiaId, e.message);
    return;
  }

  // 7a. Traducciones de tramos que ya no existen en lo publicado.
  if (pub) {
    try {
      const vigentes = huellasVigentes(pub);
      const d = await fetch(
        `${SUPA_URL()}/rest/v1/traducciones_cache?historia_id=eq.${historiaId}` +
        `&huella=not.in.(${vigentes.join(',')})`,
        { method: 'DELETE', headers: cabeceras({ Prefer: 'return=minimal' }) }
      );
      if (!d.ok) throw new Error(`${d.status} ${await d.text()}`);
    } catch (e) {
      console.error('moderar: limpieza, traducciones', historiaId, e.message);
    }
  }

  // 7b. Archivos que no usa nadie: ni lo publicado, ni lo que se escribe, ni un original
  // recuperable. Solo si tienen más de una hora.
  try {
    const usados = new Set();
    const usar = d => { const r = rutaDeDireccion(d); if (r) usados.add(r); };
    if (pub) {
      usar(pub.portada_url);
      ((pub.contenido && pub.contenido.fotos) || []).forEach(f => usar(f && f.url));
    }
    if (hist) { usar(hist.portada_url); usar(hist.portada_original_url); }
    filasFotos.forEach(f => { usar(f.url); usar(f.original_url); });

    const ahora = Date.now();
    const borrar = [];
    for (const it of await listarCarpeta(carpeta)) {
      if (it.id === null) continue; // subcarpeta: no se toca
      const ruta = `${carpeta}/${it.name}`;
      if (!ruta.startsWith(carpeta + '/') || it.name.includes('/')) continue;
      if (usados.has(ruta)) continue;
      const fecha = Math.max(Date.parse(it.created_at) || 0, Date.parse(it.updated_at) || 0);
      if (!fecha || ahora - fecha < MARGEN_LIMPIEZA_MS) continue; // sin fecha o reciente: se queda
      borrar.push(ruta);
    }
    for (let i = 0; i < borrar.length; i += 100) {
      const d = await fetch(`${SUPA_URL()}/storage/v1/object/${BUCKET}`, {
        method: 'DELETE',
        headers: cabeceras(),
        body: JSON.stringify({ prefixes: borrar.slice(i, i + 100) })
      });
      if (!d.ok) throw new Error(`${d.status} ${await d.text()}`);
    }
    if (borrar.length) console.log(`moderar: ${historiaId}: ${borrar.length} archivos sin uso borrados`);
  } catch (e) {
    console.error('moderar: limpieza, archivos', historiaId, e.message);
  }
}

// Archivos de la carpeta del libro (como api/purgar-borrados.js v2).
async function listarCarpeta(carpeta) {
  const items = [];
  let offset = 0;
  while (true) {
    const r = await fetch(`${SUPA_URL()}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: cabeceras(),
      body: JSON.stringify({ prefix: carpeta, limit: 1000, offset })
    });
    if (!r.ok) throw new Error(`listar: ${r.status} ${await r.text()}`);
    const lote = await r.json();
    items.push(...lote);
    if (lote.length < 1000) break;
    offset += 1000;
  }
  return items;
}

// ─── Entrada ────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METODO_NO_PERMITIDO' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'CONFIGURACION' });
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const autorId = await autorDeLaSesion(body.token);
    if (!autorId) return res.status(401).json({ error: 'SIN_SESION' });

    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      (req.socket && req.socket.remoteAddress) || '';

    switch (body.operacion) {
      case 'subir': return await subir(body, autorId, ip, res);
      default: return res.status(400).json({ error: 'OPERACION_DESCONOCIDA' });
    }
  } catch (e) {
    console.error('moderar:', e);
    return res.status(500).json({ error: 'ERROR' });
  }
};

module.exports.config = { maxDuration: 60 };
