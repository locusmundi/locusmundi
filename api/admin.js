// api/admin.js — Locus Mundi
// Versión 3 · 08/10/2026 · Diseño de la moderación v10, §11.13, punto 12. Cambio respecto a la
// v2: "modificar" sube en uno historias.revision (columna solo del servidor). Así el editor
// que el Autor tenga abierto se da cuenta, deja de autoguardar el texto antiguo y recarga el
// nuevo (index.html de la segunda subida). Nada más cambia.
// Versión 2 · 06/10/2026 · Diseño de la moderación v6, §4.3 y §11.8 (dos versiones de cada
// libro; decisión de Javier en la conversación de la primera subida).
// Acción de administrador sobre una historia: "retirar" (despublicar) o "modificar"
// (sustituir el texto completo). Protegido con ADMIN_CLAVE, propia y distinta de
// SUPABASE_SERVICE_ROLE_KEY y de CONTADOR_CLAVE. Cada uso queda registrado en
// admin_log con motivo obligatorio y el contenido anterior, por si hay que revisarlo.
// Solo se llama desde admin.html vía POST, nunca desde el navegador directamente.
//
// Cambios de la v2:
//  - "retirar": igual (pone "despublicado"); el disparador historias_retirar_publicacion
//    borra entonces la fila de publicaciones y el libro sale de la Biblioteca al instante.
//  - "modificar": cambia el texto EN LAS DOS VERSIONES, la que se escribe (historias) y la
//    que se lee (publicaciones), para que el Autor no pueda volver a subir el pasaje
//    retirado; después borra las traducciones de tramos que ya no existen (api/_tramos.js).
//    Antes solo cambiaba historias, que con dos versiones es solo el borrador.
//  - admin_log.contenido_anterior guarda las dos versiones anteriores: { escrito, publicado }.
//  - historia_id debe ser un identificador válido; SUPABASE_URL de las variables de entorno.

const { huellasVigentes } = require("./_tramos"); // compartido con traducir.js y moderar.js

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido" });
    return;
  }

  const { clave, historia_id, accion, motivo, nuevo_texto, realizado_por } = req.body || {};

  if (!process.env.ADMIN_CLAVE || clave !== process.env.ADMIN_CLAVE) {
    res.status(403).json({ error: "Clave incorrecta" });
    return;
  }
  if (!historia_id || !accion || !motivo || !realizado_por) {
    res.status(400).json({ error: "Faltan datos (historia_id, accion, motivo, realizado_por)" });
    return;
  }
  if (!UUID.test(String(historia_id).trim())) {
    res.status(400).json({ error: "El id de la historia no es válido" });
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

  const id = String(historia_id).trim().toLowerCase();
  const SUPABASE_URL = process.env.SUPABASE_URL || "https://olpfybpykuascwltnqtv.supabase.co";
  const headers = {
    "Content-Type": "application/json",
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  };

  try {
    // Las dos versiones actuales.
    const getRes = await fetch(
      `${SUPABASE_URL}/rest/v1/historias?id=eq.${id}&select=id,contenido,estado_publicacion,revision`,
      { headers }
    );
    if (!getRes.ok) throw new Error("Error al leer la historia: " + (await getRes.text()));
    const rows = await getRes.json();
    if (!rows || !rows.length) {
      res.status(404).json({ error: "Historia no encontrada" });
      return;
    }
    const historiaActual = rows[0];

    const pubRes = await fetch(
      `${SUPABASE_URL}/rest/v1/publicaciones?historia_id=eq.${id}&select=titulo,contenido`,
      { headers }
    );
    if (!pubRes.ok) throw new Error("Error al leer lo publicado: " + (await pubRes.text()));
    const publicada = (await pubRes.json())[0] || null;

    let avisoTraducciones = "";
    if (accion === "retirar") {
      const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/historias?id=eq.${id}`, {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify({ estado_publicacion: "despublicado" }),
      });
      if (!patchRes.ok) throw new Error("Error al retirar la historia: " + (await patchRes.text()));
    } else {
      // 1. Lo que se escribe.
      const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/historias?id=eq.${id}`, {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify({
          contenido: { ...(historiaActual.contenido || {}), text: nuevo_texto },
          revision: (Number(historiaActual.revision) || 0) + 1, // v3
        }),
      });
      if (!patchRes.ok) throw new Error("Error al modificar la historia: " + (await patchRes.text()));

      // 2. Lo que se lee, si está publicado.
      if (publicada) {
        const nuevaPublicada = { ...publicada, contenido: { ...(publicada.contenido || {}), text: nuevo_texto } };
        const pRes = await fetch(`${SUPABASE_URL}/rest/v1/publicaciones?historia_id=eq.${id}`, {
          method: "PATCH",
          headers: { ...headers, Prefer: "return=minimal" },
          body: JSON.stringify({ contenido: nuevaPublicada.contenido, fecha_actualizacion: new Date().toISOString() }),
        });
        if (!pRes.ok) {
          throw new Error("El borrador se modificó, pero lo publicado NO: " + (await pRes.text()) +
            ". Repite la acción o usa \"retirar\".");
        }

        // 3. Traducciones del texto que ya no se lee.
        try {
          const vigentes = huellasVigentes(nuevaPublicada);
          const dRes = await fetch(
            `${SUPABASE_URL}/rest/v1/traducciones_cache?historia_id=eq.${id}&huella=not.in.(${vigentes.join(",")})`,
            { method: "DELETE", headers: { ...headers, Prefer: "return=minimal" } }
          );
          if (!dRes.ok) throw new Error(await dRes.text());
        } catch (e) {
          avisoTraducciones = " OJO: no se pudieron borrar las traducciones antiguas (" + e.message +
            "); repite la acción.";
        }
      }
    }

    const logRes = await fetch(`${SUPABASE_URL}/rest/v1/admin_log`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({
        historia_id: id,
        accion,
        motivo,
        realizado_por,
        contenido_anterior: {
          escrito: historiaActual.contenido,
          publicado: publicada ? publicada.contenido : null,
        },
      }),
    });
    if (!logRes.ok) {
      throw new Error("Acción aplicada, pero el registro en admin_log falló: " + (await logRes.text()));
    }

    const alcance = accion === "modificar"
      ? (publicada ? " (texto cambiado en lo escrito y en lo publicado)" : " (el libro no está publicado: cambiado solo lo escrito)")
      : "";
    res.status(200).json({ ok: true, mensaje: `Acción "${accion}" aplicada y registrada${alcance}.${avisoTraducciones}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
