// api/asistente.js — Locus Mundi
// Versión 7 · 08/10/2026 · Diseño de la moderación v10, §6.3 y §11.13, puntos 2 y 3 (Agente
// Editorial, 2.11). Operación nueva "pasaje": el modo "Revisar los pasajes señalados".
//   - Solo con tinta (es el Asistente de pago) y con Flash (§11.13: la conversación del
//     Asistente ya usa Flash). Cada pasaje pedido consume tinta.
//   - El servidor lee el pasaje de la tabla moderaciones y el texto de historias: el navegador
//     solo dice qué libro y qué número de pasaje. La lista no llega entera al navegador.
//   - Devuelve la explicación (idioma de la interfaz) y la propuesta mínima (idioma del libro),
//     salvo en el límite duro (solo explicación: el Asistente no ayuda a reformularlo).
//   - Red de seguridad sin IA (2.11): si la propuesta añade más palabras nuevas de las
//     permitidas, o no es más corta o casi igual de larga, se descarta.
//   - Si el pasaje ya no está en el texto (el Autor lo ha cambiado), no se llama a la IA ni
//     se cobra: responde "cambiado".
// Nada más cambia.
// Versión 6 · 05/10/2026, noche · Cambio respecto a la v5: la instrucción del dictado ya no
// prohíbe tocar las tildes; permite corregirlas según la ortografía, sin cambiar ninguna letra
// ni palabra (la IA ponía bien "qué" y la prohibición era contraproducente; la red de seguridad
// del index.html deja de contar las tildes). Nada más cambia. Ver Continuidad, sesión
// "05/10/2026 (Asistente)".
// Versión 5 · 05/10/2026 · Pendientes del Asistente v6, §4 (Continuidad, sesión
// "05/10/2026 (Asistente)"). Cambio respecto a la v4: la instrucción del dictado es una
// sola, en inglés, y dice en qué idioma está el texto. El navegador envía en "idioma" el
// idioma en que se ha escuchado (etiqueta como "ca-ES"); se siguen aceptando "ES" y "EN"
// del index.html anterior. Una etiqueta que no tenga forma de idioma se ignora (no se
// copia nunca a la instrucción). Se pide además no tocar tildes. Nada más cambia.
// Versión 4 · 03/10/2026 · Diseño de la traducción, apartado 12, paso 7
// (LOCUS_MUNDI_DISENO_TRADUCIR.md v2; Continuidad, sesión "03/10/2026 (lectura nueva)").
// Cambio respecto a la v3: se retira la operación "traduccion" (gratis, sin cuenta y con
// el texto enviado por el navegador: cualquiera podía usarla como traductor de cualquier
// texto). La traducción para lectores la hace ahora api/traducir.js, que lee el texto de
// Supabase. Una petición con operacion "traduccion" recibe OPERACION_DESCONOCIDA.
// Nada más cambia.
// Versión 3 · 30/09/2026 · Paso 5b del plan del Esquema del libro
// (LOCUS_MUNDI_PLAN_ESQUEMA_v3.md; diseño en LOCUS_MUNDI_ESQUEMA_DEL_LIBRO_v5.md).
// Cambio respecto a la v2: las instrucciones fijas de traducción y dictado piden
// conservar los signos de estructura ¶ (capítulo) y § (apartado) al principio de
// línea. Nada más cambia.
// Versión 2 · 29/09/2026 · Pieza 3 (ver Continuidad, sesión 29/09/2026, punto 9).
// Sustituye a la versión que aceptaba cualquier petición sin sesión ni saldo.
//
// Cada petición indica su "operacion" (todas de pago):
//   dictado      → tinta. Flash-Lite. Instrucciones fijas aquí.
//   revision     → tinta. Flash-Lite. Instrucciones compuestas en la web.
//   conversacion → tinta. Flash. Instrucciones compuestas en la web.
//   pasaje       → tinta. Flash. Instrucciones fijas aquí (v7).
// (moderacion se añadirá después, en api/moderar.js o aquí.)
//
// Exigen sesión de Supabase y tinta > 0. Tras cada respuesta
// se resta el coste real, calculado con usageMetadata de Gemini.
//
// Variables de entorno (Vercel): GEMINI_API_KEY, SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY.

// ─── Constantes (todo lo que puede cambiar, en un solo sitio) ───────────

const MODELOS = {
  dictado:      'gemini-3.5-flash-lite',
  revision:     'gemini-3.5-flash-lite',
  conversacion: 'gemini-3.5-flash'
};

// Dólares por millón de tokens (precio oficial de Google). Los tokens de
// "pensamiento" se cobran como salida.
// OJO: duplicado en api/traducir.js; si cambian los precios, cambiarlos en los dos.
const PRECIOS_USD = {
  'gemini-3.5-flash':      { entrada: 1.50, salida: 9.00 },
  'gemini-3.5-flash-lite': { entrada: 0.30, salida: 2.50 }
};

// Cambio dólar → euro. Algo por encima del real: mejor restar de más
// que de menos. Revisar de vez en cuando.
const DOLAR_A_EURO = 0.90;

// Tamaño máximo de todo lo enviado (caracteres),
// para que una petición no pueda vaciar la tinta de golpe por error.
const MAX_PAGO = 400000;
const MAX_TURNOS_HISTORIAL = 40;

// ─── Instrucciones fijas ────────────────────────────────────────────────

// Nombre (en inglés) de cada idioma de dictado. Las etiquetas vienen del selector 🌐 del
// editor o del idioma del libro. Las que no estén aquí se nombran "the original language".
const IDIOMAS_DICTADO = {
  es: 'Spanish', en: 'English', ca: 'Catalan', gl: 'Galician', eu: 'Basque',
  fr: 'French', de: 'German', it: 'Italian', nl: 'Dutch', pl: 'Polish', ro: 'Romanian',
  'pt-PT': 'European Portuguese (Portugal)', 'pt-BR': 'Brazilian Portuguese', pt: 'Portuguese',
  ar: 'Arabic', zh: 'Chinese', ko: 'Korean', hi: 'Hindi', ja: 'Japanese', ru: 'Russian'
};

// "ca-ES" → "Catalan"; "pt-BR" → "Brazilian Portuguese"; "ES"/"EN" (index.html anterior)
// → "Spanish"/"English". Solo se aceptan etiquetas con forma de idioma.
function nombreIdioma(idioma) {
  const s = String(idioma || '').trim();
  if (s === 'EN') return 'English';
  if (s === 'ES' || !s) return 'Spanish';
  if (!/^[A-Za-z]{2,3}(-[A-Za-z]{2,4})?$/.test(s)) return null;
  const [base, region] = s.split('-');
  const b = base.toLowerCase();
  if (b === 'pt' && region) {
    const r = region.toUpperCase();
    if (IDIOMAS_DICTADO['pt-' + r]) return IDIOMAS_DICTADO['pt-' + r];
  }
  return IDIOMAS_DICTADO[b] || null;
}

function instruccionesDictado(idioma) {
  const nombre = nombreIdioma(idioma);
  const lengua = nombre || 'the original language';
  return `The following text is a literal transcript of speech in ${lengua}. ` +
    `Fix ONLY capitalization and punctuation, following the rules of ${lengua}. ` +
    'You may correct accent marks where the spelling requires it, but do not change, add, remove, reorder, translate or rephrase a single word. ' +
    'If a line starts with the sign ¶ or §, keep that sign exactly as it is. ' +
    'Return only the corrected text, nothing else.';
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

// ─── v7: modo "Revisar los pasajes señalados" (operación "pasaje") ──────

const MODELO_PASAJE = 'gemini-3.5-flash';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const IDIOMAS_LIBRO = {
  ES: 'Spanish', CA: 'Catalan', GL: 'Galician', EU: 'Basque', EN: 'English', FR: 'French',
  DE: 'German', IT: 'Italian', 'PT-BR': 'Brazilian Portuguese', 'PT-PT': 'European Portuguese',
  PT: 'Portuguese', NL: 'Dutch', PL: 'Polish', RO: 'Romanian', RU: 'Russian', AR: 'Arabic',
  ZH: 'Chinese', JA: 'Japanese', KO: 'Korean', HI: 'Hindi'
};

const NOMBRES_TIPO = {
  duro: 'hard limit (it cannot be published in any form)',
  tercero: 'serious private facts about another living, identifiable person',
  menor: 'private facts about an identifiable minor of today',
  colectivo: 'offensive or discriminatory language against a group',
  sexual: 'explicit sexual description'
};

function instruccionesPasaje({ interfaz, libro, nombre, tratamiento, duro }) {
  const lenguaInterfaz = interfaz === 'EN' ? 'English' : 'Spanish';
  const lenguaLibro = IDIOMAS_LIBRO[libro] || 'the language of the book';
  const trato = interfaz === 'EN' ? '' :
    ` Address the author as "${tratamiento}" (${tratamiento === 'usted' ? 'formal' : 'informal'} Spanish).`;
  return [
    'You are the editorial assistant of Locus Mundi, an online library of autobiographies. You help the author, never replace them.',
    'Before publishing, the library\'s review flagged one passage of the author\'s book. The rules of the library are the same for everyone; you help the author comply with them.',
    `1. "explicacion": in ${lenguaInterfaz}, one or two plain, kind sentences explaining why this passage was flagged, based on the reason given. You may use the author's first name (${nombre || 'unknown'}) once, naturally.${trato} No legal jargon. Do not lecture.`,
    duro
      ? '2. "propuesta": always an empty string. This passage falls under the hard limit: you must not help reword it. In the explanation, say respectfully that it cannot be published and that the author can delete it.'
      : `2. "propuesta": in ${lenguaLibro}, the passage with the MINIMAL change that solves the problem: remove or replace only the data that motivated the flag (a name, a family relationship, the graphic detail, the statement about health…). Keep every other word of the author exactly as it is, in the same order, with the author's own voice. Never add facts, names, dates, places or opinions. A short neutral replacement ("una persona", "un familiar") is allowed. If the only solution is to delete the whole passage, return an empty string.`,
    'Return only JSON: {"explicacion": "...", "propuesta": "..."}.'
  ].join('\n');
}

// Palabras (minúsculas, sin puntuación) para la red de seguridad.
function palabras(texto) {
  return String(texto || '').toLowerCase().normalize('NFC').match(/[\p{L}\p{N}]+/gu) || [];
}

// Red de seguridad sin IA (Agente Editorial 2.11): la propuesta solo puede quitar o
// sustituir. Se admiten hasta max(3, 15 % de la cita) palabras que no estaban, y nunca más
// de 3 palabras por encima de la longitud de la cita. Igual a la cita, no sirve.
function propuestaAceptable(cita, propuesta) {
  const a = palabras(cita), b = palabras(propuesta);
  if (!b.length) return true; // suprimir entero
  if (b.join(' ') === a.join(' ')) return false;
  if (b.length > a.length + 3) return false;
  const disponibles = new Map();
  a.forEach(w => disponibles.set(w, (disponibles.get(w) || 0) + 1));
  let nuevas = 0;
  for (const w of b) {
    const n = disponibles.get(w) || 0;
    if (n > 0) disponibles.set(w, n - 1); else nuevas++;
  }
  return nuevas <= Math.max(3, Math.ceil(a.length * 0.15));
}

async function leerFilasServicio(ruta) {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${ruta}`, { headers: cabecerasServicio() });
  if (!r.ok) throw new Error(`leer ${ruta.split('?')[0]}: ${r.status}`);
  return r.json();
}

// Dónde está hoy la cita: el párrafo del texto que la contiene, o el campo de la cabecera.
function contextoDeLaCita(pasaje, contenido) {
  if (!pasaje.cita) return null;
  if (pasaje.clase === 'cabecera') {
    if (pasaje.campo && pasaje.campo.startsWith('pie:')) return { contexto: null, deCabecera: true }; // el pie se comprueba aparte
    const v = String(contenido[pasaje.campo] || '');
    return v.includes(pasaje.cita) ? { contexto: v, deCabecera: true } : null;
  }
  const parrafos = String(contenido.text || '').replace(/\r\n?/g, '\n').split(/\n\s*\n/);
  const p = parrafos.find(x => x.includes(pasaje.cita));
  if (p) return { contexto: p.trim() };
  return String(contenido.text || '').includes(pasaje.cita) ? { contexto: pasaje.cita } : null; // cita de varios párrafos
}

async function pasaje(body, autorId, res) {
  const { historia_id, indice, interfaz } = body;
  if (!UUID.test(String(historia_id || '')) || !Number.isInteger(indice) || indice < 0) {
    return res.status(400).json({ error: 'PETICION_NO_VALIDA' });
  }
  const saldo = await leerTinta(autorId);
  if (!saldo || saldo.tinta <= 0) {
    return res.status(402).json({ error: 'SIN_TINTA', tinta: 0, ultimaCarga: saldo?.ultimaCarga || 0 });
  }
  const h = (await leerFilasServicio(
    `historias?id=eq.${historia_id}&select=id,autor_id,marcado_borrado,contenido,idioma_original&limit=1`
  ))[0];
  if (!h || h.autor_id !== autorId || h.marcado_borrado === true) return res.status(404).json({ error: 'NO_ENCONTRADA' });
  const m = (await leerFilasServicio(`moderaciones?historia_id=eq.${h.id}&select=resultado,pasajes&limit=1`))[0];
  const lista = (m && ['pasajes', 'conjunto', 'limite_duro'].includes(m.resultado) && m.pasajes) || [];
  if (!lista.length) return res.status(404).json({ error: 'SIN_PASAJES' });
  if (indice >= lista.length) return res.status(404).json({ error: 'FIN', total: lista.length });

  const p = lista[indice];
  const c = h.contenido || {};
  const publico = {
    id: p.id, clase: p.clase, tipo: p.tipo, cita: p.cita, tituloCapitulo: p.tituloCapitulo,
    campo: p.campo || null, bloqueado: !!p.bloqueado
  };
  const base = { total: lista.length, indice, pasaje: publico };
  const motivo = interfaz === 'EN' ? p.motivo_en : p.motivo_es;

  // Fragmento que no se pudo revisar: solo su motivo, sin IA y sin coste.
  if (p.bloqueado) return res.status(200).json({ ...base, explicacion: motivo, propuesta: null, tinta: saldo.tinta, ultimaCarga: saldo.ultimaCarga });

  // ¿Sigue en el texto? Si no, no se cobra nada.
  let ctx = contextoDeLaCita(p, c);
  if (ctx && ctx.deCabecera && !ctx.contexto) {
    const fotoId = String(p.campo).slice(4);
    const f = UUID.test(fotoId) && (await leerFilasServicio(`fotos?id=eq.${fotoId}&select=pie_foto&limit=1`))[0];
    ctx = f && String(f.pie_foto || '').includes(p.cita) ? { contexto: String(f.pie_foto), deCabecera: true } : null;
  }
  if (!ctx) return res.status(200).json({ ...base, cambiado: true, tinta: saldo.tinta, ultimaCarga: saldo.ultimaCarga });

  const duro = p.tipo === 'duro';
  const sistema = instruccionesPasaje({
    interfaz: interfaz === 'EN' ? 'EN' : 'ES',
    libro: String(h.idioma_original || c.lang || 'ES').toUpperCase(),
    nombre: String(c.assistantName || c.name || '').trim().split(/\s+/)[0] || '',
    tratamiento: c.assistantTuUsted === 'usted' ? 'usted' : 'tú',
    duro
  });
  const mensaje = JSON.stringify({
    passage: p.cita,
    reason_type: NOMBRES_TIPO[p.tipo] || p.tipo,
    reason: p.motivo_en || p.motivo_es,
    context: ctx.contexto
  });

  const body2 = {
    system_instruction: { parts: [{ text: sistema }] },
    contents: [{ role: 'user', parts: [{ text: mensaje }] }],
    generationConfig: { responseMimeType: 'application/json' }
  };
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODELO_PASAJE}:generateContent`,
    { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY }, body: JSON.stringify(body2) }
  );
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error('asistente: pasaje, Gemini', r.status, data?.error?.message);
    return res.status(502).json({ error: 'ERROR_ASISTENTE' });
  }
  const coste = costeEnEuros(MODELO_PASAJE, data.usageMetadata);
  const despues = await restarTinta(autorId, coste);
  const texto = (data.candidates?.[0]?.content?.parts || []).map(x => x.text || '').join('').trim();
  let j = null;
  try { j = JSON.parse(texto.replace(/^```(?:json)?|```$/g, '').trim()); } catch (_) { j = null; }

  // Si Google no responde (bloqueo) o la respuesta no se puede leer: el motivo, sin propuesta.
  const explicacion = (j && typeof j.explicacion === 'string' && j.explicacion.trim()) || motivo;
  let propuesta = null, descartada = false;
  if (!duro && j && typeof j.propuesta === 'string') {
    if (propuestaAceptable(p.cita, j.propuesta)) propuesta = j.propuesta.trim();
    else descartada = true;
  }
  return res.status(200).json({
    ...base, explicacion, propuesta, descartada,
    tinta: despues ? despues.tinta : 0,
    ultimaCarga: despues ? despues.ultimaCarga : saldo.ultimaCarga
  });
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

    // v7: modo de pasajes. No usa userMsg: el servidor lee el pasaje y el texto.
    if (operacion === 'pasaje') {
      const autor = await autorDeLaSesion(token);
      if (!autor) { res.status(401).json({ error: 'SIN_SESION' }); return; }
      await pasaje(req.body || {}, autor, res);
      return;
    }

    // "traduccion" ya no existe aquí (v4): cae en OPERACION_DESCONOCIDA.
    if (!MODELOS[operacion]) {
      res.status(400).json({ error: 'OPERACION_DESCONOCIDA' });
      return;
    }
    if (!userMsg || typeof userMsg !== 'string') {
      res.status(400).json({ error: 'Falta userMsg' });
      return;
    }

    const modelo = MODELOS[operacion];

    // ── Sesión y tinta ──
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
