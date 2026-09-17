module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido" });
    return;
  }

  const { accion, autor_id } = req.body || {};
  const accionesValidas = ["alta", "publicacion", "despublicacion"];
  if (!accionesValidas.includes(accion) || !autor_id) {
    res.status(400).json({ error: "Datos incompletos" });
    return;
  }

  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket.remoteAddress ||
    "";

  const supabaseUrl = "https://olpfybpykuascwltnqtv.supabase.co";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/registro_lssi`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`
      },
      body: JSON.stringify({ autor_id, accion, ip })
    });

    if (!response.ok) {
      const errText = await response.text();
      res.status(500).json({ error: errText });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
