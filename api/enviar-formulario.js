module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { tipo, name, email, subject, msg, ref, desc } = req.body || {};

  if (tipo !== 'contacto' && tipo !== 'denuncia') {
    return res.status(400).json({ error: 'Tipo de formulario no válido' });
  }

  let asunto, cuerpo;

  if (tipo === 'contacto') {
    if (!name || !email || !msg) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }
    asunto = `[Contacto] ${subject && subject.trim() ? subject.trim() : 'Sin asunto'}`;
    cuerpo = `Nombre: ${name}\nCorreo: ${email}\n\n${msg}`;
  } else {
    if (!desc) {
      return res.status(400).json({ error: 'Falta la descripción de la denuncia' });
    }
    asunto = `[Denuncia] ${ref || 'Sin referencia'}`;
    cuerpo = `Obra denunciada: ${ref || '(no especificada)'}\n\n${desc}`;
  }

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Locus Mundi <onboarding@resend.dev>',
        to: 'contactlocusmundi@gmail.com',
        reply_to: tipo === 'contacto' && email ? email : undefined,
        subject: asunto,
        text: cuerpo,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      return res.status(500).json({ error: 'Fallo enviando el correo', detalle: errText });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Error inesperado', detalle: String(err) });
  }
};
