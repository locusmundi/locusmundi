// api/backup-semanal.js — Locus Mundi
// Versión 2 · 06/10/2026 · Diseño de la moderación v6, §11.2 (dos versiones de cada libro).
// Cambio respecto a la versión anterior: la copia semanal guarda, además de historias (lo que
// el Autor escribe), la tabla publicaciones (lo que se lee), que puede ser distinta. Archivo
// nuevo: backups/copia-AAAA-MM-DD.json con { fecha, historias, publicaciones }.
// Pendientes que siguen (no de esta versión): la copia no incluye la tabla fotos, y las
// copias no caducan (Hoja de Ruta, prioridad alta).

async function leerTabla(tabla) {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${tabla}?select=*`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!r.ok) throw new Error(`Fallo leyendo ${tabla}: ${await r.text()}`);
  return r.json();
}

module.exports = async function handler(req, res) {
  // Protegido igual que el cron de purgado, con el mismo secreto
  const secret = req.headers['authorization'];
  if (!process.env.CRON_SECRET || secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    // 1. Leer las dos tablas con la llave de servicio
    const historias = await leerTabla('historias');
    const publicaciones = await leerTabla('publicaciones');

    // 2. Nombre de archivo con la fecha de hoy (UTC)
    const hoy = new Date().toISOString().slice(0, 10); // AAAA-MM-DD
    const nombreArchivo = `backups/copia-${hoy}.json`;
    const contenido = JSON.stringify({ fecha: hoy, historias, publicaciones }, null, 2);
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
      publicaciones_guardadas: publicaciones.length,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Error inesperado', detalle: String(err.message || err) });
  }
};
