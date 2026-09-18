module.exports = async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

    const contentRange = resp.headers.get('content-range'); // formato "0-9/23"
    const total = contentRange ? parseInt(contentRange.split('/')[1], 10) : 0;

    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({ total });
  } catch (err) {
    res.status(500).json({ error: 'Error al contar historias' });
  }
};
