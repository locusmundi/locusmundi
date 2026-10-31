// api/enviar-formulario.js — Locus Mundi
// Versión 3.2 · 31/10/2026 · Firma corporativa (api/_firma.js) al pie del acuse de la denuncia (HTML con el logo y texto
//   plano sin imagen), el único correo de este archivo que va fuera; los avisos internos, sin firma (Lista, pendiente r).
// Versión 3.1 · 29/10/2026 · Sin la dirección de producción de reserva: sin SUPABASE_URL, error
//   CONFIGURACION_INCOMPLETA en vez de ir a producción (Lista, pendiente h).
// Versión 3 · 25/10/2026 · Fase C, pendientes de index.html (II): denuncias según el DSA, arts. 16 y 17
// (Locus_Mundi_Denuncias_DSA_v1.md, §1–§3, de tú; Consulta para Alex v2, pregunta 10). La denuncia
// se guarda en la tabla cerrada `denuncias` (sin IP), avisa a Locus Mundi y envía el acuse de recibo
// a quien denuncia (art. 16.4). Contacto y patrocinio, sin cambios.
// Versión 2 · 21/10/2026 · Fase C, punto 2 (C5a): remitente del dominio, contacto@locusmundi.com
// (antes onboarding@resend.dev). Continuidad, sesión "21/10/2026 (conversación C5a)".

const { conFirma } = require("./_firma"); // v3.2
const SB = process.env.SUPABASE_URL; // v3.1: sin dirección de reserva
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INTERNO = "contactlocusmundi@gmail.com";

const MOTIVOS = {
  privacidad:     { es: "Revela datos privados o íntimos de una persona (también si eres tú)", en: "Reveals private or intimate details about a person (including you)" },
  honor:          { es: "Daña el honor o la reputación de una persona", en: "Damages a person's honour or reputation" },
  imagen:         { es: "Publica una fotografía de una persona sin su permiso", en: "Publishes a photo of a person without their permission" },
  autor:          { es: "Infringe derechos de autor", en: "Infringes copyright" },
  menor:          { es: "Afecta a un menor", en: "Concerns a minor" },
  abuso_infantil: { es: "Abuso sexual infantil", en: "Child sexual abuse" },
  odio:           { es: "Incita al odio o a la violencia", en: "Incites hatred or violence" },
  otro:           { es: "Otro contenido ilícito o contrario a las Condiciones", en: "Other illegal content or content against the Terms" },
};
const RELACIONES = {
  afectado: "Soy la persona afectada", representante: "Actúa en nombre de la persona afectada", ninguna: "Ninguna",
};

function sbHeaders(extra) {
  return {
    "Content-Type": "application/json",
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    ...(extra || {}),
  };
}

async function enviarCorreo({ from, to, reply_to, subject, text, html }) { // v3.2: html opcional
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, reply_to: reply_to || undefined, subject, text, html }),
  });
  if (!r.ok) throw new Error(await r.text());
}

const recorta = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");

async function denuncia(req, res) {
  const b = req.body || {};
  const motivo = b.motivo;
  const relacion = b.relacion;
  const explicacion = recorta(b.explicacion, 5000);
  const pasaje = recorta(b.pasaje, 2000) || null;
  const nombre = recorta(b.nombre, 200) || null;
  const email = recorta(b.email, 200) || null;
  const en = String(b.lang || "").toUpperCase() === "EN";

  if (!MOTIVOS[motivo] || !RELACIONES[relacion] || !explicacion || b.buena_fe !== true) {
    return res.status(400).json({ error: "Faltan campos obligatorios" });
  }
  if (motivo !== "abuso_infantil" && (!nombre || !email)) {
    return res.status(400).json({ error: "Faltan el nombre o el correo" });
  }
  if (email && !EMAIL.test(email)) {
    return res.status(400).json({ error: "Correo no válido" });
  }

  // Título y Autor: de lo publicado, si el libro está en Supabase; si no (muestras), lo que manda la web.
  const historia_id = UUID.test(String(b.historia_id || "")) ? String(b.historia_id).toLowerCase() : null;
  let titulo = recorta(b.titulo, 300), autor = recorta(b.autor, 200), numero = null;
  if (historia_id) {
    try {
      const r = await fetch(`${SB}/rest/v1/publicaciones?historia_id=eq.${historia_id}&select=titulo,numero_autor,contenido`, { headers: sbHeaders() });
      const p = r.ok ? (await r.json())[0] : null;
      if (p) {
        titulo = p.titulo || (p.contenido && p.contenido.title) || titulo;
        autor = (p.contenido && p.contenido.name) || autor;
        numero = p.numero_autor || null;
      }
    } catch (e) { /* sigue con lo que manda la web */ }
  }
  const referencia = `«${titulo || "(sin título)"}», de ${autor || "(sin Autor)"}` +
    (numero ? ` (Nº ${numero})` : "") + (historia_id ? ` · ${historia_id}` : (b.historia_id ? ` · ${String(b.historia_id).slice(0, 60)}` : ""));

  // 1. Registro (sin IP). Si falla, la web muestra el error con el correo de contacto.
  const ins = await fetch(`${SB}/rest/v1/denuncias`, {
    method: "POST",
    headers: sbHeaders({ Prefer: "return=representation" }),
    body: JSON.stringify({ historia_id, referencia, motivo, pasaje, explicacion, relacion, nombre, email, buena_fe: true }),
  });
  if (!ins.ok) {
    return res.status(500).json({ error: "No se pudo registrar la denuncia", detalle: await ins.text() });
  }
  const fila = (await ins.json())[0];
  const corto = String(fila.id).slice(0, 8).toUpperCase();
  const cuando = new Date(fila.recibida_en).toLocaleString(en ? "en-GB" : "es-ES", {
    timeZone: "Europe/Madrid", dateStyle: "long", timeStyle: "short",
  });

  // 2. Aviso interno (si falla, la denuncia ya está registrada).
  try {
    await enviarCorreo({
      from: "Locus Mundi <avisos@locusmundi.com>",
      to: INTERNO,
      reply_to: email,
      subject: `[Denuncia ${corto}] ${MOTIVOS[motivo].es} · ${titulo || "sin título"}`,
      text:
        `Referencia: ${corto} (${fila.id})\nRecibida: ${cuando}\nObra: ${referencia}\n` +
        `Motivo: ${MOTIVOS[motivo].es}\nRelación: ${RELACIONES[relacion]}\n` +
        `Denunciante: ${nombre || "(anónimo)"} <${email || "sin correo"}>\n\n` +
        `Dónde está:\n${pasaje || "(no lo indica)"}\n\nPor qué:\n${explicacion}\n\n` +
        `La decisión la toma siempre una persona: admin.html, acción «Resolver denuncia».`,
    });
  } catch (e) { console.error("Aviso interno de denuncia:", e.message); }

  // 3. Acuse de recibo (art. 16.4), si ha dado correo.
  let acuse = false;
  if (email) {
    const mot = MOTIVOS[motivo][en ? "en" : "es"];
    const obra = en ? `“${titulo}”, by ${autor}` : `«${titulo}», de ${autor}`;
    try {
      await enviarCorreo({
        from: "Locus Mundi <avisos@locusmundi.com>",
        to: email,
        reply_to: INTERNO,
        subject: en ? "We have received your report" : "Hemos recibido tu denuncia",
        ...conFirma(en
          ? `We have received your report about ${obra}, on ${cuando}, for the reason “${mot}”. A person will examine it, without automated means, and we will let you know the decision and the reason for it. Reference: ${corto}.\n\nLocus Mundi · Alastuey & Morera Asociados, S.L.`
          : `Hemos recibido tu denuncia sobre ${obra}, el ${cuando}, con el motivo «${mot}». La estudiará una persona, sin medios automatizados, y te comunicaremos la decisión y su motivo. Referencia: ${corto}.\n\nLocus Mundi · Alastuey & Morera Asociados, S.L.`), // v3.2: html y text con la firma
      });
      acuse = true;
      await fetch(`${SB}/rest/v1/denuncias?id=eq.${fila.id}`, {
        method: "PATCH",
        headers: sbHeaders({ Prefer: "return=minimal" }),
        body: JSON.stringify({ acuse_enviado_en: new Date().toISOString() }),
      });
    } catch (e) { console.error("Acuse de denuncia:", e.message); }
  }

  return res.status(200).json({ ok: true, referencia: corto, acuse });
}

module.exports = async function handler(req, res) {
  if (!process.env.SUPABASE_URL) return res.status(500).json({ error: "CONFIGURACION_INCOMPLETA" }); // v3.1: sin dirección de reserva
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { tipo, name, email, subject, msg, company } = req.body || {};

  if (tipo !== "contacto" && tipo !== "denuncia" && tipo !== "patrocinio") {
    return res.status(400).json({ error: "Tipo de formulario no válido" });
  }

  if (tipo === "denuncia") {
    try { return await denuncia(req, res); }
    catch (err) { return res.status(500).json({ error: "Error inesperado", detalle: String(err) }); }
  }

  let asunto, cuerpo;
  if (tipo === "contacto") {
    if (!name || !email || !msg) {
      return res.status(400).json({ error: "Faltan campos obligatorios" });
    }
    asunto = `[Contacto] ${subject && subject.trim() ? subject.trim() : "Sin asunto"}`;
    cuerpo = `Nombre: ${name}\nCorreo: ${email}\n\n${msg}`;
  } else {
    if (!company || !name || !email || !msg) {
      return res.status(400).json({ error: "Faltan campos obligatorios" });
    }
    asunto = `[Patrocinio] ${company}`;
    cuerpo = `Empresa: ${company}\nNombre: ${name}\nCorreo: ${email}\n\n${msg}`;
  }

  try {
    await enviarCorreo({
      from: "Locus Mundi <contacto@locusmundi.com>",
      to: INTERNO,
      reply_to: email,
      subject: asunto,
      text: cuerpo,
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Fallo enviando el correo", detalle: String(err) });
  }
};
