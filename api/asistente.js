// api/asistente.js — Locus Mundi
// Versión 3 · 30/09/2026 · Paso 5b del plan del Esquema del libro
// (LOCUS_MUNDI_PLAN_ESQUEMA_v3.md; diseño en LOCUS_MUNDI_ESQUEMA_DEL_LIBRO_v5.md).
// Cambio respecto a la v2: las instrucciones fijas de traducción y dictado piden
// conservar los signos de estructura ¶ (capítulo) y § (apartado) al principio de
// línea. Nada más cambia.
// Versión 2 · 29/09/2026 · Pieza 3 (ver Continuidad, sesión 29/09/2026, punto 9).
// Sustituye a la versión que aceptaba cualquier petición sin sesión ni saldo.
//
// Cada petición indica su "operacion":
//   traduccion   → gratis, sin cuenta. Instrucciones fijas aquí. Límite de tamaño.
//   dictado      → tinta. Flash-Lite. Instrucciones fijas aquí.
//   revision     → tinta. Flash-Lite. Instrucciones compuestas en la web.
//   conversacion → tinta. Flash. Instrucciones compuestas en la web.
// (moderacion se añadirá después, en api/moderar.js o aquí.)
//
// Las de pago exigen sesión de Supabase y tinta > 0. Tras cada respuesta
// se resta el coste real, calculado con usageMetadata de Gemini.
//
// Variables de entorno (Vercel): GEMINI_API_KEY, SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY.

// ─── Constantes (todo lo que puede cambiar, en un solo sitio) ───────────

const MODELOS = {
  traduccion:   'gemini-3.5-flash',       // la de hoy; la sustituirá api/traducir.js
  dictado:      'gemini-3.5-flash-lite',
  revision:     'gemini-3.5-flash-lite',
  conversacion: 'gemini-3.5-flash'
};

// Dólares por millón de tokens (precio oficial de Google). Los tokens de
// "pensamiento" se cobran como salida.
const PRECIOS_USD = {
  'gemini-3.5-flash':      { entrada: 1.50, salida: 9.00 },
  'gemini-3.5-flash-lite': { entrada: 0.30, salida: 2.50 }
};

// Cambio dólar → euro. Algo por encima del real: mejor restar de más
// que de menos. Revisar de vez en cuando.
const DOLAR_A_EURO = 0.90;

// Traducción gratuita: tamaño máximo del texto (caracteres).
const MAX_TRADUCCION = 250000;

// Operaciones de pago: tamaño máximo de todo lo enviado (caracteres),
// para que una petición no pueda vaciar la tinta de golpe por error.
const MAX_PAGO = 400000;
const MAX_TURNOS_HISTORIAL = 40;

const OPERACIONES_PAGO = ['dictado', 'revision', 'conversacion'];

// ─── Instrucciones fijas ────────────────────────────────────────────────

function instruccionesTraduccion(idioma) {
  return `Eres un traductor literario. Traduce este texto autobiográfico al ${idioma} preservando la voz personal. Adapta también la puntuación del diálogo y las comillas a la convención propia del ${idioma} —no conserves el guion de diálogo ni las comillas angulares del original si esa no es la convención habitual en el idioma de destino—. Las líneas entre corchetes, como [FOTO 2], son marcas técnicas: cópialas exactamente igual, sin traducirlas ni cambiarlas. Las líneas que empiezan por el signo ¶ (capítulo) o § (apartado) son títulos: conserva ese signo exactamente al principio de la línea, con la línea separada del resto como en el original, y traduce solo el texto que lo sigue. Solo la traducción.`;
}

function instruccionesDictado(idiomaInterfaz) {
  if (idiomaInterfaz === 'EN') {
    return 'Fix ONLY capitalization and punctuation in the following literal speech transcript. Do not change, add, remove, reorder or rephrase a single word. If a line starts with the sign ¶ or §, keep that sign exactly as it is. Return only the corrected text, nothing else.';
  }
  return 'Corrige ÚNICAMENTE las mayúsculas y los signos de puntuación del siguiente texto, transcrito literalmente de un dictado por voz. No cambies, añadas, quites, reordenes ni reformules ni una sola palabra. Si una línea empieza por el signo ¶ o §, conserva ese signo exactamente igual. Devuelve solo el texto corregido, sin nada más.';
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

// Devuelve el id del Autor si el token de sesión es válido; si no, null.
async function autorDeLaSesion(token) {
  if (!token) return null;
  const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${token}`
    }
  });
  if (!r.ok) return null;
  const usuario = await r.json();
  return usuario?.id || null;
}

async function leerTinta(autorId) {
  const r = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/autores?id=eq.${autorId}&select=tinta_euros,tinta_ultima_carga`,
    { headers: cabecerasServicio() }
  );
  if (!r.ok) throw new Error('No se pudo leer la tinta');
  const filas = await r.json();
  if (!filas.length) return null;
  return {
    tinta: Number(filas[0].tinta_euros) || 0,
    ultimaCarga: Number(filas[0].tinta_ultima_carga) || 0
  };
}

// Resta el coste sin perder descuentos si llegan dos peticiones a la vez:
// solo escribe si la tinta sigue siendo la que se leyó; si no, relee y
// vuelve a intentarlo. Nunca baja de 0.
async function restarTinta(autorId, costeEuros) {
  for (let intento = 0; intento < 4; intento++) {
    const actual = await leerTinta(autorId);
    if (!actual) return null;
    const nueva = Math.max(0, Math.round((actual.tinta - costeEuros) * 1e6) / 1e6);
    const r = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/autores?id=eq.${autorId}&tinta_euros=eq.${actual.tinta}`,
      {
        method: 'PATCH',
        headers: { ...cabecerasServicio(), Prefer: 'return=representation' },
        body: JSON.stringify({ tinta_euros: nueva })
      }
    );
    if (!r.ok) throw new Error('No se pudo restar la tinta');
    const filas = await r.json();
    if (filas.length) return { tinta: nueva, ultimaCarga: actual.ultimaCarga };
  }
  throw new Error('No se pudo restar la tinta tras varios intentos');
}

// ─── Gemini ─────────────────────────────────────────────────────────────

function costeEnEuros(modelo, uso) {
  const p = PRECIOS_USD[modelo];
  const entrada = uso?.promptTokenCount || 0;
  const salida = (uso?.candidatesTokenCount || 0) + (uso?.thoughtsTokenCount || 0);
  const dolares = (entrada * p.entrada + salida * p.salida) / 1e6;
  return dolares * DOLAR_A_EURO;
}

async function llamarGemini(modelo, sistema, historial, mensaje) {
  const contents = [
    ...historial.map(turno => ({
      role: turno.role === 'model' ? 'model' : 'user',
      parts: [{ text: String(turno.text || '') }]
    })),
    { role: 'user', parts: [{ text: mensaje }] }
  ];
  const body = { contents };
  if (sistema) body.system_instruction = { parts: [{ text: sistema }] };

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY
      },
      body: JSON.stringify(body)
    }
  );
  const data = await r.json();
  if (!r.ok) {
    console.error('Error de Gemini:', data);
    const e = new Error(data.error?.message || 'Error al llamar a Gemini');
    e.status = r.status;
    throw e;
  }
  const texto = (data.candidates?.[0]?.content?.parts || [])
    .map(p => p.text || '')
    .join('');
  return { texto, uso: data.usageMetadata };
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
    const { operacion, token, system, userMsg, history, idioma } = req.body || {};

    if (!MODELOS[operacion]) {
      res.status(400).json({ error: 'OPERACION_DESCONOCIDA' });
      return;
    }
    if (!userMsg || typeof userMsg !== 'string') {
      res.status(400).json({ error: 'Falta userMsg' });
      return;
    }

    const modelo = MODELOS[operacion];

    // ── Traducción para lectores: gratis, sin cuenta ──
    if (operacion === 'traduccion') {
      const idiomaLimpio = String(idioma || '').replace(/[\r\n]/g, ' ').trim().slice(0, 40);
      if (!idiomaLimpio) {
        res.status(400).json({ error: 'Falta idioma' });
        return;
      }
      if (userMsg.length > MAX_TRADUCCION) {
        res.status(413).json({ error: 'TEXTO_DEMASIADO_LARGO' });
        return;
      }
      const { texto } = await llamarGemini(modelo, instruccionesTraduccion(idiomaLimpio), [], userMsg);
      res.status(200).json({ text: texto });
      return;
    }

    // ── Operaciones de pago: sesión y tinta ──
    const autorId = await autorDeLaSesion(token);
    if (!autorId) {
      res.status(401).json({ error: 'SIN_SESION' });
      return;
    }

    const saldo = await leerTinta(autorId);
    if (!saldo || saldo.tinta <= 0) {
      res.status(402).json({ error: 'SIN_TINTA', tinta: 0, ultimaCarga: saldo?.ultimaCarga || 0 });
      return;
    }

    let sistema;
    let historial = [];
    if (operacion === 'dictado') {
      sistema = instruccionesDictado(idioma);
    } else {
      sistema = typeof system === 'string' ? system : '';
      historial = Array.isArray(history) ? history.slice(-MAX_TURNOS_HISTORIAL) : [];
    }

    const tamano = sistema.length + userMsg.length +
      historial.reduce((n, t) => n + String(t?.text || '').length, 0);
    if (tamano > MAX_PAGO) {
      res.status(413).json({ error: 'TEXTO_DEMASIADO_LARGO' });
      return;
    }

    const { texto, uso } = await llamarGemini(modelo, sistema, historial, userMsg);
    const coste = costeEnEuros(modelo, uso);
    const despues = await restarTinta(autorId, coste);

    res.status(200).json({
      text: texto,
      tinta: despues ? despues.tinta : 0,
      ultimaCarga: despues ? despues.ultimaCarga : saldo.ultimaCarga
    });
  } catch (err) {
    console.error('Error en asistente.js:', err);
    res.status(err.status && err.status < 600 ? err.status : 500)
      .json({ error: 'Error interno del servidor' });
  }
};
