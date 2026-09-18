module.exports = async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // +4 fijo: las 4 historias de muestra (Irene Vilaseca, Olegario Sotelo,
  // Pablo Cava, La vida escrita) son reales y ya publicadas, pero viven
  // como datos fijos en el frontend, no en Supabase. Pendiente: cuando
  // se migren a Supabase, quitar este +4 (ver Hoja de Ruta, punto 9).
  const HISTORIAS_MUESTRA_REALES = 4;

  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/historias?estado_publicacion=eq.publicado&marcado_borrado=eq.false&select=id`,
      {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          Prefer: 'count=exact',
        },
      }
    );

    const contentRange = resp.headers.get('content-range');
    const total = (contentRange ? parseInt(contentRange.split('/')[1], 10) : 0) + HISTORIAS_MUESTRA_REALES;

    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({ total });
  } catch (err) {
    res.status(500).json({ error: 'Error al contar historias' });
  }
};
