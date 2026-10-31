// api/_firma.js — Locus Mundi
// Versión 1.1 · 31/10/2026 · Logo transparente. Versión 1 · 31/10/2026 · Fase C, Lista pendiente (r). Continuidad, sesión «31/10/2026 (cuentas vacías en real y
// «más leídos»)», punto 4. Firma corporativa al pie de los correos que reciben Autores y compradores (no en los
// internos: api/_aviso.js avisar()). HTML: la de firma-locus-mundi-figura.html, tal cual (en inglés, con el logo).
// v1.1 (31/10, 17:10): logo con fondo transparente (logo_locus_mundi_transparente.png, 146×180, se ve a 73×90), para que
// no haga recuadro blanco sobre la tarjeta crema (decisión de Javier). Texto plano: la misma, sin imagen. Módulo (empieza por «_»): no es una función de Vercel.

const FIRMA_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:Georgia,'Times New Roman',serif;">
  <tr>
    <td style="padding:0 16px 0 0;vertical-align:middle;">
      <a href="https://www.locusmundi.com" style="text-decoration:none;"><img src="https://www.locusmundi.com/logo_locus_mundi_transparente.png" width="73" height="90" alt="Locus Mundi" style="display:block;border:0;width:73px;height:90px;"></a>
    </td>
    <td style="padding:2px 0 2px 16px;vertical-align:middle;border-left:2px solid #C4932A;">
      <div style="font-size:17px;line-height:22px;color:#9A0117;font-weight:bold;letter-spacing:0.3px;">Locus Mundi Team</div>
      <div style="font-size:13px;line-height:20px;color:#C4932A;font-style:italic;">Remember · Tell · Publish · Share</div>
      <div style="font-size:13px;line-height:20px;color:#555555;">
        <a href="https://www.locusmundi.com" style="color:#1B3A6B;text-decoration:none;">www.locusmundi.com</a>
        &nbsp;·&nbsp;
        <a href="mailto:contactlocusmundi@gmail.com" style="color:#1B3A6B;text-decoration:none;">contactlocusmundi@gmail.com</a>
      </div>
    </td>
  </tr>
</table>`;

const FIRMA_TEXTO = '-- \nLocus Mundi Team\nRemember · Tell · Publish · Share\nwww.locusmundi.com · contactlocusmundi@gmail.com';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Para los correos que solo tenían texto (admin.js, enviar-formulario.js, registro-lssi.js): el mismo texto en
// párrafos, con la firma al pie. Devuelve { html, text }.
function conFirma(texto) {
  const parrafos = String(texto).split(/\n{2,}/).map((b) => `<p style="margin:0 0 1em;">${esc(b).replace(/\n/g, '<br>')}</p>`).join('');
  const html = `<!doctype html><html><body style="margin:0;padding:16px;background:#ffffff;">`
    + `<div style="font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.5;color:#222;max-width:560px;">${parrafos}</div>`
    + `<div style="margin-top:24px;">${FIRMA_HTML}</div></body></html>`;
  return { html, text: `${texto}\n\n${FIRMA_TEXTO}` };
}

module.exports = { FIRMA_HTML, FIRMA_TEXTO, conFirma };
