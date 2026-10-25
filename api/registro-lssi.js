// api/registro-lssi.js — Locus Mundi
// Versión 2 · 25/10/2026 · Fase C, pendientes de index.html (II).
//  - Con sesión: "publicacion" y "despublicacion" solo con la sesión del Autor (cabecera
//    Authorization: Bearer …); el autor_id sale de la sesión, no del cuerpo (endurecimiento:
//    "registro-lssi.js con sesión"). "alta" no tiene sesión todavía (el correo está sin confirmar):
//    solo se acepta para un Autor creado hace menos de 15 minutos y sin "alta" anotada.
//  - Nueva acción "eliminacion": la web la llama tras eliminar el libro. Si estaba publicado, anota
//    la despublicación; después envía al Autor el correo «Has eliminado tu libro…» (decisión de
//    Javier, 25/10/2026). El libro se comprueba en el servidor (suyo y marcado como borrado).
// Versión 1: anota alta, publicación y despublicación con la IP (LSSI), sin comprobar quién llama.

const SB = process.env.SUPABASE_URL || "https://olpfybpykuascwltnqtv.supabase.co";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sbHeaders(extra) {
  return {
    "Content-Type": "application/json",
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    ...(extra || {}),
  };
}

// Autor de la sesión, o null.
async function autorDeSesion(req) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || "");
  if (!m) return null;
  const r = await fetch(`${SB}/auth/v1/user`, {
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${m[1]}` },
  });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? u : null;
}

async function anotar(autor_id, accion, ip) {
  const r = await fetch(`${SB}/rest/v1/registro_lssi`, {
    method: "POST",
    headers: sbHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify({ autor_id, accion, ip }),
  });
  if (!r.ok) throw new Error(await r.text());
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido" });
    return;
  }

  const { accion, autor_id, historia_id, lang } = req.body || {};
  if (!["alta", "publicacion", "despublicacion", "eliminacion"].includes(accion)) {
    res.status(400).json({ error: "Datos incompletos" });
    return;
  }

  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket.remoteAddress ||
    "";

  try {
    // Alta: sin sesión. Autor recién creado y sin alta anotada.
    if (accion === "alta") {
      if (!UUID.test(String(autor_id || ""))) { res.status(400).json({ error: "Datos incompletos" }); return; }
      const id = String(autor_id).toLowerCase();
      const a = await fetch(`${SB}/rest/v1/autores?id=eq.${id}&select=created_at`, { headers: sbHeaders() });
      const fila = a.ok ? (await a.json())[0] : null;
      if (!fila || Date.now() - new Date(fila.created_at).getTime() > 15 * 60 * 1000) {
        res.status(403).json({ error: "No autorizado" }); return;
      }
      const ya = await fetch(`${SB}/rest/v1/registro_lssi?autor_id=eq.${id}&accion=eq.alta&select=id&limit=1`, { headers: sbHeaders() });
      if (ya.ok && (await ya.json()).length) { res.status(200).json({ ok: true }); return; }
      await anotar(id, "alta", ip);
      res.status(200).json({ ok: true });
      return;
    }

    // Lo demás: con la sesión del Autor.
    const user = await autorDeSesion(req);
    if (!user) { res.status(401).json({ error: "Sin sesión" }); return; }

    if (accion !== "eliminacion") {
      await anotar(user.id, accion, ip);
      res.status(200).json({ ok: true });
      return;
    }

    // Eliminación: el libro debe ser suyo y estar marcado como borrado.
    if (!UUID.test(String(historia_id || ""))) { res.status(400).json({ error: "Datos incompletos" }); return; }
    const h = await fetch(
      `${SB}/rest/v1/historias?id=eq.${String(historia_id).toLowerCase()}&autor_id=eq.${user.id}&marcado_borrado=eq.true&select=titulo,contenido,fecha_publicacion`,
      { headers: sbHeaders() }
    );
    const libro = h.ok ? (await h.json())[0] : null;
    if (!libro) { res.status(404).json({ error: "Libro no encontrado" }); return; }

    // Si llegó a publicarse, eliminar es también despublicar (LSSI). Si falla, sigue con el correo.
    if (libro.fecha_publicacion) {
      try { await anotar(user.id, "despublicacion", ip); } catch (e) { console.error("registro_lssi:", e.message); }
    }

    const a = await fetch(`${SB}/rest/v1/autores?id=eq.${user.id}&select=nombre,email`, { headers: sbHeaders() });
    const autor = (a.ok ? (await a.json())[0] : null) || {};
    const para = autor.email || user.email;
    if (!para) { res.status(200).json({ ok: true, correo: false }); return; }

    const en = String(lang || "").toUpperCase() === "EN";
    const titulo = libro.titulo || (libro.contenido && libro.contenido.title) || (en ? "untitled" : "sin título");
    const nombre = String(autor.nombre || "").trim().split(/\s+/)[0] || "";
    const ahora = new Date();
    const fecha = ahora.toLocaleDateString(en ? "en-GB" : "es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "long", year: "numeric" });
    const hora = ahora.toLocaleTimeString(en ? "en-GB" : "es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });

    const subject = en ? `You have deleted your book “${titulo}”` : `Has eliminado tu libro «${titulo}»`;
    const text = en
      ? `Hello${nombre ? ", " + nombre : ""}. On ${fecha}, at ${hora}, you deleted your book “${titulo}” from Locus Mundi. If you did it, you don't need to do anything. If it wasn't you, reply to this email as soon as possible: we can recover it for 30 days; after that it is permanently deleted.\n\nLocus Mundi`
      : `Hola${nombre ? ", " + nombre : ""}. El ${fecha}, a las ${hora}, has eliminado tu libro «${titulo}» de Locus Mundi. Si lo has hecho tú, no tienes que hacer nada. Si no has sido tú, responde a este correo cuanto antes: durante 30 días podemos recuperarlo; después se borra definitivamente.\n\nLocus Mundi`;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Locus Mundi <avisos@locusmundi.com>",
        to: para,
        reply_to: "contactlocusmundi@gmail.com",
        subject,
        text,
      }),
    });
    if (!r.ok) { console.error("Correo de eliminación:", await r.text()); res.status(200).json({ ok: true, correo: false }); return; }
    res.status(200).json({ ok: true, correo: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
