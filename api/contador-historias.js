// api/contador-historias.js — Locus Mundi
// Versión 5 · 16/10/2026 · Fase B2, conversación 3c: Pablo ya está en Supabase (Nº 3); el +2 pasa a +1.
// Versión 4 · 16/10/2026 · Fase B2, conversación 3b: Olegario ya está en Supabase (Nº 2); el +3 pasa a +2.
// Versión 3 · 15/10/2026 · Fase B2, conversación 3a: Irene ya está en Supabase (Nº 1); el +4 pasa a +3.
// Versión 2 · 06/10/2026 · Diseño de la moderación v6, §11.2 (dos versiones de cada libro).
// Cambio respecto a la versión anterior: cuenta los libros de la tabla publicaciones (lo que
// de verdad se lee; existir es estar publicado), no las filas de historias en "publicado".
// Nada más cambia.

module.exports = async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // +1 fijo: la historia de muestra que aún vive como dato fijo en el frontend
  // (La vida escrita). Irene (15/10/2026), Olegario y Pablo (16/10/2026) ya están
  // en Supabase. Pendiente: bajar a 0 cuando se publique X. Batlle (conversación 3c;
  // Hoja de Ruta, Fase B2, punto 2).
  const HISTORIAS_MUESTRA_REALES = 1;

  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/publicaciones?select=historia_id`,
      {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          Prefer: 'count=exact',
          Range: '0-0'
        },
      }
    );
    if (!resp.ok) throw new Error(`publicaciones: ${resp.status}`);

    const contentRange = resp.headers.get('content-range');
    const total = (contentRange ? parseInt(contentRange.split('/')[1], 10) || 0 : 0) + HISTORIAS_MUESTRA_REALES;

    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({ total });
  } catch (err) {
    console.error('contador-historias:', err.message);
    res.status(500).json({ error: 'Error al contar historias' });
  }
};
