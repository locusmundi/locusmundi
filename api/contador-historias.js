// api/contador-historias.js — Locus Mundi
// Versión 2 · 06/10/2026 · Diseño de la moderación v6, §11.2 (dos versiones de cada libro).
// Cambio respecto a la versión anterior: cuenta los libros de la tabla publicaciones (lo que
// de verdad se lee; existir es estar publicado), no las filas de historias en "publicado".
// Nada más cambia.

module.exports = async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // +4 fijo: las 4 historias de muestra (Irene Vilaseca, Olegario Sotelo,
  // Pablo Cava, La vida escrita) son reales y ya publicadas, pero viven
  // como datos fijos en el frontend, no en Supabase. Pendiente: cuando
  // se migren a Supabase, quitar este +4 (Hoja de Ruta, Fase B2, punto 2).
  const HISTORIAS_MUESTRA_REALES = 4;

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
