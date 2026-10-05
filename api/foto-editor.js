// api/foto-editor.js — Editor de fotos con IA (Locus Mundi, pieza 5)
// Versión 3 · 05/10/2026 · Sustituye a la versión 2 (03/10/2026).
// Cambios respecto a la v2 (diseño: Continuidad, sesión "05/10/2026 (fotos)"):
//   (1) Original recuperable. Antes de sobrescribir por primera vez una foto o la
//       portada (al aceptar una edición o guardar un tono) se guarda una copia en
//       {base}-original.jpg y se anota en fotos.original_url /
//       historias.portada_original_url. Si la copia no se puede hacer, no se
//       sobrescribe nada.
//   (2) La IA trabaja siempre sobre el original: "proponer" envía la copia si
//       existe; si no, la imagen actual (que entonces es el original).
//   (3) Operación nueva "volverOriginal": repone la copia, vacía la columna y borra
//       la copia y la propuesta. No toca contadores.
//   (4) "proponer" devuelve también baseUrl (la imagen que recibió la IA), para que
//       el navegador componga "Colorear" (luz del original + color de la IA).
// Compatible con el index.html anterior: las operaciones y respuestas de la v2 no
// cambian; solo se añaden campos y una operación.
// Supabase (05/10/2026): columnas fotos.original_url e historias.portada_original_url;
// los disparadores fotos_contadores e historias_contador_portada impiden que el
// navegador las escriba y las vacían si el Autor cambia o quita la imagen.
// Versión 2 · 03/10/2026 · No se trabaja sobre historias marcadas para borrar.
// Versión 1 · 01/10/2026 · Diseño: Continuidad, sesión "01/10/2026 (noche)".
//
// Operaciones (POST, JSON):
//   proponer       {token, objetivo, fotoId|historiaId, restaurar, colorear}
//   aceptar        {token, objetivo, fotoId|historiaId, imagen}  (JPG ya convertido en el navegador)
//   descartar      {token, objetivo, fotoId|historiaId}
//   guardarTono    {token, objetivo, fotoId|historiaId, imagen}  (B/N o sepia hecho en el navegador)
//   volverOriginal {token, objetivo, fotoId|historiaId}
// objetivo = "foto" (con fotoId) o "portada" (con historiaId).
//
// Todo se escribe con la clave de servicio: los disparadores dejan pasar el cambio
// sin gastar el cambio de imagen. Por eso este servidor lleva él mismo la cuenta de
// ediciones y la columna del original (no lo hace el disparador).

const LIMITE_EDICIONES = 4; // único sitio donde vive el 4
const MODELO = "gemini-3.1-flash-image-preview"; // Nano Banana 2
const TAMANO_IMAGEN = "2K";
const BUCKET = "fotos";
const MAX_JPG_BYTES = 3 * 1024 * 1024; // un JPG de 1.600 px pesa mucho menos

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

// ---------- Instrucciones para Nano Banana (aprobadas el 29/09 y el 01/10; sin cambios) ----------
// Con "Colorear" solo, el navegador usa únicamente el color de la propuesta (05/10/2026).
const PROMPT_FIJO =
  'This is a real photograph of real people, part of a family memoir archive. Do not alter facial features, apparent age, expression, build, hairstyle or clothing. Do not beautify, rejuvenate, smooth the skin or correct "imperfections". Do not add or remove people, objects or background elements. Do not change the framing or proportions. When in doubt, preserve. Fidelity takes priority over aesthetics.';
const PROMPT_RESTAURAR =
  "Restoration: repair only physical damage (scratches, stains, cracks, tears, dust, fading). Correct exposure and contrast and recover detail, without changing the direction or character of the light, and without adding glints, sheen or new light sources. Do not invent detail: where areas are lost, reconstruct them discreetly and consistently with the rest of the image.";
// Se omite si además se colorea (contradiría al bloque de color).
const PROMPT_CONSERVAR_TONOS =
  "Keep the original tones: a black-and-white or sepia photograph stays black-and-white or sepia.";
const PROMPT_COLOREAR =
  "Colorization (the original is black and white): use natural, plausible colors for the period and place, without oversaturation. Skin, eyes and hair must be consistent with the brightness of the original. When in doubt, choose subdued tones.";
const PROMPT_SOLO_COLOREAR = "Colorize only: do not repair or correct anything else.";

function montarInstrucciones(restaurar, colorear) {
  const partes = [PROMPT_FIJO];
  if (restaurar) {
    partes.push(PROMPT_RESTAURAR);
    if (!colorear) partes.push(PROMPT_CONSERVAR_TONOS);
  }
  if (colorear) {
    partes.push(PROMPT_COLOREAR);
    if (!restaurar) partes.push(PROMPT_SOLO_COLOREAR);
  }
  return partes.join("\n\n");
}

// ---------- Supabase (REST, sin librerías) ----------
const ID_VALIDO = /^[A-Za-z0-9-]{1,64}$/;

function cabeceras(extra) {
  return { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, ...(extra || {}) };
}

async function usuarioDelToken(token) {
  if (!token || typeof token !== "string") return null;
  const r = await fetch(`${SUPA_URL}/auth/v1/user`, {
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  return u && u.id ? u.id : null;
}

async function leer(tabla, filtro, columnas) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${tabla}?select=${columnas}&${filtro}`, {
    headers: cabeceras(),
  });
  if (!r.ok) throw new Error(`BD_LECTURA ${tabla} ${r.status}`);
  return r.json();
}

async function actualizar(tabla, filtro, datos) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${tabla}?${filtro}`, {
    method: "PATCH",
    headers: cabeceras({ "Content-Type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify(datos),
  });
  if (!r.ok) throw new Error(`BD_ESCRITURA ${tabla} ${r.status}`);
}

async function subir(ruta, buffer, tipo) {
  const r = await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET}/${ruta}`, {
    method: "POST",
    headers: cabeceras({ "Content-Type": tipo, "x-upsert": "true", "cache-control": "no-cache" }),
    body: buffer,
  });
  if (!r.ok) throw new Error(`STORAGE_SUBIDA ${r.status}`);
}

async function descargar(ruta) {
  const r = await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET}/${ruta}`, { headers: cabeceras() });
  if (!r.ok) return null;
  return {
    buffer: Buffer.from(await r.arrayBuffer()),
    tipo: (r.headers.get("content-type") || "image/jpeg").split(";")[0],
  };
}

async function borrar(rutas) {
  try {
    await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET}`, {
      method: "DELETE",
      headers: cabeceras({ "Content-Type": "application/json" }),
      body: JSON.stringify({ prefixes: rutas }),
    });
  } catch (_) { /* best-effort, como en el navegador */ }
}

// Misma forma que la URL que guarda el navegador: pública, con ?v= para saltar la caché.
function urlPublica(ruta) {
  return `${SUPA_URL}/storage/v1/object/public/${BUCKET}/${ruta}?v=${Date.now()}`;
}

// ---------- Objetivo: foto o portada, con comprobación de propiedad ----------
// Rutas idénticas a fotoStoragePath del index.html: {autor}/{historia}/foto-{id}.jpg o cover.jpg
// Copia del original (v3): {base}-original.jpg, en la misma carpeta (la purga v2 la borra).
// v2: una historia marcada para borrar se trata como inexistente.
async function resolverObjetivo(body, autorId) {
  if (body.objetivo === "portada") {
    if (!ID_VALIDO.test(String(body.historiaId || ""))) return null;
    const h = (await leer("historias", `id=eq.${body.historiaId}`,
      "id,autor_id,portada_url,portada_ediciones_ia,portada_original_url,marcado_borrado"))[0];
    if (!h || h.autor_id !== autorId || h.marcado_borrado === true) return null;
    return {
      tipo: "portada",
      url: h.portada_url,
      original: h.portada_original_url || null,
      ediciones: h.portada_ediciones_ia || 0,
      base: `${autorId}/${h.id}/cover`,
      tabla: "historias",
      filtro: `id=eq.${h.id}`,
      colUrl: "portada_url",
      colEdiciones: "portada_ediciones_ia",
      colOriginal: "portada_original_url",
    };
  }
  if (body.objetivo === "foto") {
    if (!ID_VALIDO.test(String(body.fotoId || ""))) return null;
    const f = (await leer("fotos", `id=eq.${body.fotoId}`, "id,historia_id,url,ediciones_ia,original_url"))[0];
    if (!f) return null;
    const h = (await leer("historias", `id=eq.${f.historia_id}`, "id,autor_id,marcado_borrado"))[0];
    if (!h || h.autor_id !== autorId || h.marcado_borrado === true) return null;
    return {
      tipo: "foto",
      url: f.url,
      original: f.original_url || null,
      ediciones: f.ediciones_ia || 0,
      base: `${autorId}/${h.id}/foto-${f.id}`,
      tabla: "fotos",
      filtro: `id=eq.${f.id}`,
      colUrl: "url",
      colEdiciones: "ediciones_ia",
      colOriginal: "original_url",
    };
  }
  return null;
}

// Portada editable con IA: al menos un hueco de foto (cualquier origen) o una carga de tinta.
// v2: solo cuentan las fotos de la historia viva, no las de una historia eliminada.
async function puedeEditarPortada(autorId) {
  const a = (await leer("autores", `id=eq.${autorId}`, "tinta_ultima_carga"))[0];
  if (a && Number(a.tinta_ultima_carga) > 0) return true;
  const hs = await leer("historias", `autor_id=eq.${autorId}&marcado_borrado=eq.false`, "id");
  if (!hs.length) return false;
  const ids = hs.map((h) => h.id).join(",");
  const fs = await leer("fotos", `historia_id=in.(${ids})&limit=1`, "id");
  return fs.length > 0;
}

// JPG recibido del navegador (data URL o base64). Comprueba que de verdad es JPG.
function leerJpg(imagen) {
  if (!imagen || typeof imagen !== "string") return null;
  const b64 = imagen.includes(",") ? imagen.split(",")[1] : imagen;
  const buf = Buffer.from(b64, "base64");
  if (buf.length < 3 || buf.length > MAX_JPG_BYTES) return null;
  if (buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) return null;
  return buf;
}

// v3: la imagen de partida de la IA es la copia del original si existe; si no
// (foto nunca editada, o copia perdida), la imagen actual.
async function imagenDePartida(obj) {
  if (obj.original) {
    const ruta = `${obj.base}-original.jpg`;
    const img = await descargar(ruta);
    if (img) return { img, url: urlPublica(ruta) };
  }
  const img = await descargar(`${obj.base}.jpg`);
  return img ? { img, url: obj.url } : null;
}

// v3: antes de la primera sobrescritura, copia la imagen actual a {base}-original.jpg.
// Devuelve la URL de la copia (o la existente). Lanza error si no puede: así nunca
// se sobrescribe una foto sin haber guardado antes su original.
async function asegurarOriginal(obj) {
  if (obj.original) return obj.original;
  const actual = await descargar(`${obj.base}.jpg`);
  if (!actual) throw new Error("ORIGINAL_SIN_ARCHIVO");
  const ruta = `${obj.base}-original.jpg`;
  await subir(ruta, actual.buffer, actual.tipo || "image/jpeg");
  return urlPublica(ruta);
}

// ---------- Operaciones ----------
async function proponer(body, obj, autorId, res) {
  const restaurar = !!body.restaurar;
  const colorear = !!body.colorear;
  if (!restaurar && !colorear) return res.status(400).json({ error: "SIN_OPERACION" });
  if (!obj.url) return res.status(400).json({ error: "SIN_IMAGEN" });
  if (obj.ediciones >= LIMITE_EDICIONES) {
    return res.status(403).json({ error: "SIN_EDICIONES", ediciones: obj.ediciones, limite: LIMITE_EDICIONES });
  }
  if (obj.tipo === "portada" && !(await puedeEditarPortada(autorId))) {
    return res.status(403).json({ error: "PORTADA_NO_INCLUIDA" });
  }

  // La imagen la descarga el servidor: el navegador no puede colar otra a la IA.
  const partida = await imagenDePartida(obj);
  if (!partida) return res.status(404).json({ error: "SIN_IMAGEN" });
  const original = partida.img;

  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [
          { text: montarInstrucciones(restaurar, colorear) },
          { inlineData: { mimeType: original.tipo, data: original.buffer.toString("base64") } },
        ],
      }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { imageSize: TAMANO_IMAGEN } },
    }),
  });
  const d = await r.json().catch(() => ({}));
  const partes = (d && d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || [];
  const parte = partes.find((p) => p.inlineData || p.inline_data);
  if (!r.ok || !parte) {
    // Google no devolvió imagen: no se cobra la edición.
    console.error("foto-editor: sin imagen de Gemini", r.status, JSON.stringify(d).slice(0, 500));
    return res.status(502).json({ error: "SIN_PROPUESTA" });
  }
  const datos = parte.inlineData || parte.inline_data;
  const tipo = datos.mimeType || datos.mime_type || "image/png";

  // Propuesta provisional, sin extensión (puede ser PNG o JPG): {base}-propuesta
  const rutaPropuesta = `${obj.base}-propuesta`;
  await subir(rutaPropuesta, Buffer.from(datos.data, "base64"), tipo);

  const nuevas = obj.ediciones + 1;
  await actualizar(obj.tabla, obj.filtro, { [obj.colEdiciones]: nuevas });

  return res.status(200).json({
    propuestaUrl: urlPublica(rutaPropuesta),
    baseUrl: partida.url, // v3: imagen que recibió la IA (para componer "Colorear")
    ediciones: nuevas,
    limite: LIMITE_EDICIONES,
    restantes: LIMITE_EDICIONES - nuevas,
  });
}

async function guardarImagen(body, obj, res, borrarPropuesta) {
  if (!obj.url) return res.status(400).json({ error: "SIN_IMAGEN" });
  const jpg = leerJpg(body.imagen);
  if (!jpg) return res.status(400).json({ error: "IMAGEN_NO_VALIDA" });
  const originalUrl = await asegurarOriginal(obj); // v3: antes de sobrescribir
  const ruta = `${obj.base}.jpg`;
  await subir(ruta, jpg, "image/jpeg");
  const url = urlPublica(ruta);
  // service_role: no gasta el cambio de imagen; anota la copia del original
  await actualizar(obj.tabla, obj.filtro, { [obj.colUrl]: url, [obj.colOriginal]: originalUrl });
  if (borrarPropuesta) await borrar([`${obj.base}-propuesta`]);
  return res.status(200).json({ url, tieneOriginal: true });
}

async function descartar(obj, res) {
  await borrar([`${obj.base}-propuesta`]); // la edición queda gastada (29/09, punto 4b)
  return res.status(200).json({ ok: true });
}

// v3: repone la copia del original. No toca contadores.
async function volverOriginal(obj, res) {
  if (!obj.original) return res.status(400).json({ error: "SIN_ORIGINAL" });
  const copia = await descargar(`${obj.base}-original.jpg`);
  if (!copia) return res.status(404).json({ error: "SIN_ORIGINAL" });
  const ruta = `${obj.base}.jpg`;
  await subir(ruta, copia.buffer, copia.tipo || "image/jpeg");
  const url = urlPublica(ruta);
  await actualizar(obj.tabla, obj.filtro, { [obj.colUrl]: url, [obj.colOriginal]: null });
  await borrar([`${obj.base}-original.jpg`, `${obj.base}-propuesta`]);
  return res.status(200).json({ url, tieneOriginal: false });
}

// ---------- Entrada ----------
module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "METODO_NO_PERMITIDO" });
  if (!SUPA_URL || !SUPA_KEY || !GEMINI_KEY) return res.status(500).json({ error: "CONFIGURACION" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const autorId = await usuarioDelToken(body.token);
    if (!autorId) return res.status(401).json({ error: "SIN_SESION" });

    const obj = await resolverObjetivo(body, autorId);
    if (!obj) return res.status(404).json({ error: "NO_ENCONTRADA" });

    switch (body.operacion) {
      case "proponer": return await proponer(body, obj, autorId, res);
      case "aceptar": return await guardarImagen(body, obj, res, true);
      case "guardarTono": return await guardarImagen(body, obj, res, false);
      case "descartar": return await descartar(obj, res);
      case "volverOriginal": return await volverOriginal(obj, res);
      default: return res.status(400).json({ error: "OPERACION_DESCONOCIDA" });
    }
  } catch (e) {
    console.error("foto-editor:", e);
    return res.status(500).json({ error: "ERROR" });
  }
};

// La generación de imagen puede tardar; margen de un minuto.
module.exports.config = { maxDuration: 60 };
