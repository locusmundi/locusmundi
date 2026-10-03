// api/traducir.js — Locus Mundi
// Versión 1 · 03/10/2026 · Diseño: LOCUS_MUNDI_DISENO_TRADUCIR.md v2
// (Continuidad, sesión "03/10/2026 (tarde)").
//
// Traducción gratuita y sin cuenta de los libros PUBLICADOS y no eliminados,
// por tramos y a demanda, con caché compartida sin caducidad.
// El navegador solo dice qué libro, qué parte y a qué idioma; el texto lo lee
// este servidor de Supabase. Nunca traduce un texto enviado por el navegador.
//
// Petición:  POST { historia_id, idioma, parte }
//   parte = "cabecera" → { titulo, subtitulo, pies, tramos }
//   parte = 0, 1, 2…   → { texto, tramos }
// Errores:   PETICION_NO_VALIDA, NO_DISPONIBLE, MISMO_IDIOMA, FUSIBLE,
//            ERROR_TRADUCCION
//
// Variables de entorno (Vercel): GEMINI_API_KEY, SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY (las mismas que api/asistente.js).

const crypto = require('crypto');

// ─── Constantes (todo lo que puede cambiar, en un solo sitio) ───────────

const MODELO = 'gemini-3.5-flash-lite';

// Dólares por millón de tokens. OJO: duplicado de api/asistente.js;
// si cambian los precios, cambiarlos en los dos archivos.
const PRECIOS_USD = {
  'gemini-3.5-flash':      { entrada: 1.50, salida: 9.00 },
  'gemini-3.5-flash-lite': { entrada: 0.30, salida: 2.50 }
};
const DOLAR_A_EURO = 0.90;

// Fusible: gasto máximo diario en traducciones NUEVAS (euros). Decisión de
// Javier, 03/10/2026. Lo ya guardado en la caché se sirve siempre.
const FUSIBLE_EUROS_DIA = 1.00;

// Tope de cada tramo: lo que llegue antes.
const MAX_CARACTERES = 20000;
const MAX_PARRAFOS = 50;

// Idiomas de destino: código → nombre para la instrucción.
const IDIOMAS = {
  'ES':    'español',
  'EN':    'inglés',
  'FR':    'francés',
  'DE':    'alemán',
  'IT':    'italiano',
  'PT-BR': 'portugués de Brasil',
  'PT-PT': 'portugués europeo, de Portugal',
  'ZH':    'chino simplificado',
  'AR':    'árabe',
  'JA':    'japonés',
  'RU':    'ruso',
  'HI':    'hindi',
  'GL':    'gallego',
  'CA':    'catalán'
};
// Solo como idioma de ORIGEN (libros antiguos sin país).
const IDIOMAS_ORIGEN_EXTRA = { 'PT': 'portugués' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Instrucciones ──────────────────────────────────────────────────────

function instruccionTramo(destino) {
  return `Traduce al ${destino} este fragmento de una autobiografía publicada. Haz una traducción fiel, clara y natural, que conserve la voz y el tono de quien escribe, sin adornarla, resumirla ni añadir nada. Adapta la puntuación del diálogo y las comillas a la convención propia del ${destino}. Mantén los nombres propios de personas y lugares como en el original. Las líneas entre corchetes, como [FOTO 2], son marcas técnicas: cópialas exactamente igual, cada una en su propia línea. Las líneas que empiezan por ¶ (capítulo) o § (apartado) son títulos: conserva el signo al principio de la línea y traduce solo el texto que lo sigue. Conserva la separación entre párrafos (una línea en blanco) y los guiones bajos de la cursiva (_así_). Devuelve solo la traducción, sin comentarios.`;
}

function instruccionCabecera(destino) {
  return `Traduce al ${destino} el título, el subtítulo y los pies de foto de una autobiografía publicada, que recibirás como un objeto JSON. Haz una traducción fiel, clara y natural, sin adornarla ni añadir nada. Mantén los nombres propios de personas y lugares como en el original. Devuelve exactamente el mismo objeto JSON, con las mismas claves (también las de "pies"), cambiando solo los textos por su traducción. Si un texto está vacío, déjalo vacío.`;
}

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

// ─── Supabase (por su API REST, sin librerías) ──────────────────────────

function cabecerasServicio() {
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    apikey: clave,
    Authorization: `Bearer ${clave}`,
    'Content-Type': 'application/json'
  };
}

async function supabaseGet(ruta) {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${ruta}`, { headers: cabecerasServicio() });
  if (!r.ok) throw new Error(`Supabase GET ${r.status}`);
  return r.json();
}

// Solo publicada y no marcada para borrar.
async function leerHistoria(historiaId) {
  const filas = await supabaseGet(
    `historias?id=eq.${historiaId}&estado_publicacion=eq.publicado&marcado_borrado=eq.false` +
    `&select=id,titulo,contenido,idioma_original&limit=1`
  );
  return filas[0] || null;
}

async function leerPies(historiaId) {
  const filas = await supabaseGet(`fotos?historia_id=eq.${historiaId}&select=id,url,pie_foto`);
  const pies = {};
  filas
    .filter(f => f.url && String(f.pie_foto || '').trim())
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .forEach(f => { pies[f.id] = String(f.pie_foto).trim(); });
  return pies;
}

async function buscarEnCache(historiaId, idioma, laHuella) {
  const filas = await supabaseGet(
    `traducciones_cache?historia_id=eq.${historiaId}&idioma=eq.${encodeURIComponent(idioma)}` +
    `&huella=eq.${laHuella}&select=contenido_traducido&limit=1`
  );
  return filas[0] ? filas[0].contenido_traducido : null;
}

async function gastoDeHoy() {
  const desde = new Date().toISOString().slice(0, 10) + 'T00:00:00Z';
  const filas = await supabaseGet(
    `traducciones_cache?fecha_generado=gte.${desde}&select=coste_euros&limit=10000`
  );
  return filas.reduce((n, f) => n + (Number(f.coste_euros) || 0), 0);
}

// Si otro lector acaba de guardar la misma traducción, no se duplica.
async function guardarEnCache(fila) {
  const r = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/traducciones_cache?on_conflict=historia_id,idioma,huella`,
    {
      method: 'POST',
      headers: { ...cabecerasServicio(), Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(fila)
    }
  );
  if (!r.ok) console.error('No se pudo guardar en la caché:', r.status, await r.text());
}

// ─── Gemini ─────────────────────────────────────────────────────────────

function costeEnEuros(uso) {
  const p = PRECIOS_USD[MODELO];
  const entrada = uso?.promptTokenCount || 0;
  const salida = (uso?.candidatesTokenCount || 0) + (uso?.thoughtsTokenCount || 0);
  return ((entrada * p.entrada + salida * p.salida) / 1e6) * DOLAR_A_EURO;
}

async function llamarGemini(sistema, mensaje, json) {
  const body = {
    system_instruction: { parts: [{ text: sistema }] },
    contents: [{ role: 'user', parts: [{ text: mensaje }] }]
  };
  if (json) body.generationConfig = { responseMimeType: 'application/json' };

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify(body)
    }
  );
  const data = await r.json();
  if (!r.ok) {
    console.error('Error de Gemini:', data);
    throw new Error(data.error?.message || 'Error al llamar a Gemini');
  }
  const texto = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
  return { texto, coste: costeEnEuros(data.usageMetadata) };
}

// Hasta dos intentos. Devuelve { contenido, coste } o null si no cuadra.
async function traducirTramo(texto, destino) {
  let coste = 0;
  for (let intento = 0; intento < 2; intento++) {
    const r = await llamarGemini(instruccionTramo(destino), texto, false);
    coste += r.coste;
    if (r.texto && mismaEstructura(texto, r.texto)) return { contenido: { texto: r.texto }, coste };
    console.error('Traducción con estructura distinta; intento', intento + 1);
  }
  return null;
}

async function traducirCabecera(original, destino) {
  let coste = 0;
  for (let intento = 0; intento < 2; intento++) {
    const r = await llamarGemini(instruccionCabecera(destino), JSON.stringify(original), true);
    coste += r.coste;
    try {
      const t = JSON.parse(r.texto.replace(/```json|```/g, '').trim());
      const pies = {};
      for (const id of Object.keys(original.pies)) {
        if (typeof t.pies?.[id] !== 'string') throw new Error('Falta un pie');
        pies[id] = t.pies[id];
      }
      if (typeof t.titulo !== 'string') throw new Error('Falta el título');
      return {
        contenido: { titulo: t.titulo, subtitulo: typeof t.subtitulo === 'string' ? t.subtitulo : '', pies },
        coste
      };
    } catch (e) {
      console.error('Cabecera no válida; intento', intento + 1, e.message);
    }
  }
  return null;
}

// ─── Función principal ──────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }
  if (!process.env.GEMINI_API_KEY || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'Faltan variables de entorno en el servidor' });
    return;
  }

  try {
    const { historia_id, idioma, parte } = req.body || {};

    // 1. Comprobar los datos.
    const esCabecera = parte === 'cabecera';
    const numTramo = Number.isInteger(parte) ? parte : NaN;
    if (!UUID.test(String(historia_id || '')) || !IDIOMAS[idioma] || (!esCabecera && !(numTramo >= 0))) {
      res.status(400).json({ error: 'PETICION_NO_VALIDA' });
      return;
    }

    // 2. Leer la historia: solo publicada y no marcada.
    const historia = await leerHistoria(historia_id);
    if (!historia) {
      res.status(404).json({ error: 'NO_DISPONIBLE' });
      return;
    }
    const c = historia.contenido || {};
    const origen = String(historia.idioma_original || c.lang || 'ES').toUpperCase();

    // 3. Mismo idioma: no hay nada que traducir.
    if (origen === idioma) {
      res.status(400).json({ error: 'MISMO_IDIOMA' });
      return;
    }

    const destino = IDIOMAS[idioma];
    const tramos = dividirEnTramos(c.text);

    // 4. Preparar lo que se pide y su huella.
    let original, laHuella;
    if (esCabecera) {
      original = {
        titulo: String(historia.titulo || c.title || c.name || ''),
        subtitulo: String(c.subtitle || ''),
        pies: await leerPies(historia_id)
      };
      laHuella = huella('cabecera', JSON.stringify(original));
    } else {
      if (numTramo >= tramos.length) {
        res.status(404).json({ error: 'NO_DISPONIBLE', tramos: tramos.length });
        return;
      }
      original = tramos[numTramo];
      // Un tramo con solo marcas de foto no se manda a la IA.
      if (parrafosDe(original).every(esMarcaFoto)) {
        res.status(200).json({ texto: original, tramos: tramos.length });
        return;
      }
      laHuella = huella('tramo', original);
    }

    const responder = contenido => {
      if (esCabecera) res.status(200).json({ ...contenido, tramos: tramos.length });
      else res.status(200).json({ texto: contenido.texto, tramos: tramos.length });
    };

    // 5. Caché: si está, se sirve sin gastar nada.
    const guardada = await buscarEnCache(historia_id, idioma, laHuella);
    if (guardada) {
      responder(guardada);
      return;
    }

    // 6. Fusible diario.
    if (await gastoDeHoy() >= FUSIBLE_EUROS_DIA) {
      res.status(429).json({ error: 'FUSIBLE' });
      return;
    }

    // 7. Traducir y validar.
    const resultado = esCabecera
      ? await traducirCabecera(original, destino)
      : await traducirTramo(original, destino);
    if (!resultado) {
      res.status(502).json({ error: 'ERROR_TRADUCCION' });
      return;
    }

    // 8. Guardar en la caché con su coste.
    await guardarEnCache({
      historia_id,
      idioma,
      huella: laHuella,
      contenido_traducido: resultado.contenido,
      modelo: MODELO,
      coste_euros: Math.round(resultado.coste * 1e6) / 1e6
    });

    // 9. Devolver.
    responder(resultado.contenido);
  } catch (err) {
    console.error('Error en traducir.js:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
