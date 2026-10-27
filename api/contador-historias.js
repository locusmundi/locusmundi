// api/contador-historias.js — Locus Mundi
// Versión 8 · 27/10/2026 · Fase C, endurecimiento parte 3 (E3, registro de errores). Continuidad, sesión
// "27/10/2026 (endurecimiento, parte 3)".
//  POST { error: { mensaje, pagina } } guarda un fallo del navegador en la tabla cerrada `errores`
//  (solo el servidor la lee; se borra a los 30 días, api/diario.js v1.6). Sin IP, cuenta ni cookie.
//  Frenos: el navegador manda como mucho 5 por visita; aquí se recorta el texto (500 caracteres) y,
//  si ya hay 200 en la última hora, se descarta (que nadie llene la tabla). Siempre responde 204.
//  Va en esta función porque el plan Hobby de Vercel no admite una 13.ª.
// Versión 7 · 18/10/2026 · Fase B2, punto 12 (Biblioteca escalable), conversación 8.
// Cambios respecto a la v6:
//  (1) GET devuelve las cifras del Inicio contadas en el servidor: { total, paises, idiomas }
//      (función cifras_biblioteca de Supabase; países sin mayúsculas ni acentos). Antes, solo { total };
//      países e idiomas se contaban en el navegador sobre los libros descargados enteros.
//      Respuesta guardada 60 s en la caché de Vercel: con millones de visitas, Supabase cuenta una vez por minuto.
//  (2) POST { historia_id } suma una lectura (función sumar_lectura; solo libros publicados). Contador
//      aproximado y sin datos personales: no se guarda IP, cuenta ni cookie; el freno (una vez por libro y
//      pestaña; el Autor no se cuenta) está en el navegador. No se muestra. Ver Continuidad, sesión
//      "18/10/2026 (conversación 7)", decisión 4.
//  Se retira HISTORIAS_MUESTRA_REALES (0 desde la v6): todas las muestras están en Supabase.
// Versión 6 · 16/10/2026 · Fase B2, conversación 3c: X. Batlle ya está en Supabase (Nº 4); el +1 pasa a 0.
// Versiones 2–5 · 06–16/10/2026 · Cuenta publicaciones; bajada del +N muestra a muestra.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const rpc = (nombre, args) => fetch(`${SUPABASE_URL}/rest/v1/rpc/${nombre}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args || {})
  });

  // ---- Lectura: abrir un libro = 1 -------------------------------------------------------
  if (req.method === 'POST') {
    res.setHeader('Cache-Control', 'no-store');
    try {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
      if (body && body.error) return await guardarError(body.error, SUPABASE_URL, SERVICE_KEY, res); // v8
      const id = String((body && body.historia_id) || '');
      if (!UUID_RE.test(id)) return res.status(400).json({ error: 'historia_id' });
      const r = await rpc('sumar_lectura', { p_historia_id: id.toLowerCase() });
      if (!r.ok) throw new Error(`sumar_lectura: ${r.status}`);
      return res.status(204).end();
    } catch (err) {
      console.error('contador-historias (lectura):', err.message);
      return res.status(500).json({ error: 'Error al contar la lectura' });
    }
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  // ---- Cifras del Inicio y de la Biblioteca ----------------------------------------------
  try {
    const r = await rpc('cifras_biblioteca');
    if (!r.ok) throw new Error(`cifras_biblioteca: ${r.status}`);
    const d = await r.json();
    const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ total: num(d && d.total), paises: num(d && d.paises), idiomas: num(d && d.idiomas) });
  } catch (err) {
    console.error('contador-historias:', err.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ error: 'Error al contar historias' });
  }
};

// ---- v8: fallos del navegador ------------------------------------------------------------
const LIMITE_POR_HORA = 200;
async function guardarError(e, url, llave, res) {
  try {
    const cabeceras = { apikey: llave, Authorization: `Bearer ${llave}` };
    const hace1h = new Date(Date.now() - 3600000).toISOString();
    const c = await fetch(`${url}/rest/v1/errores?fecha=gt.${encodeURIComponent(hace1h)}&select=id`, {
      method: 'HEAD', headers: { ...cabeceras, Prefer: 'count=exact' }
    });
    const total = Number(((c.headers.get('content-range') || '').split('/')[1]) || 0);
    if (c.ok && total < LIMITE_POR_HORA) {
      const texto = (v, n) => String(v == null ? '' : v).slice(0, n);
      const r = await fetch(`${url}/rest/v1/errores`, {
        method: 'POST',
        headers: { ...cabeceras, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ origen: 'navegador', mensaje: texto(e.mensaje, 500) || '(sin texto)', pagina: texto(e.pagina, 200) })
      });
      if (!r.ok) console.error('contador-historias (error):', r.status);
    }
  } catch (err) {
    console.error('contador-historias (error):', err.message);
  }
  return res.status(204).end();
}
