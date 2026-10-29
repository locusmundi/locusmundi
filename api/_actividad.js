// api/_actividad.js — Locus Mundi
// Versión 1 · 29/10/2026 · Fase C, endurecimiento (seguimiento de la actividad). Continuidad, sesión «29/10/2026
// (endurecimiento, parte 9)», punto 10 (f), y sesión «29/10/2026 (seguimiento de la actividad)». Decisión de Javier:
// solo correo (sin pestaña en admin.html), diario siempre (también con todo a cero: así confirma que `diario`
// funcionó), importes en total cobrado con IVA y devoluciones aparte. Control interno, no contable.
// Lo llama api/diario.js cada noche: cifras de AYER (hora de Madrid) y el acumulado de hoy, sin cuentas +test ni
// ventas del modo de prueba de Stripe. Las cifras las calcula la función de Supabase public.actividad_dia(p_dia)
// (solo lee; solo service_role). Con guion bajo: es un módulo, no una función de Vercel.

const ZONA = 'Europe/Madrid';
const NOMBRES = { fotos: 'Fotos', asistente: 'Asistente', pdf: 'PDF', plan_familiar: 'Plan Familiar' };

// Día de ayer en Madrid, como 'AAAA-MM-DD'.
function ayerMadrid(ahora = new Date()) {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);
  const [a, m, d] = hoy.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d - 1)).toISOString().slice(0, 10);
}

const eur = c => ((c || 0) / 100).toFixed(2).replace('.', ',') + ' €';

function texto(c) {
  const [a, m, d] = c.dia.split('-').map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d, 12));
  const diaSemana = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', weekday: 'long' }).format(fecha);
  const mes = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', month: 'long' }).format(fecha);
  const compras = c.compras || [];
  const nCompras = compras.reduce((s, x) => s + x.n, 0);
  const total = compras.reduce((s, x) => s + (x.total_cent || 0), 0);
  const l = [
    `Actividad del ${diaSemana} ${d}/${m}/${a} (hora de Madrid). Sin cuentas +test ni ventas del modo de prueba de Stripe.`,
    '',
    'AYER',
    `Altas: ${c.altas}`,
    `Libros empezados: ${c.libros_empezados}`,
    `Primeras publicaciones: ${c.primeras_publicaciones}`,
    `Compras: ${nCompras} · ${eur(total)}`,
    ...compras.map(x => `  - ${NOMBRES[x.producto] || x.producto}: ${x.n} · ${eur(x.total_cent)}`),
    `Devoluciones: ${c.devoluciones.n} · ${eur(c.devoluciones.cent)}`,
    `Bajas: ${c.bajas}`,
  ];
  if (c.ventas_prueba) l.push(`(${c.ventas_prueba} compra(s) del modo de prueba de Stripe o de cuentas +test: no cuentan)`);
  l.push('', 'ACUMULADO (hoy)',
    `Autores: ${c.autores}`,
    `Con libro: ${c.autores_con_libro}`,
    `Con número de Autor: ${c.autores_con_numero}`,
    `Libros en la Biblioteca: ${c.biblioteca}`,
    `Ventas de ${mes}: ${c.mes_compras} · ${eur(c.mes_cobrado_cent)} · devuelto ${eur(c.mes_devuelto_cent)}`,
    '', 'Importes: total cobrado, con IVA. Control interno, no contable (para eso, el resumen semanal y mensual de ventas).');
  const asunto = `Locus Mundi: ayer (${d}/${m}) · altas ${c.altas} · publicaciones ${c.primeras_publicaciones} · compras ${nCompras}`;
  return { asunto, texto: l.join('\n') };
}

// Devuelve { asunto, texto } con la actividad de ayer.
async function resumenActividad(ahora = new Date()) {
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/actividad_dia`, {
    method: 'POST',
    headers: { apikey: llave, Authorization: `Bearer ${llave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_dia: ayerMadrid(ahora) }),
  });
  if (!r.ok) throw new Error(`actividad_dia: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return texto(await r.json());
}

module.exports = { resumenActividad, ayerMadrid, _texto: texto };
