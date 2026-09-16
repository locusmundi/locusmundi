// api/contador-autores.js
// Devuelve cuántos Autores hay registrados en total. Protegido con una clave
// propia (?clave=...) para que no cualquiera pueda consultarlo desde fuera.
// Usa la llave de servicio de Supabase (SUPABASE_SERVICE_ROLE_KEY) porque la
// tabla `autores` no permite lectura pública ni siquiera para contar filas.
export default async function handler(req, res) {
  if (req.query.clave !== process.env.CONTADOR_CLAVE) {
    res.status(403).send("No autorizado");
    return;
  }

  try {
    const r = await fetch(
      "https://olpfybpykuascwltnqtv.supabase.co/rest/v1/autores?select=id",
      {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          Prefer: "count=exact",
          Range: "0-0"
        }
      }
    );
    const contentRange = r.headers.get("content-range"); // ej. "0-0/12"
    const total = contentRange ? contentRange.split("/")[1] : "?";
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(200).send(`Autores registrados en Locus Mundi: ${total}`);
  } catch (err) {
    res.status(500).send("Error al consultar Supabase");
  }
}
