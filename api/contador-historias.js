// api/contador-historias.js — Locus Mundi
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
