// api/admin.js
// Acción de administrador sobre una historia: "retirar" (despublicar) o "modificar"
// (sustituir el texto completo). Protegido con ADMIN_CLAVE, propia y distinta de
// SUPABASE_SERVICE_ROLE_KEY y de CONTADOR_CLAVE. Cada uso queda registrado en
// admin_log con motivo obligatorio y el contenido anterior, por si hay que revisarlo.
// Solo se llama desde admin.html vía POST, nunca desde el navegador directamente.

const SUPABASE_URL = "https://olpfybpykuascwltnqtv.supabase.co";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido" });
    return;
  }

  const { clave, historia_id, accion, motivo, nuevo_texto, realizado_por } = req.body || {};

  if (clave !== process.env.ADMIN_CLAVE) {
    res.status(403).json({ error: "Clave incorrecta" });
    return;
  }
  if (!historia_id || !accion || !motivo || !realizado_por) {
    res.status(400).json({ error: "Faltan datos (historia_id, accion, motivo, realizado_por)" });
    return;
  }
  if (!["retirar", "modificar"].includes(accion)) {
    res.status(400).json({ error: "Acción no reconocida" });
    return;
  }
  if (accion === "modificar" && !nuevo_texto) {
    res.status(400).json({ error: "Falta nuevo_texto para la acción modificar" });
    return;
  }

  const headers = {
    "Content-Type": "application/json",
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  };

  try {
    const getRes = await fetch(
      `${SUPABASE_URL}/rest/v1/historias?id=eq.${historia_id}&select=id,contenido,estado_publicacion`,
      { headers }
    );
    const rows = await getRes.json();
    if (!rows || !rows.length) {
      res.status(404).json({ error: "Historia no encontrada" });
      return;
    }
    const historiaActual = rows[0];

    let cambios = {};
    if (accion === "retirar") {
      cambios = { estado_publicacion: "despublicado" };
    } else {
      cambios = { contenido: { ...historiaActual.contenido, text: nuevo_texto } };
    }

    const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/historias?id=eq.${historia_id}`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify(cambios),
    });
    if (!patchRes.ok) {
      throw new Error("Error al actualizar la historia: " + (await patchRes.text()));
    }

    const logRes = await fetch(`${SUPABASE_URL}/rest/v1/admin_log`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({
        historia_id,
        accion,
        motivo,
        realizado_por,
        contenido_anterior: historiaActual.contenido,
      }),
    });
    if (!logRes.ok) {
      throw new Error("Historia modificada pero el registro en admin_log falló: " + (await logRes.text()));
    }

    res.status(200).json({ ok: true, mensaje: `Acción "${accion}" aplicada y registrada.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
