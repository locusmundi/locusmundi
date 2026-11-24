// api/_actividad.js — Locus Mundi
// Versión 4 · 24/11/2026 · D14: bloque «POR CANAL Y LUGAR (ayer)»: visitas por canal (visitas_canal), altas y Árboles
// descargados por canal y por lugar (tabla de totales anónima `medicion`). Desde el 24/11; antes no hay datos.
// Versión 3 · 05/11/2026 · Árbol genealógico, paso final: «Árboles en libros» (imágenes del árbol vistas por la
// revisión ese día) y su acumulado (libros distintos); actividad_dia: arboles_en_libros y libros_con_arbol.
// Versión 2 · 05/11/2026 · Fase C, «Árbol genealógico, construcción II»: línea «Árboles descargados» (ayer) y su
// acumulado (actividad_dia: arbol_descargas y arbol_descargas_total; tabla arbol_descargas).
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

// v4: «fb 3 · tt 1»; vacío → «—». Sin canal = «sin etiqueta».
function porClave(filas, clave) {
  const t = {};
  for (const f of filas || []) { const k = f[clave] || ''; t[k] = (t[k] || 0) + (f.total || 0); }
  const partes = Object.entries(t).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k || 'sin etiqueta'} ${n}`);
  return partes.length ? partes.join(' · ') : '—';
}
function porLugar(filas) {
  const t = {};
  for (const f of filas || []) {
    const k = [f.ciudad, f.region && `(${f.region})`, f.pais && f.pais !== 'ES' ? f.pais : ''].filter(Boolean).join(' ') || 'lugar desconocido';
    t[k] = (t[k] || 0) + (f.total || 0);
  }
  const partes = Object.entries(t).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k} ${n}`);
  return partes.length ? partes.join(' · ') : '—';
}

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
    `Árboles descargados: ${c.arbol_descargas || 0}`, // v2
    `Árboles subidos a un libro: ${c.arboles_en_libros || 0}`, // v3
  ];
  if (c.medicion) { // v4
    const m = c.medicion, altas = m.filas.filter(f => f.tipo === 'alta'), arboles = m.filas.filter(f => f.tipo === 'arbol');
    l.push('', 'POR CANAL Y LUGAR (ayer)',
      `Visitas con etiqueta: ${porClave(m.visitas, 'canal')}`,
      `Altas por canal: ${porClave(altas, 'canal')}`,
      `Altas por lugar: ${porLugar(altas)}`,
      `Árboles por canal: ${porClave(arboles, 'canal')}`,
      `Árboles por lugar: ${porLugar(arboles)}`,
      '(Lugar aproximado, por la conexión: en móvil suele salir la capital de provincia. Canal: solo si llegó con etiqueta en esa misma visita.)');
  }
  if (c.ventas_prueba) l.push(`(${c.ventas_prueba} compra(s) del modo de prueba de Stripe o de cuentas +test: no cuentan)`);
  l.push('', 'ACUMULADO (hoy)',
    `Autores: ${c.autores}`,
    `Con libro: ${c.autores_con_libro}`,
    `Con número de Autor: ${c.autores_con_numero}`,
    `Libros en la Biblioteca: ${c.biblioteca}`,
    `Árboles descargados: ${c.arbol_descargas_total || 0}`, // v2
    `Libros con un árbol: ${c.libros_con_arbol || 0}`, // v3
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
  const datos = await r.json();
  try { // v4: si falla, el correo sale igual, sin el bloque
    const h = { apikey: llave, Authorization: `Bearer ${llave}` };
    const base = process.env.SUPABASE_URL, dia = datos.dia || ayerMadrid(ahora);
    const [v, m] = await Promise.all([
      fetch(`${base}/rest/v1/visitas_canal?dia=eq.${dia}&select=canal,total`, { headers: h }),
      fetch(`${base}/rest/v1/medicion?dia=eq.${dia}&select=tipo,canal,pais,region,ciudad,total`, { headers: h }),
    ]);
    if (v.ok && m.ok) datos.medicion = { visitas: await v.json(), filas: await m.json() };
  } catch (e) { console.error('actividad (medicion):', e.message); }
  return texto(datos);
}

module.exports = { resumenActividad, ayerMadrid, _texto: texto };
