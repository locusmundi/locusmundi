// api/_regalo.js — Locus Mundi
// Versión 1.5 · 28/10/2026 · El botón del correo de invitación dice «Ver mi regalo» / «See your gift»
//   (antes «Aceptar el regalo» / «Accept the gift»): aceptarlo se hace en la web (Lista 7.4).
// Versión 1.4 · 25/10/2026 · Pendientes de index.html, III: el regalo no aceptado se devuelve SIEMPRE íntegro
//   (descontar la comisión podría ser un recargo prohibido, TRLGDCU art. 60 ter). Decisión de Javier, opción B.
//   Correos ajustados. Sin cambios en la lógica de aceptar, recordatorios ni plazos.
// Versión 1.3 · 24/10/2026 · C3-III (textos legales): confirmación a quien regala con la aceptación de las condiciones,
//   «al aceptarlo ya no se puede desistir», recibo y factura de Link y enlace a las Condiciones de Compra. EN: «Publication
//   Terms». Exporta plantilla y esc (para el correo de confirmación de compra de api/pago.js).
// Versión 1.2 · 24/10/2026 · C2-3: si el regalo se rechaza en los 14 días siguientes al pago, devolución íntegra
//   (en ese plazo quien regala aún podría desistir: TRLGDCU, art. 107.1). Correos ajustados. Decisión de Javier.
// Versión 1.1 · 24/10/2026 · C2-3, prueba real: al devolver, Stripe solo reintegra el IVA retenido en proporción
//   (devolver 14,28 € dejaba −0,13 € netos). La devolución se calcula para quedar en cero: (total − comisión − IVA)
//   × total / (total − IVA), redondeado hacia abajo. Con 15 €: 14,12 € (se retienen 0,88 €). Decisión de Javier, opción (b).
// Versión 1 · 24/10/2026 · Fase C, conversación C2-2: el Plan Familiar de regalo.
// Contenido: Continuidad, sesiones "21/10/2026 (conversación C1)", punto 4; "21/10/2026 (conversación C5a)",
// punto 1 (correo aprobado); "24/10/2026 (conversación C2-2)" (resto de correos, provisionales hasta la C3-III).
// Con guion bajo: no cuenta como función de Vercel. Lo usan api/pago.js (venta, aceptar, rechazar) y
// api/diario.js (recordatorios y plazo vencido). Recibe rest y stripe de api/pago.js (mismas llamadas).
//
// El código del regalo NO se guarda: se calcula con REGALO_SECRETO (variable de entorno) a partir del
// id del regalo; en Supabase solo queda su huella (codigo_hash). Así los recordatorios pueden llevarlo.

const crypto = require('crypto');
const { avisar, enviarCorreo } = require('./_aviso');

// --- Ajustes ---------------------------------------------------------------------------------------
const PRECIO_REGALO = 1500;          // céntimos, IVA incluido
const PLAZO_MESES = 3;
const TINTA_REGALO = 2;              // euros de tinta (carga de 5 €)
const FOTOS_REGALO = 10;
const MAX_FOTOS_LIBRO = 20;          // = index.html y api/pago.js (las del regalo cuentan dentro)
const DESCARGAS_PDF = 15;            // = api/pdf.js
const DIAS_RECORDATORIO_1 = 30;      // desde el pago
const DIAS_RECORDATORIO_2 = 15;      // antes del plazo (también a quien regala)
const WEB = 'https://www.locusmundi.com';
const ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // sin 0/O, 1/I/L

// --- Código ----------------------------------------------------------------------------------------
function codigoDe(id) {
  if (!process.env.REGALO_SECRETO) throw new Error('Falta REGALO_SECRETO');
  const h = crypto.createHmac('sha256', process.env.REGALO_SECRETO).update(String(id)).digest();
  let s = '';
  for (let i = 0; i < 12; i++) s += ALFABETO[h[i] % ALFABETO.length];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}
const normalizar = (c) => String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
const huella = (c) => crypto.createHash('sha256').update(normalizar(c)).digest('hex');

// --- Fechas ----------------------------------------------------------------------------------------
function sumarMeses(fecha, n) {
  const d = new Date(fecha);
  const dia = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + n);
  if (d.getUTCDate() < dia) d.setUTCDate(0); // 30 de noviembre + 3 meses → 28/29 de febrero
  return d;
}
const fechaLarga = (f, idioma) => new Date(f).toLocaleDateString(idioma === 'EN' ? 'en-GB' : 'es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' });
const euros = (cent, idioma) => {
  const n = (cent / 100).toFixed(2);
  return idioma === 'EN' ? `€${n}` : `${n.replace('.', ',')} €`;
};

// --- Correos ---------------------------------------------------------------------------------------
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Misma imagen que las plantillas de Supabase (C5a bis): fondo #EDE0C4, tarjeta #FBF7EE, botón #C4932A, Georgia.
function plantilla(idioma, bloques, pie) {
  const lema = idioma === 'EN' ? 'Remember · Tell · Publish · Share' : 'Recuerda · Cuenta · Publica · Comparte';
  return `<!doctype html><html><body style="margin:0;padding:0;background:#EDE0C4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EDE0C4;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FBF7EE;border:1px solid #d9c9a3;">
<tr><td style="padding:22px 28px 6px;font-family:Georgia,'Times New Roman',serif;font-size:24px;letter-spacing:0.14em;color:#1A0E07;text-align:center;">Locus Mundi</td></tr>
<tr><td style="padding:10px 28px 24px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.55;color:#1A0E07;">${bloques.join('\n')}</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;"><tr><td style="padding:14px 28px;font-family:Georgia,'Times New Roman',serif;font-size:12px;line-height:1.5;color:#6b5a45;text-align:center;">Locus Mundi · ${lema}<br>${pie}</td></tr></table>
</td></tr></table></body></html>`;
}
const p = (html) => `<p style="margin:0 0 14px;">${html}</p>`;
const h = (txt) => `<p style="margin:18px 0 6px;font-weight:bold;color:#1B3A6B;">${txt}</p>`;
const boton = (txt, url) => `<p style="margin:20px 0;text-align:center;"><a href="${url}" style="display:inline-block;background:#C4932A;color:#FBF7EE;text-decoration:none;padding:12px 26px;font-family:Georgia,serif;font-size:16px;">${txt}</a></p>`;
const cita = (txt) => `<p style="margin:0 0 14px;padding:10px 14px;border-left:3px solid #C4932A;background:#F3EAD6;font-style:italic;">${txt}</p>`;
const texto = (bloques) => bloques.join('\n\n');

// Invitación al destinatario: tipo 'inicial' (texto aprobado en la C5a), 'rec1' (al mes), 'rec2' (15 días antes).
function correoInvitacion(r, tipo) {
  const EN = r.idioma === 'EN';
  const R = esc(r.regala_nombre), D = esc(r.destinatario_nombre), M = r.mensaje ? esc(r.mensaje).replace(/\n/g, '<br>') : '';
  const cod = codigoDe(r.id);
  const aceptar = `${WEB}/regalo?c=${encodeURIComponent(cod)}`;
  const noInteresa = `${aceptar}&no=1`;
  const plazo = fechaLarga(r.plazo, r.idioma);
  const privacidad = `${WEB}/?legal=privacidad`;
  let asunto; let b; let t;
  if (!EN) {
    asunto = tipo === 'rec2' ? `Quedan 15 días para aceptar el regalo de ${r.regala_nombre}`
      : `${tipo === 'rec1' ? 'Recuerda: ' : ''}${r.regala_nombre} te invita a escribir tu historia en Locus Mundi`;
    b = [p(`Hola, ${D}:`), p(`${R} te ha regalado el <b>Plan Familiar de Locus Mundi</b> para que escribas la historia de tu vida.`)];
    if (M) b.push(p(`${R} te escribe:`), cita(`«${M}»`));
    b.push(h('Qué es Locus Mundi'), p('Una biblioteca de autobiografías escritas por toda clase de personas, para que amigos, familiares y quienes vengan después puedan conocerte a través de tus recuerdos y con tus propias palabras.'),
      h('Qué incluye tu regalo'), p('Crédito para el Asistente editorial de IA.<br>10 fotos para ilustrar tu libro.<br>El PDF de tu libro publicado, para imprimirlo o guardarlo.'),
      h('Qué supone aceptarlo'), p('Tener una cuenta gratuita, ser mayor de edad y aceptar las Condiciones de Publicación. Tu libro solo se publica si tú quieres y cuando quieras. No hay compromisos ni cuotas.'),
      boton('Ver mi regalo', aceptar),
      p(`Si el botón no funciona, entra en <b>locusmundi.com/regalo</b> e introduce este código: <b>${cod}</b>`),
      p(`¿No te interesa? <a href="${noInteresa}" style="color:#1B3A6B;">No me interesa</a>. Devolveremos el importe a ${R} y borraremos tus datos.`),
      p(`Tienes hasta el <b>${plazo}</b> (3 meses) para aceptarlo. Pasado ese plazo, haremos lo mismo.`));
    const pie = `Recibes este correo porque ${R} te ha regalado el Plan Familiar con esta dirección. Usamos tus datos solo para hacerte llegar el regalo. Consulta la <a href="${privacidad}" style="color:#6b5a45;">Política de privacidad</a>.`;
    t = texto([`Hola, ${r.destinatario_nombre}:`, `${r.regala_nombre} te ha regalado el Plan Familiar de Locus Mundi para que escribas la historia de tu vida.`,
      r.mensaje ? `${r.regala_nombre} te escribe: «${r.mensaje}»` : null,
      'Qué incluye tu regalo: crédito para el Asistente editorial de IA, 10 fotos para ilustrar tu libro y el PDF de tu libro publicado.',
      `Ver mi regalo: ${aceptar}`, `O entra en locusmundi.com/regalo e introduce este código: ${cod}`,
      `¿No te interesa? ${noInteresa} — Devolveremos el importe a ${r.regala_nombre} y borraremos tus datos.`,
      `Tienes hasta el ${plazo} (3 meses) para aceptarlo. Pasado ese plazo, haremos lo mismo.`,
      `Política de privacidad: ${privacidad}`].filter(Boolean));
    return { asunto, html: plantilla('ES', b, pie), texto: t };
  }
  asunto = tipo === 'rec2' ? `15 days left to accept ${r.regala_nombre}'s gift`
    : `${tipo === 'rec1' ? 'Reminder: ' : ''}${r.regala_nombre} invites you to write your story on Locus Mundi`;
  b = [p(`Hello ${D},`), p(`${R} has given you the <b>Locus Mundi Family Plan</b> so you can write the story of your life.`)];
  if (M) b.push(p(`${R} writes:`), cita(`“${M}”`));
  b.push(h('What Locus Mundi is'), p('A library of autobiographies written by all kinds of people, so that friends, family and those who come after can know you through your memories, in your own words.'),
    h('What your gift includes'), p('Credit for the AI editorial Assistant.<br>10 photos to illustrate your book.<br>The PDF of your published book, to print or keep.'),
    h('What accepting it means'), p('Having a free account, being of legal age and accepting the Publication Terms. Your book is published only if and when you choose. No commitments, no fees.'),
    boton('See your gift', aceptar),
    p(`If the button doesn't work, go to <b>locusmundi.com/regalo</b> and enter this code: <b>${cod}</b>`),
    p(`Not interested? <a href="${noInteresa}" style="color:#1B3A6B;">No, thanks</a>. We'll refund ${R} and delete your details.`),
    p(`You have until <b>${plazo}</b> (3 months) to accept it. After that date, we'll do the same.`));
  const pie = `You're receiving this email because ${R} gave you the Family Plan at this address. We use your details only to deliver the gift. See our <a href="${privacidad}" style="color:#6b5a45;">Privacy Policy</a>.`;
  t = texto([`Hello ${r.destinatario_nombre},`, `${r.regala_nombre} has given you the Locus Mundi Family Plan so you can write the story of your life.`,
    r.mensaje ? `${r.regala_nombre} writes: “${r.mensaje}”` : null,
    'Your gift includes credit for the AI editorial Assistant, 10 photos to illustrate your book and the PDF of your published book.',
    `See your gift: ${aceptar}`, `Or go to locusmundi.com/regalo and enter this code: ${cod}`,
    `Not interested? ${noInteresa} — We'll refund ${r.regala_nombre} and delete your details.`,
    `You have until ${plazo} (3 months) to accept it. After that date, we'll do the same.`,
    `Privacy Policy: ${privacidad}`].filter(Boolean));
  return { asunto, html: plantilla('EN', b, pie), texto: t };
}

// Correos a quien regala: 'confirmacion' (al pagar), 'quince' (15 días antes), 'aceptado', 'no_aceptado'.
function correoRegala(r, tipo, extra) {
  const EN = r.idioma === 'EN';
  const R = esc(r.regala_nombre), D = esc(r.destinatario_nombre);
  const plazo = r.plazo ? fechaLarga(r.plazo, r.idioma) : '';
  const pie = EN ? 'You\'re receiving this email because you bought a gift on www.locusmundi.com.' : 'Recibes este correo porque has comprado un regalo en www.locusmundi.com.';
  let asunto; let lineas;
  if (!EN) {
    if (tipo === 'confirmacion') {
      asunto = `Tu regalo para ${r.destinatario_nombre} ya está en camino`;
      lineas = [`Hola, ${R}:`,
        `Gracias por regalar el Plan Familiar de Locus Mundi a ${D}. Le hemos enviado un correo a <b>${esc(r.destinatario_email)}</b> con tu mensaje y el enlace para aceptarlo.`,
        `Tiene hasta el <b>${plazo}</b> para aceptarlo. Si no lo acepta en ese plazo, o nos dice que no le interesa, te devolveremos los 15 € íntegros y borraremos sus datos.`,
        'Mientras no lo acepte, puedes desistir de la compra en los 14 días siguientes y te devolveremos los 15 € íntegros: basta con responder a este correo.',
        `Cuando ${D} lo acepte, empezará el servicio y ya no podrás desistir ni pedir la devolución. Así lo aceptaste al comprar, junto con las condiciones del regalo y las <a href="${WEB}/?legal=compra" style="color:#1B3A6B;">Condiciones de Compra</a>.`, // v1.3
        'El recibo y la factura te los envía directamente Link, el servicio de pagos de Stripe. En tu extracto aparecerá como LINK.COM* LOCUS MUNDI.',
        `Si la dirección de ${D} no es correcta, respóndenos a este correo.`];
    } else if (tipo === 'quince') {
      asunto = `${r.destinatario_nombre} aún no ha aceptado tu regalo`;
      lineas = [`Hola, ${R}:`, `${D} aún no ha aceptado el Plan Familiar que le regalaste; tiene hasta el <b>${plazo}</b>. Quizá quieras recordárselo.`,
        'Si no lo acepta, te devolveremos los 15 € íntegros.'];
    } else if (tipo === 'aceptado') {
      asunto = `${r.destinatario_nombre} ha aceptado tu regalo`;
      lineas = [`Hola, ${R}:`, `${D} ha aceptado el Plan Familiar que le regalaste. Ya puede empezar a escribir su historia en Locus Mundi.`, 'Gracias por regalarlo.'];
    } else {
      asunto = `${r.destinatario_nombre} no ha aceptado tu regalo`;
      lineas = [`Hola, ${R}:`, `${D} no ha aceptado el Plan Familiar que le regalaste. Te hemos devuelto <b>${euros(extra.importe, 'ES')}</b>; lo verás en tu tarjeta en 5 a 10 días.`,
        'Hemos borrado sus datos.'];
    }
  } else if (tipo === 'confirmacion') {
    asunto = `Your gift for ${r.destinatario_nombre} is on its way`;
    lineas = [`Hello ${R},`,
      `Thank you for giving ${D} the Locus Mundi Family Plan. We've sent an email to <b>${esc(r.destinatario_email)}</b> with your message and the link to accept it.`,
      `They have until <b>${plazo}</b> to accept it. If they don't accept it by then, or tell us they're not interested, we'll refund you the full €15 and delete their details.`,
      'As long as they haven\'t accepted it, you can withdraw from the purchase within 14 days and we\'ll refund the full €15: just reply to this email.',
      `Once ${D} accepts it, the service begins and you can no longer withdraw or ask for a refund. You accepted this when you bought it, together with the gift terms and the <a href="${WEB}/?legal=compra" style="color:#1B3A6B;">Purchase Terms</a>.`, // v1.3
      'Your receipt and invoice are sent directly by Link, Stripe\'s payment service. It will appear on your statement as LINK.COM* LOCUS MUNDI.',
      `If ${D}'s email address isn't correct, reply to this email.`];
  } else if (tipo === 'quince') {
    asunto = `${r.destinatario_nombre} hasn't accepted your gift yet`;
    lineas = [`Hello ${R},`, `${D} hasn't accepted the Family Plan you gave them yet; they have until <b>${plazo}</b>. You may want to remind them.`,
      'If they don\'t accept it, we\'ll refund you the full €15.'];
  } else if (tipo === 'aceptado') {
    asunto = `${r.destinatario_nombre} has accepted your gift`;
    lineas = [`Hello ${R},`, `${D} has accepted the Family Plan you gave them. They can now start writing their story on Locus Mundi.`, 'Thank you for giving it.'];
  } else {
    asunto = `${r.destinatario_nombre} hasn't accepted your gift`;
    lineas = [`Hello ${R},`, `${D} hasn't accepted the Family Plan you gave them. We've refunded you <b>${euros(extra.importe, 'EN')}</b>; you'll see it on your card within 5 to 10 days.`,
      'We have deleted their details.'];
  }
  const html = plantilla(r.idioma, lineas.map(p), pie);
  const txt = lineas.map((l) => l.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')).join('\n\n');
  return { asunto, html, texto: txt };
}

// ====================================================================================================
module.exports = function regalos({ rest, stripe }) {
  const devolver = { Prefer: 'return=representation' };
  const minimo = { Prefer: 'return=minimal' };
  const SEL = '*,ventas(id,estado,comprador_email,total_cent,comision_cent,iva_cent,stripe_pago,pagada_en)';

  async function enviar(para, c) { await enviarCorreo({ para, asunto: c.asunto, html: c.html, texto: c.texto }); }

  async function buscar(codigo) {
    if (normalizar(codigo).length !== 12) return null;
    const [r] = await rest(`regalos?codigo_hash=eq.${huella(codigo)}&select=${SEL}`);
    return r || null;
  }
  // Estado visible del regalo: 'pendiente' (se puede aceptar), 'aceptado', 'anulado' (rechazado o devuelto), 'caducado'.
  function estadoDe(r) {
    if (!r || !r.ventas || !['pagada', 'devuelta', 'en_disputa'].includes(r.ventas.estado)) return null;
    if (r.estado === 'aceptado') return 'aceptado';
    if (r.estado !== 'pendiente' || r.ventas.estado !== 'pagada') return 'anulado';
    if (new Date(r.plazo) <= new Date()) return 'caducado';
    return 'pendiente';
  }

  // --- Al confirmarse el pago (aviso de Stripe) ------------------------------------------------------
  async function alPagar(venta) {
    const [r0] = await rest(`regalos?venta_id=eq.${venta.id}&select=*`);
    if (!r0) throw new Error(`Venta ${venta.id}: regalo inexistente`);
    const plazo = sumarMeses(venta.pagada_en || new Date(), PLAZO_MESES).toISOString();
    await rest(`regalos?id=eq.${r0.id}`, { method: 'PATCH', headers: minimo, body: JSON.stringify({ plazo }) });
    const r = Object.assign({}, r0, { plazo });
    await enviar(r.destinatario_email, correoInvitacion(r, 'inicial')); // si falla, Stripe repite el aviso
    if (venta.comprador_email) {
      await enviar(venta.comprador_email, correoRegala(r, 'confirmacion')).catch((e) => avisar('Locus Mundi: confirmación de regalo no enviada', `Regalo ${r.id}: ${e.message}`).catch(() => {}));
    }
  }

  // --- Devolución (rechazo o plazo vencido): siempre íntegra (v1.4) ------------------------------------
  async function devolverRegalo(r, motivo) { // motivo: 'rechazado' | 'devuelto'
    const v = r.ventas;
    const tomado = await rest(`regalos?id=eq.${r.id}&estado=eq.pendiente`, { method: 'PATCH', headers: devolver, body: JSON.stringify({ estado: motivo }) });
    if (!tomado.length) return 'ya resuelto';
    const importe = v.total_cent; // v1.4: íntegro siempre (la comisión de Stripe la asume Locus Mundi)
    const comision = 0;
    try {
      if (importe > 0) await stripe('POST', 'refunds', { payment_intent: v.stripe_pago, amount: importe, metadata: { venta_id: v.id, motivo: `regalo_${motivo}` } });
    } catch (e) {
      await rest(`regalos?id=eq.${r.id}`, { method: 'PATCH', headers: minimo, body: JSON.stringify({ estado: 'pendiente' }) }).catch(() => {});
      throw e;
    }
    await rest(`ventas?id=eq.${v.id}`, { method: 'PATCH', headers: minimo, body: JSON.stringify({ estado: 'devuelta', devuelta_en: new Date().toISOString(), devolucion_cent: importe }) }).catch(() => {});
    if (v.comprador_email) await enviar(v.comprador_email, correoRegala(r, 'no_aceptado', { importe, comision })).catch(() => {});
    await rest(`regalos?id=eq.${r.id}`, { method: 'PATCH', headers: minimo, body: JSON.stringify({ destinatario_nombre: null, destinatario_email: null, mensaje: null }) });
    return motivo;
  }

  // --- Aceptar (con sesión) ------------------------------------------------------------------------
  async function aceptar(codigo, usuario) {
    const r = await buscar(codigo);
    const e = estadoDe(r);
    if (!e) return { error: 'NO_VALIDO' };
    if (e !== 'pendiente') return { error: e.toUpperCase() };
    const ahora = new Date().toISOString();
    const tomado = await rest(`regalos?id=eq.${r.id}&estado=eq.pendiente`, { method: 'PATCH', headers: devolver, body: JSON.stringify({ estado: 'aceptado', aceptado_en: ahora, aceptado_por: usuario.id }) });
    if (!tomado.length) return { error: 'ACEPTADO' };
    try {
      let hecho = false;
      for (let i = 0; i < 5 && !hecho; i++) { // una sola escritura condicionada: tinta, fotos y PDF a la vez
        const [a] = await rest(`autores?id=eq.${usuario.id}&select=tinta_euros,fotos_incluidas_restantes`);
        if (!a) throw new Error('Autor inexistente');
        const tinta = Number(a.tinta_euros) || 0;
        const nueva = Math.round((tinta + TINTA_REGALO) * 1e6) / 1e6;
        const fr = a.fotos_incluidas_restantes;
        const filtroFotos = fr == null ? 'fotos_incluidas_restantes=is.null' : `fotos_incluidas_restantes=eq.${fr}`;
        const filtroTinta = a.tinta_euros == null ? 'tinta_euros=is.null' : `tinta_euros=eq.${a.tinta_euros}`;
        const w = await rest(`autores?id=eq.${usuario.id}&${filtroTinta}&${filtroFotos}`, {
          method: 'PATCH', headers: devolver,
          body: JSON.stringify({ tinta_euros: nueva, tinta_ultima_carga: nueva, fotos_incluidas_restantes: (Number(fr) || 0) + FOTOS_REGALO, pdf_incluido: true, plan_familiar_regalado_por: r.regala_nombre, plan_familiar_mensaje: r.mensaje || null }),
        });
        hecho = w.length > 0;
      }
      if (!hecho) throw new Error('El Autor cambió cinco veces seguidas');
    } catch (err) {
      await rest(`regalos?id=eq.${r.id}`, { method: 'PATCH', headers: minimo, body: JSON.stringify({ estado: 'pendiente', aceptado_en: null, aceptado_por: null }) }).catch(() => {});
      throw err;
    }
    await pendientes(usuario.id).catch((err) => console.error('regalo, pendientes:', err.message)); // sin libro aún: al crearlo
    if (r.ventas.comprador_email) await enviar(r.ventas.comprador_email, correoRegala(r, 'aceptado')).catch(() => {});
    return { ok: true };
  }

  // --- Fotos y PDF del regalo, cuando el Autor ya tiene libro -------------------------------------
  async function pendientes(autor) {
    const [a] = await rest(`autores?id=eq.${autor}&select=fotos_incluidas_restantes,pdf_incluido`);
    if (!a) return { fotos: 0, pdf: false };
    const n = Number(a.fotos_incluidas_restantes) || 0;
    if (n <= 0 && !a.pdf_incluido) return { fotos: 0, pdf: false };
    const [hist] = await rest(`historias?autor_id=eq.${autor}&marcado_borrado=is.false&select=id&limit=1`);
    if (!hist) return { sin_libro: true };
    const out = { fotos: 0, pdf: false };
    if (n > 0) {
      const t = await rest(`autores?id=eq.${autor}&fotos_incluidas_restantes=eq.${n}`, { method: 'PATCH', headers: devolver, body: JSON.stringify({ fotos_incluidas_restantes: 0 }) });
      if (t.length) {
        try {
          const ya = await rest(`fotos?historia_id=eq.${hist.id}&select=orden`);
          const cuantas = Math.min(n, Math.max(0, MAX_FOTOS_LIBRO - ya.length)); // las que no quepan se pierden (decisión 24/10)
          let orden = ya.length ? Math.max(...ya.map((f) => Number(f.orden) || 0)) + 1 : 1;
          const filas = [];
          for (let i = 0; i < cuantas; i++) filas.push({ historia_id: hist.id, bloque_id: null, url: null, pie_foto: '', orden: orden++, origen: 'incluida_plan_familiar', lote_compra_id: null, fecha_compra: new Date().toISOString() });
          if (filas.length) await rest('fotos', { method: 'POST', headers: minimo, body: JSON.stringify(filas) });
          out.fotos = cuantas;
        } catch (e) {
          await rest(`autores?id=eq.${autor}&fotos_incluidas_restantes=eq.0`, { method: 'PATCH', headers: minimo, body: JSON.stringify({ fotos_incluidas_restantes: n }) }).catch(() => {});
          throw e;
        }
      }
    }
    if (a.pdf_incluido) {
      const t = await rest(`autores?id=eq.${autor}&pdf_incluido=is.true`, { method: 'PATCH', headers: devolver, body: JSON.stringify({ pdf_incluido: false }) });
      if (t.length) {
        try {
          const [c] = await rest(`pdf_compras?historia_id=eq.${hist.id}&select=descargas`);
          if (!c) await rest('pdf_compras', { method: 'POST', headers: minimo, body: JSON.stringify({ historia_id: hist.id, autor_id: autor, origen: 'plan_familiar', descargas: DESCARGAS_PDF }) });
          else {
            const w = await rest(`pdf_compras?historia_id=eq.${hist.id}&descargas=eq.${c.descargas}`, { method: 'PATCH', headers: devolver, body: JSON.stringify({ descargas: c.descargas + DESCARGAS_PDF }) });
            if (!w.length) throw new Error('pdf_compras cambió a la vez');
          }
          out.pdf = true;
        } catch (e) {
          await rest(`autores?id=eq.${autor}`, { method: 'PATCH', headers: minimo, body: JSON.stringify({ pdf_incluido: true }) }).catch(() => {});
          throw e;
        }
      }
    }
    return out;
  }

  // --- Ver y rechazar (sin sesión: basta el código) -----------------------------------------------
  async function ver(codigo) {
    const r = await buscar(codigo);
    const e = estadoDe(r);
    if (!e) return { error: 'NO_VALIDO' };
    if (e !== 'pendiente') return { estado: e };
    return { estado: e, regala: r.regala_nombre, destinatario: r.destinatario_nombre, mensaje: r.mensaje || '', plazo: r.plazo, idioma: r.idioma };
  }
  async function rechazar(codigo) {
    const r = await buscar(codigo);
    const e = estadoDe(r);
    if (!e) return { error: 'NO_VALIDO' };
    if (e !== 'pendiente') return { error: e.toUpperCase() };
    const res = await devolverRegalo(r, 'rechazado');
    return res === 'rechazado' ? { ok: true } : { error: 'ANULADO' };
  }

  // --- Devolución hecha fuera (desistimiento desde el panel de Stripe, o Link) ---------------------
  async function alDevolverFuera(ventaId) {
    const w = await rest(`regalos?venta_id=eq.${ventaId}&estado=eq.pendiente`, { method: 'PATCH', headers: devolver, body: JSON.stringify({ estado: 'devuelto', destinatario_nombre: null, destinatario_email: null, mensaje: null }) });
    return w.length ? 'regalo anulado' : 'sin cambios';
  }

  // --- Tarea diaria (api/diario.js) -------------------------------------------------------------------
  async function diario() {
    const ahora = new Date();
    const lista = await rest(`regalos?estado=eq.pendiente&select=${SEL.replace('ventas(', 'ventas!inner(')}&ventas.estado=eq.pagada`);
    const cuenta = { recordatorios: 0, avisos: 0, devueltos: 0, fallos: [] };
    for (const r of lista) {
      try {
        const plazo = new Date(r.plazo);
        if (plazo <= ahora) { if ((await devolverRegalo(r, 'devuelto')) === 'devuelto') cuenta.devueltos++; continue; }
        const pagada = new Date(r.ventas.pagada_en || r.creado_en);
        if (!r.recordatorio_2_en && ahora >= new Date(plazo.getTime() - DIAS_RECORDATORIO_2 * 86400000)) {
          await enviar(r.destinatario_email, correoInvitacion(r, 'rec2'));
          await rest(`regalos?id=eq.${r.id}`, { method: 'PATCH', headers: minimo, body: JSON.stringify({ recordatorio_2_en: ahora.toISOString(), recordatorio_1_en: r.recordatorio_1_en || ahora.toISOString() }) });
          cuenta.recordatorios++;
          if (r.ventas.comprador_email) { await enviar(r.ventas.comprador_email, correoRegala(r, 'quince')).catch(() => {}); cuenta.avisos++; }
        } else if (!r.recordatorio_1_en && ahora >= new Date(pagada.getTime() + DIAS_RECORDATORIO_1 * 86400000)) {
          await enviar(r.destinatario_email, correoInvitacion(r, 'rec1'));
          await rest(`regalos?id=eq.${r.id}`, { method: 'PATCH', headers: minimo, body: JSON.stringify({ recordatorio_1_en: ahora.toISOString() }) });
          cuenta.recordatorios++;
        }
      } catch (e) { cuenta.fallos.push(`${r.id}: ${e.message}`); }
    }
    // Regalos de pagos que no llegaron a hacerse: fuera sus datos (por si faltó el aviso de Stripe).
    const sueltos = await rest('regalos?select=id,ventas!inner(estado)&ventas.estado=eq.anulada');
    for (const s of sueltos) await rest(`regalos?id=eq.${s.id}`, { method: 'DELETE', headers: minimo }).catch((e) => cuenta.fallos.push(`${s.id}: ${e.message}`));
    cuenta.borrados = sueltos.length;
    return cuenta;
  }

  return { alPagar, aceptar, pendientes, ver, rechazar, alDevolverFuera, diario };
};

module.exports.ajustes = { PRECIO_REGALO, PLAZO_MESES, TINTA_REGALO, FOTOS_REGALO };
module.exports.utiles = { codigoDe, normalizar, huella, sumarMeses, correoInvitacion, correoRegala, plantilla, esc, euros, fechaLarga }; // v1.3: plantilla, esc, euros y fechaLarga
