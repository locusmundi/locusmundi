// api/pago.js — Locus Mundi
// Versión 2 · 24/10/2026 · Fase C, conversación C2-2. Continuidad, sesiones "24/10/2026 (conversación C3, II)"
// (Managed Payments) y "24/10/2026 (conversación C2-2)" (Plan Familiar). Cambios:
//   (a) Managed Payments: managed_payments[enabled]=true, precios con IVA incluido (tax_behavior inclusive)
//       y código fiscal por producto (PDF txcd_10302000; el resto txcd_10000000). Fuera el IVA provisional
//       del 21 %: el impuesto lo calcula Stripe y se apunta el que devuelve (solo si el cobro es en euros).
//       El importe se comprueba en euros también con Adaptive Pricing (currency_conversion).
//       Interruptor STRIPE_MANAGED_PAYMENTS=no (variable de entorno) por si Stripe lo deniega.
//       STRIPE_API_VERSION (opcional): sin ella, la versión de la cuenta (2026-09-30, ≥ 2025-03-31.basil).
//   (b) Plan Familiar (producto "plan_familiar", sin cuenta): abrir, ver_regalo, aceptar_regalo,
//       rechazar_regalo, pendientes_regalo; la lógica, en api/_regalo.js. Al pagarse: correos al destinatario
//       y a quien regala. Caducada la sesión: se borra el regalo. Devuelta desde fuera: regalo anulado.
// Versión 1 · 22/10/2026 · Fase C, punto 3 (conversación C2). Contenido: Continuidad, sesión
// "21/10/2026 (conversación C1: Stripe, contenido)", puntos 3 a 5. Tablas: ventas, pdf_compras (C2, paso 1).
//
// UNA SOLA FUNCIÓN para todo el cobro (el plan Hobby de Vercel admite 12 funciones):
//   - Desde la web (POST JSON, sin cabecera de Stripe):
//       {accion:"abrir", token, producto:"fotos"|"asistente"|"pdf", cantidad, idioma, desistimiento:true}
//         → {url}: página de pago de Stripe. El precio y lo que se entrega los decide el servidor.
//       {accion:"consultar", token, venta} → {estado}: para la web al volver de Stripe.
//   - Desde Stripe (aviso firmado, cabecera stripe-signature):
//       checkout.session.completed → entrega (fotos, tinta o PDF) y apunta la venta como pagada.
//       checkout.session.expired   → la venta abierta pasa a anulada.
//       charge.refunded            → devuelta.     charge.dispute.created → en_disputa.
// Sin entrega sin cobro ni cobro sin entrega. El Plan Familiar (regalo), en la C2-2.
// Seguridad: el Autor sale del token (Supabase), nunca del navegador; Stripe, por su firma.
// Variables de entorno nuevas: STRIPE_SECRET_KEY (sk_test_… / sk_live_…) y STRIPE_WEBHOOK_SECRET (whsec_…).

const crypto = require('crypto');
const { avisar } = require('./_aviso');
const crearRegalos = require('./_regalo'); // v2

// --- Ajustes ---------------------------------------------------------------------------------------
const MAX_FOTOS_LIBRO = 20;          // = index.html
const LOTES_FOTOS = [5, 10, 15, 20];
const PRECIO_FOTO = 100;             // céntimos
const CARGAS_ASISTENTE = { 5: 2, 10: 4 }; // euros pagados → euros de tinta (2 € por cada 5 €)
const PRECIO_PDF = 500;
const DESCARGAS_POR_COMPRA = 15;     // = api/pdf.js
const SIN_PDF = ['AR', 'ZH', 'JA', 'HI']; // = api/pdf.js
// v2: fuera IVA_TIPO (21 % provisional). Managed Payments: el IVA lo calcula Stripe por el código fiscal.
const CODIGO_FISCAL = { fotos: 'txcd_10000000', asistente: 'txcd_10000000', pdf: 'txcd_10302000', plan_familiar: 'txcd_10000000' };
const MANAGED = () => process.env.STRIPE_MANAGED_PAYMENTS !== 'no';
const VERSION_DESISTIMIENTO = 'terms_consent 2026-09-29'; // texto de la casilla (index.html, terms_consent)
const VERSION_REGALO = 'gift_terms PROVISIONAL 2026-10-24 (edad + condiciones del regalo)'; // C3-III
const MAX_NOMBRE = 80; const MAX_MENSAJE = 500;
const MINUTOS_PAGO = 30;             // mínimo que admite Stripe
const ORIGENES = ['https://www.locusmundi.com', 'https://locusmundi.com', 'https://locusmundi.vercel.app'];

const NOMBRE = {
  fotos:     { ES: (n) => `Locus Mundi · ${n} fotos para tu libro`, EN: (n) => `Locus Mundi · ${n} photos for your book` },
  asistente: { ES: (n) => `Locus Mundi · Carga del Asistente editorial (${n} €)`, EN: (n) => `Locus Mundi · Editorial Assistant top-up (€${n})` },
  pdf:       { ES: () => 'Locus Mundi · Archivo imprimible (PDF), 15 descargas', EN: () => 'Locus Mundi · Printable file (PDF), 15 downloads' },
  plan_familiar: { ES: () => 'Locus Mundi · Plan Familiar de regalo', EN: () => 'Locus Mundi · Family Plan gift' }, // v2
};

// --- Supabase -------------------------------------------------------------------------------------
const SB = () => process.env.SUPABASE_URL || 'https://olpfybpykuascwltnqtv.supabase.co';
const LLAVE = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
async function rest(ruta, opciones) {
  const o = opciones || {};
  const r = await fetch(`${SB()}/rest/v1/${ruta}`, Object.assign({}, o, {
    headers: Object.assign({ apikey: LLAVE(), Authorization: `Bearer ${LLAVE()}`, 'Content-Type': 'application/json' }, o.headers || {}),
  }));
  const texto = await r.text();
  let datos = null; try { datos = texto ? JSON.parse(texto) : null; } catch (_) { datos = texto; }
  if (!r.ok) { const e = new Error(`Supabase ${r.status}: ${texto}`); e.datos = datos; throw e; }
  return datos;
}
const devolver = { Prefer: 'return=representation' };
async function usuarioDelToken(token) {
  if (!token || typeof token !== 'string') return null;
  const r = await fetch(`${SB()}/auth/v1/user`, { headers: { apikey: LLAVE(), Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? { id: u.id, email: u.email || null } : null;
}

// --- Stripe (sin librerías: su API es de formularios) ---------------------------------------------
function formulario(obj, prefijo, out) {
  out = out || [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const clave = prefijo ? `${prefijo}[${k}]` : k;
    if (typeof v === 'object') formulario(v, clave, out);
    else out.push(`${encodeURIComponent(clave)}=${encodeURIComponent(String(v))}`);
  }
  return out.join('&');
}
async function stripe(metodo, ruta, datos) {
  const r = await fetch(`https://api.stripe.com/v1/${ruta}`, {
    method: metodo,
    headers: Object.assign({ Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      process.env.STRIPE_API_VERSION ? { 'Stripe-Version': process.env.STRIPE_API_VERSION } : {}), // v2
    body: datos ? formulario(datos) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(`Stripe ${r.status}: ${(j.error && j.error.message) || ''}`); e.stripe = j; throw e; }
  return j;
}
// Firma del aviso (cabecera "t=…,v1=…"): HMAC-SHA256 de "t.cuerpo" con el secreto; 5 minutos de margen.
function firmaValida(cuerpo, cabecera, secreto, ahora) {
  if (!cabecera || !secreto) return false;
  const partes = {}; const v1 = [];
  for (const p of String(cabecera).split(',')) { const [k, v] = p.split('='); if (k === 'v1') v1.push(v); else partes[k] = v; }
  const t = Number(partes.t);
  if (!t || !v1.length) return false;
  if (Math.abs((ahora || Date.now()) / 1000 - t) > 300) return false;
  const esperado = crypto.createHmac('sha256', secreto).update(`${t}.${cuerpo}`, 'utf8').digest('hex');
  return v1.some((s) => s.length === esperado.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(esperado)));
}

// --- Cuerpo de la petición (crudo: la firma se calcula sobre él) ----------------------------------
async function cuerpoCrudo(req) {
  if (typeof req.rawBody === 'string') return req.rawBody;
  const trozos = [];
  for await (const c of req) trozos.push(typeof c === 'string' ? Buffer.from(c) : c);
  return Buffer.concat(trozos).toString('utf8');
}

// --- Importes (v2) ---------------------------------------------------------------------------------
// El impuesto lo calcula Stripe; se apunta al pagarse (impuestosDe). Aquí solo el total, IVA incluido.
function desglose(total) { return { total_cent: total }; }
// Importe pagado en euros (con Adaptive Pricing el cliente puede pagar en su moneda).
function importeEnEuros(s) {
  const cc = s.currency_conversion;
  if (cc && String(cc.source_currency).toLowerCase() === 'eur' && typeof cc.amount_total === 'number') return cc.amount_total;
  return String(s.currency).toLowerCase() === 'eur' ? s.amount_total : null;
}
function impuestosDe(s, total) {
  const tax = s.total_details && s.total_details.amount_tax;
  if (String(s.currency).toLowerCase() !== 'eur' || typeof tax !== 'number') return {}; // en otra moneda: informe de Stripe
  return { iva_cent: tax, base_cent: total - tax, iva_tipo: tax && total - tax ? Math.round((tax / (total - tax)) * 1000) / 10 : 0 };
}
// Datos de la sesión de pago comunes a todos los productos (v2: Managed Payments).
function lineaDePago(producto, idioma, total, n) {
  return { 0: { quantity: 1, price_data: { currency: 'eur', unit_amount: total, tax_behavior: 'inclusive',
    product_data: { name: NOMBRE[producto][idioma](n), tax_code: CODIGO_FISCAL[producto] } } } };
}

// --- El libro vivo del Autor ----------------------------------------------------------------------
async function libroDe(autor) {
  const [h] = await rest(`historias?autor_id=eq.${autor}&marcado_borrado=is.false&select=id&limit=1`);
  return h ? h.id : null;
}

// ====================================================================================================
// ABRIR UN PAGO
async function abrir(b, req, res) {
  if (b.producto === 'plan_familiar') return abrirRegalo(b, req, res); // v2: sin cuenta
  const u = await usuarioDelToken(b.token);
  if (!u) return res.status(401).json({ error: 'SESION' });
  const producto = b.producto;
  if (!['fotos', 'asistente', 'pdf'].includes(producto)) return res.status(400).json({ error: 'PRODUCTO' });
  if (b.desistimiento !== true) return res.status(400).json({ error: 'DESISTIMIENTO' });
  const idioma = String(b.idioma || '').toUpperCase() === 'EN' ? 'EN' : 'ES';
  const cantidad = Number(b.cantidad);

  const historia = await libroDe(u.id);
  let total; let cant = 1;
  if (producto === 'fotos') {
    if (!historia) return res.status(409).json({ error: 'SIN_LIBRO' });
    if (!LOTES_FOTOS.includes(cantidad)) return res.status(400).json({ error: 'CANTIDAD' });
    const fotos = await rest(`fotos?historia_id=eq.${historia}&select=id`);
    if (fotos.length + cantidad > MAX_FOTOS_LIBRO) return res.status(409).json({ error: 'MAX_FOTOS', quedan: MAX_FOTOS_LIBRO - fotos.length });
    total = PRECIO_FOTO * cantidad; cant = cantidad;
  } else if (producto === 'asistente') {
    if (!CARGAS_ASISTENTE[cantidad]) return res.status(400).json({ error: 'CANTIDAD' });
    total = cantidad * 100; cant = 1;
  } else {
    if (!historia) return res.status(409).json({ error: 'NO_PUBLICADO' });
    const [pub] = await rest(`publicaciones?historia_id=eq.${historia}&select=idioma_original`);
    if (!pub) return res.status(409).json({ error: 'NO_PUBLICADO' });
    if (SIN_PDF.includes(String(pub.idioma_original || '').toUpperCase())) return res.status(409).json({ error: 'NO_DISPONIBLE' });
    const [c] = await rest(`pdf_compras?historia_id=eq.${historia}&select=descargas`);
    if (c) { // recompra solo con las descargas agotadas (C1, opción a)
      const hechas = await rest(`pdf_descargas?historia_id=eq.${historia}&select=id`);
      if (hechas.length < c.descargas) return res.status(409).json({ error: 'QUEDAN_DESCARGAS' });
    }
    total = PRECIO_PDF;
  }

  // Un pago abierto anterior del mismo producto y libro (otra pestaña) se anula (C1, fotos).
  const filtroLibro = (historia && producto !== 'asistente') ? `historia_id=eq.${historia}` : `autor_id=eq.${u.id}`; // la tinta es del Autor
  const abiertas = await rest(`ventas?${filtroLibro}&producto=eq.${producto}&estado=eq.abierta&select=id,stripe_sesion`);
  for (const v of abiertas) {
    if (v.stripe_sesion) { try { await stripe('POST', `checkout/sessions/${v.stripe_sesion}/expire`); } catch (_) { /* ya pagada o caducada: lo dirá el aviso */ } }
    await rest(`ventas?id=eq.${v.id}&estado=eq.abierta`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ estado: 'anulada' }) });
  }

  const [venta] = await rest('ventas', {
    method: 'POST', headers: devolver,
    body: JSON.stringify(Object.assign({
      producto, cantidad: producto === 'asistente' ? cantidad : cant, historia_id: historia, autor_id: u.id, idioma,
      comprador_email: u.email, desistimiento_en: new Date().toISOString(), desistimiento_version: VERSION_DESISTIMIENTO,
    }, desglose(total))),
  });

  const origen = ORIGENES.includes(req.headers.origin) ? req.headers.origin : ORIGENES[0];
  const sesion = await stripe('POST', 'checkout/sessions', {
    mode: 'payment',
    locale: idioma === 'EN' ? 'en' : 'es',
    client_reference_id: venta.id,
    customer_email: u.email || undefined,
    expires_at: Math.floor(Date.now() / 1000) + MINUTOS_PAGO * 60,
    success_url: `${origen}/?pago=ok&venta=${venta.id}`,
    cancel_url: `${origen}/?pago=cancelado&venta=${venta.id}`,
    metadata: { venta_id: venta.id, producto },
    payment_intent_data: { metadata: { venta_id: venta.id, producto } },
    line_items: lineaDePago(producto, idioma, total, producto === 'fotos' ? cant : cantidad), // v2
    managed_payments: MANAGED() ? { enabled: true } : undefined, // v2
  });
  await rest(`ventas?id=eq.${venta.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ stripe_sesion: sesion.id }) });
  return res.status(200).json({ url: sesion.url, venta: venta.id });
}

// v2: el regalo lo puede comprar cualquiera, sin cuenta (C1, punto 4).
const limpio = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
async function abrirRegalo(b, req, res) {
  if (!process.env.REGALO_SECRETO) return res.status(503).json({ error: 'SIN_STRIPE' });
  if (b.edad !== true || b.desistimiento !== true) return res.status(400).json({ error: 'DESISTIMIENTO' });
  const idioma = String(b.idioma || '').toUpperCase() === 'EN' ? 'EN' : 'ES';
  const regala = limpio(b.regala_nombre, MAX_NOMBRE);
  const destinatario = limpio(b.destinatario_nombre, MAX_NOMBRE);
  const email = limpio(b.destinatario_email, 200).toLowerCase();
  const mensaje = String(b.mensaje || '').replace(/\r\n/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, MAX_MENSAJE);
  if (!regala || !destinatario) return res.status(400).json({ error: 'NOMBRE' });
  if (!CORREO_RE.test(email)) return res.status(400).json({ error: 'CORREO' });
  const total = crearRegalos.ajustes.PRECIO_REGALO;
  const [venta] = await rest('ventas', {
    method: 'POST', headers: devolver,
    body: JSON.stringify(Object.assign({ producto: 'plan_familiar', cantidad: 1, historia_id: null, autor_id: null, idioma,
      desistimiento_en: new Date().toISOString(), desistimiento_version: VERSION_REGALO }, desglose(total))),
  });
  const id = crypto.randomUUID();
  await rest('regalos', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({
    id, venta_id: venta.id, regala_nombre: regala, destinatario_nombre: destinatario, destinatario_email: email,
    mensaje: mensaje || null, idioma, codigo_hash: crearRegalos.utiles.huella(crearRegalos.utiles.codigoDe(id)),
    plazo: crearRegalos.utiles.sumarMeses(new Date(), crearRegalos.ajustes.PLAZO_MESES).toISOString(), // se fija al pagarse
  }) });
  const origen = ORIGENES.includes(req.headers.origin) ? req.headers.origin : ORIGENES[0];
  const sesion = await stripe('POST', 'checkout/sessions', {
    mode: 'payment',
    locale: idioma === 'EN' ? 'en' : 'es',
    client_reference_id: venta.id,
    expires_at: Math.floor(Date.now() / 1000) + MINUTOS_PAGO * 60,
    success_url: `${origen}/?regalo=pagado&venta=${venta.id}`,
    cancel_url: `${origen}/?regalo=cancelado&venta=${venta.id}`,
    metadata: { venta_id: venta.id, producto: 'plan_familiar' },
    payment_intent_data: { metadata: { venta_id: venta.id, producto: 'plan_familiar' } },
    line_items: lineaDePago('plan_familiar', idioma, total, 1),
    managed_payments: MANAGED() ? { enabled: true } : undefined,
  });
  await rest(`ventas?id=eq.${venta.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ stripe_sesion: sesion.id }) });
  return res.status(200).json({ url: sesion.url, venta: venta.id });
}
const REG = () => crearRegalos({ rest, stripe });
async function accionRegalo(b, res) {
  const R = REG();
  if (b.accion === 'ver_regalo') { const d = await R.ver(b.codigo); return res.status(d.error ? 404 : 200).json(d); }
  if (b.accion === 'rechazar_regalo') { const d = await R.rechazar(b.codigo); return res.status(d.error ? 409 : 200).json(d); }
  const u = await usuarioDelToken(b.token);
  if (!u) return res.status(401).json({ error: 'SESION' });
  if (b.accion === 'aceptar_regalo') { const d = await R.aceptar(b.codigo, u); return res.status(d.error ? 409 : 200).json(d); }
  if (b.accion === 'pendientes_regalo') return res.status(200).json(await R.pendientes(u.id));
  return res.status(400).json({ error: 'ACCION' });
}

async function consultar(b, res) {
  if (!/^[0-9a-f-]{36}$/i.test(String(b.venta || ''))) return res.status(400).json({ error: 'VENTA' });
  // v2: el regalo, con o sin cuenta (solo el estado)
  const [g] = await rest(`ventas?id=eq.${b.venta}&producto=eq.plan_familiar&select=estado,producto`);
  if (g) return res.status(200).json(g);
  const u = await usuarioDelToken(b.token);
  if (!u) return res.status(401).json({ error: 'SESION' });
  const [v] = await rest(`ventas?id=eq.${b.venta}&autor_id=eq.${u.id}&select=estado,producto,cantidad`);
  if (!v) return res.status(404).json({ error: 'VENTA' });
  return res.status(200).json(v);
}

// ====================================================================================================
// ENTREGA (aviso de Stripe). Se reclama la venta (abierta/anulada → pagada) en una sola escritura:
// si llega dos veces, la segunda no encuentra nada que reclamar. Si la entrega falla, la venta
// vuelve a su estado y se responde 500: Stripe repite el aviso.
async function entregar(sesion) {
  const ventaId = (sesion.metadata && sesion.metadata.venta_id) || sesion.client_reference_id;
  if (!ventaId) return 'sin venta';
  if (sesion.payment_status !== 'paid') return 'no pagada';
  const [previa] = await rest(`ventas?id=eq.${ventaId}&select=*`);
  if (!previa) { await avisar('Locus Mundi: pago sin venta', `Sesión ${sesion.id} pagada, venta ${ventaId} inexistente.`).catch(() => {}); return 'venta inexistente'; }
  const pagado = importeEnEuros(sesion); // v2: en euros también con Adaptive Pricing
  if (pagado !== previa.total_cent) { await avisar('Locus Mundi: importe distinto', `Venta ${ventaId}: ${pagado} (${sesion.amount_total} ${sesion.currency}) frente a ${previa.total_cent}.`).catch(() => {}); return 'importe distinto'; }
  const reclamada = await rest(`ventas?id=eq.${ventaId}&estado=in.(abierta,anulada)`, {
    method: 'PATCH', headers: devolver,
    body: JSON.stringify(Object.assign({
      estado: 'pagada', pagada_en: new Date().toISOString(), stripe_pago: sesion.payment_intent || null,
      comprador_nombre: (sesion.customer_details && sesion.customer_details.name) || previa.comprador_nombre,
      comprador_email: (sesion.customer_details && sesion.customer_details.email) || previa.comprador_email,
      pais_declarado: (sesion.customer_details && sesion.customer_details.address && sesion.customer_details.address.country) || null,
    }, impuestosDe(sesion, previa.total_cent))), // v2: el IVA que calculó Stripe
  });
  if (!reclamada.length) return 'ya entregada';
  const v = reclamada[0];
  try {
    if (v.producto === 'fotos') await entregarFotos(v, sesion);
    else if (v.producto === 'asistente') await entregarTinta(v);
    else if (v.producto === 'pdf') await entregarPdf(v);
    else if (v.producto === 'plan_familiar') { await completarImportes(v).catch(() => {}); await REG().alPagar(v); } // v2: comisión antes (devolución)
  } catch (e) {
    await rest(`ventas?id=eq.${v.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ estado: previa.estado, pagada_en: null }) }).catch(() => {});
    throw e;
  }
  await completarImportes(v).catch(() => {}); // comisión, neto y país de la tarjeta: no impide la entrega
  return 'entregada';
}

async function entregarFotos(v, sesion) {
  const ya = await rest(`fotos?historia_id=eq.${v.historia_id}&select=orden,lote_compra_id`);
  const deEsta = ya.filter((f) => f.lote_compra_id === v.id).length;
  const faltan = v.cantidad - deEsta;
  if (faltan <= 0) return;
  if (ya.length + faltan > MAX_FOTOS_LIBRO) { // no cabe (pago doble entre pestañas): devolución entera
    await stripe('POST', 'refunds', { payment_intent: sesion.payment_intent, metadata: { venta_id: v.id, motivo: 'MAX_FOTOS' } });
    await rest(`ventas?id=eq.${v.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ estado: 'devuelta', devuelta_en: new Date().toISOString(), devolucion_cent: v.total_cent }) });
    await avisar('Locus Mundi: fotos devueltas', `Venta ${v.id}: el lote no cabía en el libro ${v.historia_id}; devuelto entero.`).catch(() => {});
    return;
  }
  let orden = ya.length ? Math.max(...ya.map((f) => Number(f.orden) || 0)) + 1 : 1;
  const filas = [];
  for (let i = 0; i < faltan; i++) filas.push({ historia_id: v.historia_id, bloque_id: null, url: null, pie_foto: '', orden: orden++, origen: 'comprada', lote_compra_id: v.id, fecha_compra: new Date().toISOString() });
  await rest('fotos', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(filas) });
}

async function entregarTinta(v) {
  const euros = Math.round(v.total_cent / 100);
  const tinta = CARGAS_ASISTENTE[euros];
  if (!tinta) throw new Error(`Carga desconocida: ${euros} €`);
  for (let i = 0; i < 5; i++) { // misma escritura condicionada que api/asistente.js
    const [a] = await rest(`autores?id=eq.${v.autor_id}&select=tinta_euros`);
    if (!a) throw new Error('Autor inexistente');
    const actual = Number(a.tinta_euros) || 0;
    const nueva = Math.round((actual + tinta) * 1e6) / 1e6;
    const r = await rest(`autores?id=eq.${v.autor_id}&tinta_euros=eq.${actual}`, {
      method: 'PATCH', headers: devolver, body: JSON.stringify({ tinta_euros: nueva, tinta_ultima_carga: nueva }),
    });
    if (r.length) return;
  }
  throw new Error('La tinta cambió cinco veces seguidas');
}

async function entregarPdf(v) {
  const [c] = await rest(`pdf_compras?historia_id=eq.${v.historia_id}&select=descargas,venta_id`);
  if (c && c.venta_id === v.id) return;
  if (!c) {
    await rest('pdf_compras', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ historia_id: v.historia_id, autor_id: v.autor_id, origen: 'stripe', descargas: DESCARGAS_POR_COMPRA, venta_id: v.id }) });
  } else {
    const r = await rest(`pdf_compras?historia_id=eq.${v.historia_id}&descargas=eq.${c.descargas}`, {
      method: 'PATCH', headers: devolver, body: JSON.stringify({ descargas: c.descargas + DESCARGAS_POR_COMPRA, origen: 'stripe', venta_id: v.id }),
    });
    if (!r.length) throw new Error('pdf_compras cambió a la vez');
  }
}

async function completarImportes(v) {
  if (!v.stripe_pago) return;
  const pi = await stripe('GET', `payment_intents/${v.stripe_pago}?expand[]=latest_charge.balance_transaction`);
  const ch = pi.latest_charge || {};
  const bt = ch.balance_transaction || {};
  const pais = ch.payment_method_details && ch.payment_method_details.card && ch.payment_method_details.card.country;
  const cambios = { pais_tarjeta: pais || null };
  if (typeof bt.fee === 'number') { cambios.comision_cent = bt.fee; cambios.neto_cent = bt.net; }
  await rest(`ventas?id=eq.${v.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(cambios) });
}

async function aviso(evento) {
  const o = evento.data && evento.data.object;
  if (!o) return 'vacío';
  switch (evento.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      return entregar(o);
    case 'checkout.session.expired': {
      const id = (o.metadata && o.metadata.venta_id) || o.client_reference_id;
      if (id) {
        const w = await rest(`ventas?id=eq.${id}&estado=eq.abierta`, { method: 'PATCH', headers: devolver, body: JSON.stringify({ estado: 'anulada' }) });
        if (w.length && w[0].producto === 'plan_familiar') await rest(`regalos?venta_id=eq.${id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); // v2: fuera los datos
      }
      return 'anulada';
    }
    case 'charge.refunded': {
      if (!o.payment_intent) return 'devuelta';
      const w = await rest(`ventas?stripe_pago=eq.${o.payment_intent}`, { method: 'PATCH', headers: devolver, body: JSON.stringify({ estado: 'devuelta', devuelta_en: new Date().toISOString(), devolucion_cent: o.amount_refunded }) });
      if (w.length && w[0].producto === 'plan_familiar') return REG().alDevolverFuera(w[0].id); // v2: desistimiento (panel o Link)
      return 'devuelta';
    }
    case 'charge.dispute.created':
      if (o.payment_intent) await rest(`ventas?stripe_pago=eq.${o.payment_intent}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ estado: 'en_disputa' }) });
      await avisar('Locus Mundi: disputa de un pago', `Pago ${o.payment_intent}: el cliente ha abierto una disputa (20 €). Revisar en Stripe.`).catch(() => {});
      return 'en_disputa';
    default:
      return 'ignorado';
  }
}

// ====================================================================================================
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METODO' });
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'SIN_STRIPE' });
  let crudo;
  try { crudo = await cuerpoCrudo(req); } catch (_) { crudo = ''; }
  if (!crudo && req.body) crudo = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const firma = req.headers['stripe-signature'];
  try {
    if (firma) {
      if (!firmaValida(crudo, firma, process.env.STRIPE_WEBHOOK_SECRET)) return res.status(400).json({ error: 'FIRMA' });
      const resultado = await aviso(JSON.parse(crudo));
      return res.status(200).json({ ok: true, resultado });
    }
    const b = JSON.parse(crudo || '{}');
    if (b.accion === 'abrir') return await abrir(b, req, res);
    if (b.accion === 'consultar') return await consultar(b, res);
    if (/_regalo$/.test(String(b.accion || ''))) return await accionRegalo(b, res); // v2
    return res.status(400).json({ error: 'ACCION' });
  } catch (e) {
    console.error('pago:', e.message);
    if (firma) await avisar('Locus Mundi: fallo al entregar un pago', e.message).catch(() => {});
    return res.status(500).json({ error: 'ERROR' });
  }
};
module.exports._util = { rest, stripe }; // v2: para api/diario.js (regalos)
module.exports._pruebas = { firmaValida, formulario, desglose, importeEnEuros, impuestosDe, lineaDePago };
