// api/traducir.js — Locus Mundi
// Versión 3 · 06/10/2026 · Sustituye a la versión 2 (commit 1daaf77).
// Diseño: LOCUS_MUNDI_DISENO_MODERACION.md v6, §11.2, §11.4, §11.6 y §11.8 (dos versiones
// de cada libro). Cambios de la v3:
//  - Lee lo PUBLICADO de la tabla publicaciones (existir es estar publicado), no historias.
//    Los pies salen de la lista de fotos de la copia publicada (contenido.fotos), no de la
//    tabla fotos.
//  - La división en tramos y las huellas vienen de api/_tramos.js, compartido con
//    api/moderar.js (antes, aquí dentro). Mismas reglas y mismas huellas: la caché vale.
//  - El fusible diario suma el gasto de la tabla registro_gasto (servicio "traduccion"),
//    no las filas de traducciones_cache, que ahora se borran al subir un libro.
//  - Se anota en registro_gasto TODO lo gastado, también cuando la traducción no cuadra y
//    se descarta (en la v2 ese gasto no contaba para el fusible).
//  - Las traducciones viejas NO las borra este archivo: lo hace api/moderar.js al subir.
// Versión 2 · 03/10/2026 · Sustituye a la versión 1 (commit 21fcd2d).
// Diseño: LOCUS_MUNDI_DISENO_TRADUCIR.md v2 (Continuidad, sesiones "03/10/2026 (tarde)"
// y "03/10/2026 (lectura nueva)").
// Cambios de la v2:
//  - Las lecturas de Supabase se reintentan una vez tras una breve pausa (leer no gasta).
//    Motivo: un "Supabase GET 401" aislado el 03/10 a las 17:45, con la petición gemela
//    correcta en el mismo instante.
//  - Si Supabase responde con error, el registro guarda también su mensaje, no solo el código.
//  - Cada llamada a Gemini anota sus tokens (entrada, salida y "pensar"), para saber si
//    Flash-Lite piensa antes de responder (pendiente del diseño, apartado 6).
//  - Quitado IDIOMAS_ORIGEN_EXTRA, que no se usaba.
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

const {
  dividirEnTramos, parrafosDe, esMarcaFoto, mismaEstructura,
  cabeceraDe, huellaCabecera, huellaTramo
} = require('./_tramos'); // compartido con api/moderar.js (v3)

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Instrucciones ──────────────────────────────────────────────────────

function instruccionTramo(destino) {
  return `Traduce al ${destino} este fragmento de una autobiografía publicada. Haz una traducción fiel, clara y natural, que conserve la voz y el tono de quien escribe, sin adornarla, resumirla ni añadir nada. Adapta la puntuación del diálogo y las comillas a la convención propia del ${destino}. Mantén los nombres propios de personas y lugares como en el original. Las líneas entre corchetes, como [FOTO 2], son marcas técnicas: cópialas exactamente igual, cada una en su propia línea. Las líneas que empiezan por ¶ (capítulo) o § (apartado) son títulos: conserva el signo al principio de la línea y traduce solo el texto que lo sigue. Conserva la separación entre párrafos (una línea en blanco) y los guiones bajos de la cursiva (_así_). Devuelve solo la traducción, sin comentarios.`;
}

function instruccionCabecera(destino) {
  return `Traduce al ${destino} el título, el subtítulo y los pies de foto de una autobiografía publicada, que recibirás como un objeto JSON. Haz una traducción fiel, clara y natural, sin adornarla ni añadir nada. Mantén los nombres propios de personas y lugares como en el original. Devuelve exactamente el mismo objeto JSON, con las mismas claves (también las de "pies"), cambiando solo los textos por su traducción. Si un texto está vacío, déjalo vacío.`;
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

const esperar = ms => new Promise(r => setTimeout(r, ms));

// Lectura con un reintento: si Supabase falla (o la red), se espera un momento y se
// prueba otra vez. Leer no gasta nada. El error final lleva el mensaje de Supabase.
async function supabaseGet(ruta) {
  let ultimo = '';
  for (let intento = 0; intento < 2; intento++) {
    if (intento) await esperar(400);
    try {
      const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${ruta}`, { headers: cabecerasServicio() });
      if (r.ok) return r.json();
      const cuerpo = (await r.text().catch(() => '')).slice(0, 300);
      ultimo = `Supabase GET ${r.status}: ${cuerpo}`;
    } catch (e) {
      ultimo = `Supabase GET sin respuesta: ${e.message}`;
    }
    console.error(ultimo, '| intento', intento + 1, '| tabla', ruta.split('?')[0]);
  }
  throw new Error(ultimo);
}

// v3: lo publicado, de la tabla publicaciones. Si no hay fila, el libro no está publicado
// (despublicar y eliminar borran la fila).
async function leerPublicacion(historiaId) {
  const filas = await supabaseGet(
    `publicaciones?historia_id=eq.${historiaId}` +
    `&select=historia_id,titulo,contenido,idioma_original&limit=1`
  );
  return filas[0] || null;
}

async function buscarEnCache(historiaId, idioma, laHuella) {
  const filas = await supabaseGet(
    `traducciones_cache?historia_id=eq.${historiaId}&idioma=eq.${encodeURIComponent(idioma)}` +
    `&huella=eq.${laHuella}&select=contenido_traducido&limit=1`
  );
  return filas[0] ? filas[0].contenido_traducido : null;
}

// v3: el gasto de hoy sale de registro_gasto (sobrevive al borrado de traducciones).
async function gastoDeHoy() {
  const desde = new Date().toISOString().slice(0, 10) + 'T00:00:00Z';
  const filas = await supabaseGet(
    `registro_gasto?servicio=eq.traduccion&fecha=gte.${desde}&select=coste_euros&limit=100000`
  );
  return filas.reduce((n, f) => n + (Number(f.coste_euros) || 0), 0);
}

// v3: una fila por cada traducción pagada (haya salido bien o no). Si no se puede
// anotar, se avisa en el registro de Vercel, pero el lector recibe su traducción.
async function anotarGasto(historiaId, coste, detalle) {
  try {
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/registro_gasto`, {
      method: 'POST',
      headers: { ...cabecerasServicio(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        servicio: 'traduccion',
        historia_id: historiaId,
        coste_euros: Math.round((coste || 0) * 1e6) / 1e6,
        detalle
      })
    });
    if (!r.ok) console.error('No se pudo anotar el gasto:', r.status, await r.text());
  } catch (e) {
    console.error('No se pudo anotar el gasto:', e.message);
  }
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
  const uso = data.usageMetadata || {};
  console.log('Tokens Gemini', JSON.stringify({
    entrada: uso.promptTokenCount || 0,
    salida: uso.candidatesTokenCount || 0,
    pensar: uso.thoughtsTokenCount || 0
  }));
  const texto = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
  return { texto, coste: costeEnEuros(uso) };
}

// Hasta dos intentos. Devuelve { contenido, coste }; contenido es null si no cuadra.
async function traducirTramo(texto, destino) {
  let coste = 0;
  for (let intento = 0; intento < 2; intento++) {
    const r = await llamarGemini(instruccionTramo(destino), texto, false);
    coste += r.coste;
    if (r.texto && mismaEstructura(texto, r.texto)) return { contenido: { texto: r.texto }, coste };
    console.error('Traducción con estructura distinta; intento', intento + 1);
  }
  return { contenido: null, coste }; // v3: lo gastado se anota aunque no sirva
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
  return { contenido: null, coste }; // v3: lo gastado se anota aunque no sirva
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

    // 2. Leer lo publicado (v3: tabla publicaciones).
    const historia = await leerPublicacion(historia_id);
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
      original = cabeceraDe(historia); // v3: pies de la copia publicada
      laHuella = huellaCabecera(historia);
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
      laHuella = huellaTramo(original);
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
    await anotarGasto(historia_id, resultado.coste, {
      idioma, parte: esCabecera ? 'cabecera' : numTramo, valida: !!resultado.contenido, modelo: MODELO
    });
    if (!resultado.contenido) {
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
