module.exports = async function handler(req, res) {
  // Protegido igual que el cron de purgado, con el mismo secreto
  const secret = req.headers['authorization'];
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    // 1. Leer todas las historias desde Supabase con la llave de servicio
    const supaRes = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/historias?select=*`,
      {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );

    if (!supaRes.ok) {
      const errText = await supaRes.text();
      return res.status(500).json({ error: 'Fallo leyendo Supabase', detalle: errText });
    }

    const historias = await supaRes.json();

    // 2. Preparar el nombre de archivo con la fecha de hoy (UTC)
    const hoy = new Date().toISOString().slice(0, 10); // AAAA-MM-DD
    const nombreArchivo = `backups/historias-${hoy}.json`;
    const contenido = JSON.stringify(historias, null, 2);
    const contenidoBase64 = Buffer.from(contenido, 'utf-8').toString('base64');

    // 3. Subir el archivo al repositorio locusmundi-backups vía GitHub API
    const githubRes = await fetch(
      `https://api.github.com/repos/locusmundi/locusmundi-backups/contents/${nombreArchivo}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_BACKUP_TOKEN}`,
          Accept: 'application/vnd.github+json',
        },
        body: JSON.stringify({
          message: `Backup semanal ${hoy}`,
          content: contenidoBase64,
        }),
      }
    );

    if (!githubRes.ok) {
      const errText = await githubRes.text();
      return res.status(500).json({ error: 'Fallo subiendo a GitHub', detalle: errText });
    }

    return res.status(200).json({
      ok: true,
      archivo: nombreArchivo,
      historias_guardadas: historias.length,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Error inesperado', detalle: String(err) });
  }
};
