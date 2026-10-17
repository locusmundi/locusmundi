// api/_moderacion.js — Locus Mundi
// Versión 1.3 · 17/10/2026 · Fase B2, punto 19 (c): modelo, precios y cambio, leídos de
// api/_modelos.js. Sigue exportando MODELO_MODERACION, PRECIOS_USD, DOLAR_A_EURO y costeEnEuros
// (compatibilidad con moderar.js v3.5). Nada más cambia.
// Versión 1.2 · 16/10/2026 · LIMITE_IMAGENES_DIA pasa de 10 a 30 por Autor (Continuidad, sesión
// "16/10/2026 (conversación 3b)"): un libro completo son 21 revisiones (portada + 20 fotos) y el
// tope de 20 fotos por libro ya limita los huecos; el límite diario solo frena las sustituciones
// sin fin (30 revisiones ≈ 0,012 €). Nada más cambia.
// Versión 1.1 · 11/10/2026 · llamarGeminiJson admite un parámetro opcional "temperatura" (el
// grado de azar de la respuesta; a 0, ante el mismo texto responde casi siempre lo mismo). Lo usa
// api/moderar.js v3.4 en la revisión del texto (Continuidad, sesión "11/10/2026 (subida
// pequeña)"). Sin él, todo funciona exactamente igual que en la v1 (imágenes incluidas).
// Versión 1 · 08/10/2026 · Nuevo. Diseño de la moderación v10, §5, §7, §11.13 (puntos 6 y 9)
// y §11.14. Archivo COMPARTIDO por api/moderar.js (v2) y api/foto-editor.js (v5): una sola
// regla para revisar una imagen, para llamar a Gemini en la moderación y para los límites
// (10 imágenes al día por Autor —30 desde la v1.2—, fusible diario de 5 €). Vercel no convierte en función un
// archivo de api/ que empieza por guion bajo.
// (El plan v10, §11.14, lo llamaba "_revisar_imagen.js"; lleva también los límites y el
// gasto, que comparten las dos funciones, y por eso se llama así.)

// ─── Constantes (todo lo que puede cambiar, en un solo sitio) ───────────

const M = require('./_modelos'); // v1.3
const MODELO_MODERACION = M.MODELOS.moderacion; // §7 y §11.13: la paga la plataforma
const PRECIOS_USD = M.PRECIOS_USD;
const DOLAR_A_EURO = M.DOLAR_A_EURO;

const FUSIBLE_MODERACION_EUROS_DIA = 5.00; // §7
const LIMITE_IMAGENES_DIA = 30;            // §7, por Autor (v1.2: antes 10)
const LIMITE_SUBIDAS_DIA = 5;              // §7, por Autor, solo las que necesitan revisión

// Categorías de imagen rechazada (§5.1 y §11.13, punto 9).
const CATEGORIAS_IMAGEN = ['menor', 'adulto', 'violencia'];

// ─── Supabase ───────────────────────────────────────────────────────────

function cabeceras(extra) {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', ...(extra || {}) };
}

async function leerFilas(ruta) {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${ruta}`, { headers: cabeceras() });
  if (!r.ok) throw new Error(`leer ${ruta.split('?')[0]}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function insertarFila(tabla, fila) {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${tabla}`, {
    method: 'POST',
    headers: cabeceras({ Prefer: 'return=minimal' }),
    body: JSON.stringify(fila)
  });
  if (!r.ok) throw new Error(`insertar ${tabla}: ${r.status} ${await r.text()}`);
}

function inicioDeHoy() {
  return new Date().toISOString().slice(0, 10) + 'T00:00:00Z'; // día en UTC, como api/traducir.js
}

// ─── Gasto, límites y fusible (registro_gasto, §11.6) ───────────────────

// Lo gastado hoy en moderación (texto e imágenes), para el fusible de 5 €.
async function gastoModeracionDeHoy() {
  const filas = await leerFilas(
    `registro_gasto?servicio=in.(moderacion_texto,moderacion_imagen)&fecha=gte.${inicioDeHoy()}` +
    `&select=coste_euros&limit=100000`
  );
  return filas.reduce((n, f) => n + (Number(f.coste_euros) || 0), 0);
}

async function fusibleSaltado() {
  return (await gastoModeracionDeHoy()) >= FUSIBLE_MODERACION_EUROS_DIA;
}

// Un solo aviso de fusible al día (tabla avisos_moderacion; Javier lo ve en Supabase).
async function avisarFusible(autorId, historiaId) {
  try {
    const hoy = await leerFilas(`avisos_moderacion?tipo=eq.fusible&fecha=gte.${inicioDeHoy()}&select=id&limit=1`);
    if (hoy.length) return;
    await insertarFila('avisos_moderacion', {
      tipo: 'fusible', autor_id: autorId || null, historia_id: historiaId || null,
      detalle: { limite_euros: FUSIBLE_MODERACION_EUROS_DIA }
    });
  } catch (e) { console.error('moderacion: aviso de fusible', e.message); }
}

// Revisiones de imagen de hoy de un Autor (cargas, editor de fotos y las de "subir").
async function imagenesRevisadasHoy(autorId) {
  const filas = await leerFilas(
    `registro_gasto?servicio=eq.moderacion_imagen&autor_id=eq.${autorId}&fecha=gte.${inicioDeHoy()}` +
    `&detalle->>origen=neq.subir&select=id&limit=1000`
  );
  return filas.length;
}

// Subidas de hoy de un Autor que han necesitado revisión (§7: solo esas cuentan).
async function subidasRevisadasHoy(autorId) {
  const filas = await leerFilas(
    `registro_gasto?servicio=eq.subida&autor_id=eq.${autorId}&fecha=gte.${inicioDeHoy()}` +
    `&detalle->>revisada=eq.true&select=id&limit=1000`
  );
  return filas.length;
}

// Anota un gasto. Nunca tumba la operación: si falla, queda en el registro de Vercel.
async function anotarGasto(servicio, autorId, historiaId, coste, detalle) {
  try {
    await insertarFila('registro_gasto', {
      servicio, autor_id: autorId || null, historia_id: historiaId || null,
      coste_euros: Math.round(Math.max(0, coste || 0) * 1e6) / 1e6,
      detalle: detalle || null
    });
  } catch (e) { console.error('moderacion: registro_gasto', e.message); }
}

// ─── Gemini ─────────────────────────────────────────────────────────────

const costeEnEuros = M.costeEnEuros; // v1.3

// Los filtros de Google que se pueden apagar, apagados: decide nuestro criterio, no el suyo.
// Lo que Google bloquea de todos modos (p. ej. PROHIBITED_CONTENT) llega como "bloqueo".
const SIN_FILTROS = [
  'HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT'
].map(category => ({ category, threshold: 'BLOCK_NONE' }));

const MOTIVOS_DE_BLOQUEO = ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'IMAGE_SAFETY', 'SPII', 'OTHER'];

// Llamada con respuesta JSON. Devuelve { json, coste, bloqueo }:
//   bloqueo = null, o { motivo, categorias } si Google se ha negado a responder.
//   json = null si la respuesta no se ha podido leer (y no es un bloqueo).
// Lanza un error solo si Gemini falla (red, 5xx…): eso no es un veredicto.
async function llamarGeminiJson({ modelo, sistema, partes, esquema, temperatura }) {
  const body = {
    system_instruction: { parts: [{ text: sistema }] },
    contents: [{ role: 'user', parts: partes }],
    generationConfig: {
      responseMimeType: 'application/json',
      ...(esquema ? { responseSchema: esquema } : {}),
      ...(typeof temperatura === 'number' ? { temperature: temperatura } : {})
    },
    safetySettings: SIN_FILTROS
  };
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify(body)
    }
  );
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(`Gemini ${r.status}: ${data?.error?.message || ''}`);
    e.gemini = true;
    throw e;
  }
  const coste = costeEnEuros(modelo, data.usageMetadata);
  const cand = data.candidates && data.candidates[0];
  const bloqueoPrompt = data.promptFeedback && data.promptFeedback.blockReason;
  const fin = cand && cand.finishReason;
  if (bloqueoPrompt || !cand || MOTIVOS_DE_BLOQUEO.includes(fin)) {
    const ratings = (cand && cand.safetyRatings) || (data.promptFeedback && data.promptFeedback.safetyRatings) || [];
    return {
      json: null, coste,
      bloqueo: {
        motivo: bloqueoPrompt || fin || 'SIN_RESPUESTA',
        categorias: ratings.filter(x => x.blocked || /HIGH|MEDIUM/.test(x.probability || '')).map(x => x.category)
      }
    };
  }
  const texto = ((cand.content && cand.content.parts) || []).map(p => p.text || '').join('').trim();
  let json = null;
  try { json = JSON.parse(texto.replace(/^```(?:json)?|```$/g, '').trim()); } catch (_) { json = null; }
  return { json, coste, bloqueo: null };
}

// ─── Revisión de una imagen (§5.1; §11.13, punto 9) ─────────────────────

const INSTRUCCIONES_IMAGEN =
  'You review one photograph before it is published in an open online library of family memoirs. ' +
  'Most photos are ordinary family pictures, often old, and must pass. Classify the photo into exactly ONE category:\n' +
  '- "menor": any nudity of a child or teenager, even innocent (a baby in the bath, a naked toddler on the beach). ' +
  'A child in a swimsuit or ordinary clothes is NOT nudity.\n' +
  '- "adulto": nudity or explicit sexual content of adults.\n' +
  '- "violencia": graphic violence or cruelty against people or animals: visible wounds, blood, corpses, mistreatment. ' +
  'This includes historical war photos showing the dead.\n' +
  '- "ok": everything else, including people in swimsuits, soldiers or weapons without graphic harm, funerals ' +
  'without a visible corpse, hospital or old-age scenes without wounds, hunting or farm animals without cruelty.\n' +
  'When in doubt between "ok" and another category, choose "ok", except for any doubt about the nudity of a child, ' +
  'where you choose "menor". Answer only with JSON: {"categoria": "ok" | "menor" | "adulto" | "violencia"}.';

const ESQUEMA_IMAGEN = {
  type: 'OBJECT',
  properties: { categoria: { type: 'STRING', enum: ['ok', ...CATEGORIAS_IMAGEN] } },
  required: ['categoria']
};

// Si Google se niega a mirar la imagen, se rechaza (decisión técnica, §11.13, punto 9):
// nunca puede pasar justo la imagen más grave. PROHIBITED_CONTENT (lo que Google no admite
// en ningún caso) se trata como el caso 1, el más estricto (se borra en el acto); un bloqueo
// por contenido sexual, como el 2; cualquier otro, como el 3 (con "Creo que es un error").
function categoriaDeBloqueo(bloqueo) {
  if (bloqueo.motivo === 'PROHIBITED_CONTENT') return 'menor';
  if ((bloqueo.categorias || []).includes('HARM_CATEGORY_SEXUALLY_EXPLICIT')) return 'adulto';
  return 'violencia';
}

// imagen = { buffer, tipo }. Devuelve { categoria: 'ok'|'menor'|'adulto'|'violencia', coste, bloqueo }.
// Lanza un error si no se ha podido revisar (Gemini caído o respuesta ilegible dos veces):
// quien llama no guarda la imagen y pide que se vuelva a intentar.
async function revisarImagen(imagen) {
  let coste = 0;
  for (let intento = 0; intento < 2; intento++) {
    const r = await llamarGeminiJson({
      modelo: MODELO_MODERACION,
      sistema: INSTRUCCIONES_IMAGEN,
      partes: [
        { inlineData: { mimeType: imagen.tipo || 'image/jpeg', data: imagen.buffer.toString('base64') } },
        { text: 'Classify this photograph.' }
      ],
      esquema: ESQUEMA_IMAGEN
    });
    coste += r.coste;
    if (r.bloqueo) return { categoria: categoriaDeBloqueo(r.bloqueo), coste, bloqueo: r.bloqueo };
    const c = r.json && r.json.categoria;
    if (c === 'ok' || CATEGORIAS_IMAGEN.includes(c)) return { categoria: c, coste, bloqueo: null };
    console.error('moderacion: respuesta de imagen ilegible; intento', intento + 1);
  }
  const e = new Error('REVISION_IMAGEN_FALLIDA');
  e.coste = coste;
  throw e;
}

// Comprobación de que un archivo es de verdad JPG o PNG (por sus primeros bytes).
function tipoDeImagen(buffer) {
  if (!buffer || buffer.length < 8) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  return null;
}

module.exports = {
  MODELO_MODERACION,
  PRECIOS_USD,
  DOLAR_A_EURO,
  FUSIBLE_MODERACION_EUROS_DIA,
  LIMITE_IMAGENES_DIA,
  LIMITE_SUBIDAS_DIA,
  CATEGORIAS_IMAGEN,
  cabeceras,
  leerFilas,
  insertarFila,
  inicioDeHoy,
  gastoModeracionDeHoy,
  fusibleSaltado,
  avisarFusible,
  imagenesRevisadasHoy,
  subidasRevisadasHoy,
  anotarGasto,
  costeEnEuros,
  llamarGeminiJson,
  revisarImagen,
  categoriaDeBloqueo,
  tipoDeImagen
};
