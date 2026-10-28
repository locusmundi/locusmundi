// api/_ventas.js — Locus Mundi
// Versión 1 · 28/10/2026 · Fase C, endurecimiento parte 6 (Continuidad, sesión «28/10/2026 (endurecimiento,
// parte 6)», punto 6). Decisión de Javier: un resumen de ventas por correo cada semana y otro cada mes, para
// llevar la cuenta propia y cotejarla con Stripe (informe de transferencias). Lo llama api/diario.js:
//  - los lunes, la semana anterior (lunes a domingo, hora de Madrid);
//  - el día 1, el mes anterior, con un CSV adjunto para la gestoría.
// Solo lee la tabla `ventas`; no cambia nada. Con guion bajo: es un módulo, no una función de Vercel.
// Las ventas del modo de prueba de Stripe (sesión `cs_test_…`) se cuentan aparte y se marcan [PRUEBA].

const ZONA = 'Europe/Madrid';
const NOMBRES = { fotos: 'Fotos', asistente: 'Asistente', pdf: 'PDF', plan_familiar: 'Plan Familiar' };

function supa(ruta) {
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return fetch(`${process.env.SUPABASE_URL}/rest/v1/${ruta}`, {
    headers: { apikey: llave, Authorization: `Bearer ${llave}` },
  });
}

// Fecha (año, mes 1-12, día) de un instante, en hora de Madrid.
function diaMadrid(fecha) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(fecha).reduce((o, x) => (o[x.type] = x.value, o), {});
  return { a: +p.year, m: +p.month, d: +p.day };
}

// Instante de las 00:00 de Madrid de ese día (sirve con horario de verano e invierno).
function medianoche(a, m, d) {
  const aprox = Date.UTC(a, m - 1, d);
  for (const h of [-1, -2, 0]) { // Madrid va 1 o 2 horas por delante de UTC
    const t = new Date(aprox + h * 3600000);
    const x = diaMadrid(t);
    const hora = +new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, hour: '2-digit', hourCycle: 'h23' }).format(t);
    if (x.a === a && x.m === m && x.d === d && hora === 0) return t;
  }
  return new Date(aprox);
}

// Periodos que tocan hoy: [{ tipo: 'semana'|'mes', desde, hasta, nombre }].
function periodosDeHoy(ahora = new Date()) {
  const hoy = diaMadrid(ahora);
  const hasta = medianoche(hoy.a, hoy.m, hoy.d);
  const lista = [];
  const diaSemana = new Date(Date.UTC(hoy.a, hoy.m - 1, hoy.d)).getUTCDay(); // 1 = lunes
  if (diaSemana === 1) {
    const l = new Date(Date.UTC(hoy.a, hoy.m - 1, hoy.d - 7));
    const desde = medianoche(l.getUTCFullYear(), l.getUTCMonth() + 1, l.getUTCDate());
    const fin = new Date(Date.UTC(hoy.a, hoy.m - 1, hoy.d - 1));
    lista.push({ tipo: 'semana', desde, hasta, nombre: `semana del ${fmtDia(desde)} al ${fin.getUTCDate()}/${fin.getUTCMonth() + 1}/${fin.getUTCFullYear()}` });
  }
  if (hoy.d === 1) {
    const ma = hoy.m === 1 ? hoy.a - 1 : hoy.a, mm = hoy.m === 1 ? 12 : hoy.m - 1;
    const desde = medianoche(ma, mm, 1);
    const mes = new Intl.DateTimeFormat('es-ES', { timeZone: ZONA, month: 'long', year: 'numeric' }).format(new Date(Date.UTC(ma, mm - 1, 15)));
    lista.push({ tipo: 'mes', desde, hasta, nombre: mes });
  }
  return lista;
}

function fmtDia(t) { const x = diaMadrid(t); return `${x.d}/${x.m}/${x.a}`; }
const eur = c => (c / 100).toFixed(2).replace('.', ',') + ' €';
const esPrueba = v => String(v.stripe_sesion || '').startsWith('cs_test_');

async function leerPeriodo(desde, hasta) {
  const d = encodeURIComponent(desde.toISOString()), h = encodeURIComponent(hasta.toISOString());
  const campos = 'id,producto,cantidad,estado,total_cent,base_cent,iva_cent,iva_tipo,comision_cent,neto_cent,pais_tarjeta,pais_declarado,pagada_en,devuelta_en,devolucion_cent,stripe_pago,stripe_sesion';
  const [rp, rd] = await Promise.all([
    supa(`ventas?pagada_en=gte.${d}&pagada_en=lt.${h}&select=${campos}&order=pagada_en.asc`),
    supa(`ventas?devuelta_en=gte.${d}&devuelta_en=lt.${h}&select=${campos}&order=devuelta_en.asc`),
  ]);
  if (!rp.ok) throw new Error(`ventas: ${rp.status} ${(await rp.text()).slice(0, 200)}`);
  if (!rd.ok) throw new Error(`devoluciones: ${rd.status} ${(await rd.text()).slice(0, 200)}`);
  return { cobros: await rp.json(), devoluciones: await rd.json() };
}

function sumar(filas) {
  const s = { n: 0, total: 0, base: 0, iva: 0, comision: 0, neto: 0 };
  for (const v of filas) {
    s.n++; s.total += v.total_cent || 0; s.base += v.base_cent || 0; s.iva += v.iva_cent || 0;
    s.comision += v.comision_cent || 0; s.neto += v.neto_cent || 0;
  }
  return s;
}

function bloque(titulo, cobros, devoluciones) {
  const t = sumar(cobros);
  const dev = devoluciones.reduce((a, v) => a + (v.devolucion_cent || 0), 0);
  const lineas = [
    `${titulo}`,
    `  Cobros: ${t.n} · total ${eur(t.total)} · base ${eur(t.base)} · IVA ${eur(t.iva)} · comisión de Stripe ${eur(t.comision)} · neto ${eur(t.neto)}`,
  ];
  const porProducto = {};
  for (const v of cobros) (porProducto[v.producto] = porProducto[v.producto] || []).push(v);
  for (const [p, fs] of Object.entries(porProducto)) {
    const s = sumar(fs);
    lineas.push(`    - ${NOMBRES[p] || p}: ${s.n} · ${eur(s.total)} (neto ${eur(s.neto)})`);
  }
  lineas.push(`  Devoluciones: ${devoluciones.length} · ${eur(dev)}`);
  lineas.push(`  Neto menos devoluciones: ${eur(t.neto - dev)}`);
  return lineas.join('\n');
}

function detalle(cobros, devoluciones) {
  const l = cobros.map(v => `${fmtDia(new Date(v.pagada_en))} · ${NOMBRES[v.producto] || v.producto} · ${eur(v.total_cent || 0)} · IVA ${eur(v.iva_cent || 0)} · comisión ${eur(v.comision_cent || 0)} · ${v.stripe_pago || '—'}${esPrueba(v) ? ' [PRUEBA]' : ''}`);
  const d = devoluciones.map(v => `${fmtDia(new Date(v.devuelta_en))} · DEVOLUCIÓN ${NOMBRES[v.producto] || v.producto} · ${eur(v.devolucion_cent || 0)} · ${v.stripe_pago || '—'}${esPrueba(v) ? ' [PRUEBA]' : ''}`);
  return [...l, ...d].join('\n') || '(ninguna)';
}

function csv(cobros, devoluciones) {
  const c = x => `"${String(x == null ? '' : x).replace(/"/g, '""')}"`;
  const n = x => x == null ? '' : (x / 100).toFixed(2).replace('.', ',');
  const filas = [['tipo', 'fecha', 'producto', 'cantidad', 'total', 'base', 'iva', 'iva_tipo', 'comision', 'neto', 'devolucion', 'pais_tarjeta', 'pais_declarado', 'stripe_pago', 'modo', 'id'].join(';')];
  for (const v of cobros) filas.push([c('cobro'), c(v.pagada_en), c(v.producto), c(v.cantidad), n(v.total_cent), n(v.base_cent), n(v.iva_cent), c(v.iva_tipo), n(v.comision_cent), n(v.neto_cent), '', c(v.pais_tarjeta), c(v.pais_declarado), c(v.stripe_pago), c(esPrueba(v) ? 'prueba' : 'real'), c(v.id)].join(';'));
  for (const v of devoluciones) filas.push([c('devolucion'), c(v.devuelta_en), c(v.producto), c(v.cantidad), '', '', '', '', '', '', n(v.devolucion_cent), c(v.pais_tarjeta), c(v.pais_declarado), c(v.stripe_pago), c(esPrueba(v) ? 'prueba' : 'real'), c(v.id)].join(';'));
  return '﻿' + filas.join('\r\n') + '\r\n'; // con BOM: Excel lo abre con tildes
}

// Prepara los correos del día (0, 1 o 2). Devuelve [{ asunto, texto, adjunto? }].
async function resumenesDeHoy(ahora = new Date()) {
  const correos = [];
  for (const p of periodosDeHoy(ahora)) {
    const { cobros, devoluciones } = await leerPeriodo(p.desde, p.hasta);
    const reales = cobros.filter(v => !esPrueba(v)), prueba = cobros.filter(esPrueba);
    const devReales = devoluciones.filter(v => !esPrueba(v)), devPrueba = devoluciones.filter(esPrueba);
    const partes = [
      `Ventas de Locus Mundi · ${p.nombre} (hora de Madrid). Fuente: tabla ventas de Supabase.`,
      '',
      bloque('REALES', reales, devReales),
    ];
    if (prueba.length || devPrueba.length) partes.push('', bloque('MODO DE PRUEBA DE STRIPE (no cuentan)', prueba, devPrueba));
    partes.push('', 'Detalle:', detalle(cobros, devoluciones), '',
      'Para cotejar: panel de Stripe → Informes → Conciliación de transferencias. El IVA lo calcula y lo factura Stripe (Link); aquí se anota lo que Stripe comunica.');
    const correo = {
      asunto: `Locus Mundi: ventas de ${p.tipo === 'semana' ? 'la ' + p.nombre : p.nombre} · ${eur(sumar(reales).total)}`,
      texto: partes.join('\n'),
    };
    if (p.tipo === 'mes') {
      const x = diaMadrid(p.desde);
      correo.adjunto = { nombre: `ventas-${x.a}-${String(x.m).padStart(2, '0')}.csv`, contenido: csv(cobros, devoluciones) };
    }
    correos.push(correo);
  }
  return correos;
}

module.exports = { resumenesDeHoy, periodosDeHoy, _csv: csv, _bloque: bloque };
