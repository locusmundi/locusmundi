// api/diario.js — Locus Mundi
// Versión 1 · 17/10/2026 · Fase B2, punto 19 (b). Continuidad, sesión "17/10/2026 (conversación 5)".
// Tarea diaria (vercel.json, 03:00 UTC). El plan Hobby de Vercel solo admite 2 tareas programadas:
// esta sustituye a la purga semanal y hace dos cosas:
//  1. La purga (api/_purgar-borrados.js, sin cambios; ejecutarla a diario no cambia nada: solo
//     borra lo marcado hace más de 30 días).
//  2. El vigía: comprueba que los modelos de Google siguen existiendo (consulta gratuita, no gasta
//     nada), que Supabase responde, que la web carga y que la última copia de R2 tiene menos de
//     8 días. Si algo falla, avisa por correo; cada lunes manda además un "todo bien", para saber
//     que el propio vigía sigue vivo.
// Versión 1.1 · 17/10/2026 · Punto 19 (c): los modelos se leen de api/_modelos.js, y el vigía
// avisa también si a un modelo de texto le falta su precio.
// Versión 1.2 · 19/10/2026 · Conversación 12 (punto 14): la purga pasa a api/_purgar-borrados.js
// (con guion bajo deja de contar como función; el plan Hobby de Vercel admite 12). Sin más cambios.
// Versión 1.3 · 19/10/2026 · Conversación 12 (punto 14): borra los PDF de más de 24 horas del almacén
// privado `pdf` (api/pdf.js, limpiarPdf): sin copias permanentes que purgar ni respaldar.
// Versión 1.4 · 24/10/2026 · Fase C (conversación C2-2): Plan Familiar. Recordatorios al destinatario (al mes y
// 15 días antes del plazo; este, también a quien regala), devolución al vencer el plazo (importe menos la
// comisión) y borrado de los regalos de pagos no hechos. Lógica en api/_regalo.js.
// Versión 1.5 · 26/10/2026 · Fase C (limpieza). (a) Plazos de conservación (Privacidad y Registro de
// actividades): IP de registro_lssi, un año tras la baja; alegaciones (avisos_moderacion) y denuncias, dos
// años; compras (ventas) y regalos, seis años. (b) El vigía cuenta los avisos de «Creo que es un error» y las
// denuncias sin resolver; si alguno lleva más de 7 días, cuenta como fallo (correo diario hasta resolverlo).
// Versión 1.6 · 27/10/2026 · Fase C, endurecimiento parte 3 (E3). (a) Plazos: errores, 30 días; supresiones,
// 40 días (más que los 35 de las copias: mientras exista una copia con el libro, se sabe que hay que volver a
// borrarlo al restaurarla). (b) El vigía cuenta los fallos del navegador de las últimas 24 h (tabla `errores`,
// api/contador-historias.js v8) y da los 3 más repetidos; 10 o más cuentan como fallo.
// Versión 1.7 · 27/10/2026 · E3: copia diaria de la tabla `supresiones` en R2 (supresiones.json). Si se pierde
// Supabase entero, la lista de lo borrado sigue fuera y se puede volver a borrar tras restaurar (Mapa, §7).
// Versión 1.8 · 28/10/2026 · Endurecimiento, parte 6: resúmenes de ventas por correo (api/_ventas.js), cada
// lunes (semana anterior) y cada día 1 (mes anterior, con CSV). Decisión de Javier, 28/10.
// Versión 1.9 · 29/10/2026 · Seguimiento de la actividad (api/_actividad.js): correo diario «Locus Mundi: ayer»
// (altas, libros empezados, primeras publicaciones, compras, devoluciones, bajas y acumulado), todos los días,
// aunque esté todo a cero. Si no se puede preparar o enviar, cuenta como fallo del vigía.
// Versión 1.12 · 31/10/2026 · «Más leídos» (Continuidad, sesión «31/10/2026 (gasto de IA, «más leídos» y Alex)», punto 3):
// paso «Lecturas», avisa si un libro suma más de 200 lecturas en un día (función lecturas_del_dia, que guarda la foto del día).
// Versión 1.11 · 31/10/2026 · Cuentas vacías: archivos borrados y carpetas sin Autor en el informe (_cuentas.js v1.1).
// Versión 1.10 · 31/10/2026 · Condición de lanzamiento n.º 3 (Lista, pendiente q): cuentas vacías (api/_cuentas.js):
// sin historia, aviso a los 6 meses y borrado de la cuenta 3 meses después. Si alguna falla, cuenta como fallo.

const purgar = require('./_purgar-borrados'); // v1.2
const { leerTexto, subir } = require('./_r2'); // subir: v1.7
const { avisar } = require('./_aviso');
const { limpiarPdf } = require('./pdf'); // v1.3
const pago = require('./pago'); // v1.4
const crearRegalos = require('./_regalo'); // v1.4
const { resumenesDeHoy } = require('./_ventas'); // v1.8
const { resumenActividad } = require('./_actividad'); // v1.9
const { cuentasVacias } = require('./_cuentas'); // v1.10

const { modelosEnUso, modelosSinPrecio } = require('./_modelos'); // v1.1
const MODELOS = modelosEnUso();
const WEB = 'https://locusmundi.vercel.app/';
const DIAS_MAXIMOS_COPIA = 8;
const DIAS_MAXIMOS_PENDIENTE = 7; // v1.5
const DIA = 86400000;
// v1.5: tabla, columna de fecha y días que se conserva cada fila.
const PLAZOS = [
  ['registro_lssi', 'baja_en', 365],
  ['avisos_moderacion', 'fecha', 730],
  ['denuncias', 'recibida_en', 730],
  ['ventas', 'creado_en', 2192],
  ['regalos', 'creado_en', 2192],
  ['errores', 'fecha', 30], // v1.6
  ['supresiones', 'purgado_en', 40], // v1.6
];
const ERRORES_MAXIMOS_24H = 10; // v1.6
const LECTURAS_MAXIMAS_DIA = 200; // v1.12: más, en un libro y un día, es sospechoso (orden «Más leídos»)

function supa(ruta, opciones = {}) {
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return fetch(`${process.env.SUPABASE_URL}/rest/v1/${ruta}`, {
    ...opciones,
    headers: { apikey: llave, Authorization: `Bearer ${llave}`, ...(opciones.headers || {}) },
  });
}

async function ejecutarPurga(req) {
  return new Promise((resolver) => {
    const res = {
      codigo: 200,
      status(c) { this.codigo = c; return this; },
      json(datos) { resolver({ codigo: this.codigo, datos }); },
    };
    purgar(req, res).catch((e) => resolver({ codigo: 500, datos: { error: e.message } }));
  });
}

module.exports = async function handler(req, res) {
  const auth = req.headers['authorization'];
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const fallos = [];
  const bien = [];
  const comprobar = async (nombre, prueba) => {
    try {
      const detalle = await prueba();
      bien.push(detalle ? `${nombre}: ${detalle}` : nombre);
    } catch (e) {
      fallos.push(`${nombre}: ${e.message}`);
    }
  };

  // 1. Purga.
  await comprobar('Purga', async () => {
    const r = await ejecutarPurga(req);
    if (r.codigo !== 200) throw new Error(JSON.stringify(r.datos));
    if (r.datos.fallidas && r.datos.fallidas.length) throw new Error(`fallidas: ${JSON.stringify(r.datos.fallidas)}`);
    return `${r.datos.purgadas} historias purgadas`;
  });

  // 1 bis. PDF de más de 24 horas (v1.3).
  await comprobar('PDF caducados', async () => `${await limpiarPdf()} borrados`);

  // 1 ter. Regalos del Plan Familiar (v1.4). Sin clave de Stripe no se puede devolver: se salta.
  await comprobar('Regalos', async () => {
    if (!process.env.STRIPE_SECRET_KEY) return 'sin Stripe, no se revisan';
    const c = await crearRegalos(pago._util).diario();
    if (c.fallos.length) throw new Error(`fallidos: ${c.fallos.join('; ')}`);
    return `${c.recordatorios} recordatorios, ${c.avisos} avisos, ${c.devueltos} devueltos, ${c.borrados} sin pagar borrados`;
  });

  // 1 ter bis. Cuentas vacías (v1.10): aviso a los 6 meses sin historia; borrado 3 meses después.
  await comprobar('Cuentas vacías', async () => {
    const c = await cuentasVacias();
    const texto = `${c.vacias} sin historia, ${c.avisadas} avisadas, ${c.borradas} borradas, ${c.reactivadas} con historia de nuevo`
      + (c.con_tinta ? `, ${c.con_tinta} de ellas con tinta` : '') + (c.pendientes ? `, ${c.pendientes} para mañana` : '')
      + (c.huerfanas ? `, ${c.huerfanas} carpetas sin Autor vaciadas` : '') + (c.archivos ? `, ${c.archivos} archivos borrados` : ''); // v1.11
    if (c.fallos.length) throw new Error(`${texto}; fallidas: ${c.fallos.join('; ')}`);
    return texto;
  });

  // 1 quater. Plazos de conservación (v1.5).
  await comprobar('Plazos de conservación', async () => {
    const partes = [];
    for (const [tabla, col, dias] of PLAZOS) {
      const limite = new Date(Date.now() - dias * DIA).toISOString();
      const r = await supa(`${tabla}?${col}=lt.${encodeURIComponent(limite)}&select=id`, {
        method: 'DELETE',
        headers: { Prefer: 'return=representation' },
      });
      if (!r.ok) throw new Error(`${tabla}: ${r.status} ${(await r.text()).slice(0, 200)}`);
      partes.push(`${tabla} ${(await r.json()).length}`);
    }
    return partes.join(', ');
  });

  // 1 quinquies. Avisos y denuncias sin resolver (v1.5).
  for (const [nombre, ruta, col] of [
    ['Avisos pendientes', 'avisos_moderacion?estado=eq.pendiente', 'fecha'],
    ['Denuncias pendientes', 'denuncias?estado=eq.recibida', 'recibida_en'],
  ]) {
    await comprobar(nombre, async () => {
      const r = await supa(`${ruta}&select=${col}&order=${col}.asc`);
      if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
      const filas = await r.json();
      if (!filas.length) return '0';
      const dias = Math.floor((Date.now() - new Date(filas[0][col]).getTime()) / DIA);
      const texto = `${filas.length}, el más antiguo de hace ${dias} días`;
      if (dias > DIAS_MAXIMOS_PENDIENTE) throw new Error(`${texto} (revisar en Supabase o admin.html)`);
      return texto;
    });
  }

  // 1 septies. Lista de borrados, también fuera de Supabase (v1.7).
  await comprobar('Lista de borrados en R2', async () => {
    const r = await supa('supresiones?select=historia_id,autor_id,purgado_en&order=purgado_en.asc');
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
    const filas = await r.json();
    await subir('supresiones.json', JSON.stringify({ fecha: new Date().toISOString(), filas }), 'application/json');
    return `${filas.length}`;
  });

  // 1 sexies. Fallos del navegador en las últimas 24 h (v1.6).
  // 2 bis. Lecturas (v1.12): un libro con muchas lecturas en un día puede estar inflando «Más leídos».
  await comprobar('Lecturas', async () => {
    const r = await supa('rpc/lecturas_del_dia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_umbral: LECTURAS_MAXIMAS_DIA }) });
    if (!r.ok) throw new Error(`lecturas_del_dia: ${r.status} ${(await r.text()).slice(0, 200)}`);
    const filas = await r.json();
    if (filas.length) throw new Error(`más de ${LECTURAS_MAXIMAS_DIA} en un día (¿lecturas infladas en «Más leídos»?): ` + filas.map(f => `«${f.titulo || f.historia_id}» +${f.nuevas}`).join('; '));
    return `ningún libro con más de ${LECTURAS_MAXIMAS_DIA} en un día`;
  });

  await comprobar('Errores en 24 h', async () => {
    const desde = new Date(Date.now() - DIA).toISOString();
    const r = await supa(`errores?fecha=gt.${encodeURIComponent(desde)}&select=mensaje&limit=1000`);
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
    const filas = await r.json();
    if (!filas.length) return '0';
    const veces = {};
    for (const f of filas) veces[f.mensaje] = (veces[f.mensaje] || 0) + 1;
    const top = Object.entries(veces).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([m, n]) => `${n}× ${m.slice(0, 150)}`).join(' | ');
    const texto = `${filas.length} (${top})`;
    if (filas.length >= ERRORES_MAXIMOS_24H) throw new Error(`${texto} (ver tabla errores en Supabase)`);
    return texto;
  });

  // 2. Modelos de Google (solo consulta si existen; no genera nada ni cuesta).
  for (const modelo of MODELOS) {
    await comprobar(`Modelo ${modelo}`, async () => {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}`, {
        headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY },
      });
      if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
    });
  }

  await comprobar('Precios de los modelos', async () => {
    const sin = modelosSinPrecio();
    if (sin.length) throw new Error(`falta el precio de ${sin.join(', ')} en api/_modelos.js`);
  });

  // 3. Supabase.
  await comprobar('Supabase', async () => {
    const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/publicaciones?select=historia_id&limit=1`, {
      headers: { apikey: llave, Authorization: `Bearer ${llave}` },
    });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
  });

  // 4. La web.
  await comprobar('Web', async () => {
    const r = await fetch(WEB);
    if (!r.ok) throw new Error(`${r.status}`);
    if (!(await r.text()).includes('Locus Mundi')) throw new Error('la página no es la de Locus Mundi');
  });

  // 5. Última copia.
  await comprobar('Copia de seguridad', async () => {
    const texto = await leerTexto('ultima-copia.json');
    if (!texto) throw new Error('no hay ninguna copia completa en R2');
    const copia = JSON.parse(texto);
    const dias = (Date.now() - new Date(copia.fecha).getTime()) / 86400000;
    if (dias > DIAS_MAXIMOS_COPIA) throw new Error(`la última copia completa es del ${copia.fecha}`);
    return `${copia.fecha}, ${copia.fotos} fotos`;
  });

  // 5 bis. Resúmenes de ventas (v1.8): los lunes, la semana anterior; el día 1, el mes anterior (con CSV).
  // Correos aparte del vigía: llegan aunque haya fallos. Si no se pueden preparar o enviar, cuenta como fallo.
  await comprobar('Resumen de ventas', async () => {
    const correos = await resumenesDeHoy();
    for (const c of correos) await avisar(c.asunto, c.texto, c.adjunto);
    return correos.length ? `${correos.length} enviado(s)` : 'hoy no toca';
  });

  // 5 ter. Actividad de ayer (v1.9): un correo cada día, aparte del vigía.
  await comprobar('Actividad de ayer', async () => {
    const c = await resumenActividad();
    await avisar(c.asunto, c.texto);
    return 'enviada';
  });

  // 6. Aviso.
  const hoy = new Date();
  try {
    if (fallos.length) {
      await avisar(
        `Locus Mundi: el vigía ha encontrado ${fallos.length} problema(s)`,
        `Revisión del ${hoy.toISOString().slice(0, 10)}.\n\nFALLA:\n- ${fallos.join('\n- ')}\n\nFunciona:\n- ${bien.join('\n- ')}`
      );
    } else if (hoy.getUTCDay() === 1) {
      await avisar('Locus Mundi: todo bien esta semana', `Revisión del ${hoy.toISOString().slice(0, 10)}.\n\n- ${bien.join('\n- ')}`);
    }
  } catch (e) {
    console.error(`diario: no se pudo avisar: ${e.message}`);
    fallos.push(`Aviso por correo: ${e.message}`);
  }

  const resultado = { ok: fallos.length === 0, fallos, bien };
  console.log(`diario: ${JSON.stringify(resultado)}`);
  return res.status(fallos.length ? 500 : 200).json(resultado);
};

module.exports.config = { maxDuration: 60 };
