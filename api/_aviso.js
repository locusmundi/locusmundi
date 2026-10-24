// api/_aviso.js — Locus Mundi
// Versión 3 · 24/10/2026 · Fase C, conversación C2-2 (Plan Familiar): añade enviarCorreo(), para los
// correos del regalo a personas de fuera (destinatario y quien regala). Remitente regalos@locusmundi.com;
// las respuestas van a contactlocusmundi@gmail.com. avisar() no cambia.
// Versión 2 · 21/10/2026 · Fase C, punto 2 (C5a): remitente del dominio, avisos@locusmundi.com
// (antes onboarding@resend.dev). Continuidad, sesión "21/10/2026 (conversación C5a)".
// Versión 1 · 17/10/2026 · Fase B2, punto 19 (b). Continuidad, sesión "17/10/2026 (conversación 5)".
// Envía un correo interno a contactlocusmundi@gmail.com con Resend (mismo envío que
// api/enviar-formulario.js). Dominio locusmundi.com verificado en Resend (18/10/2026).

async function resend(cuerpo) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  if (!r.ok) throw new Error(`Resend: ${r.status} ${await r.text()}`);
}

async function avisar(asunto, texto) {
  return resend({ from: 'Locus Mundi <avisos@locusmundi.com>', to: 'contactlocusmundi@gmail.com', subject: asunto, text: texto });
}

// v3: correo a una persona (HTML y texto). `para`: una dirección.
async function enviarCorreo({ para, asunto, html, texto }) {
  return resend({ from: 'Locus Mundi <regalos@locusmundi.com>', to: para, reply_to: 'contactlocusmundi@gmail.com', subject: asunto, html, text: texto });
}

module.exports = { avisar, enviarCorreo };
