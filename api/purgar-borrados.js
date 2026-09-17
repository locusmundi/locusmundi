module.exports = async function handler(req, res) {
  const auth = req.headers["authorization"] || "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  const supabaseUrl = "https://olpfybpykuascwltnqtv.supabase.co";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const limite = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/historias?marcado_borrado=eq.true&fecha_marcado_borrado=lt.${encodeURIComponent(limite)}`,
      {
        method: "DELETE",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          Prefer: "return=representation"
        }
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      res.status(500).json({ error: errText });
      return;
    }

    const borradas = await response.json();
    res.status(200).json({ ok: true, purgadas: borradas.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
