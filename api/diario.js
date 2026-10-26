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

const purgar = require('./_purgar-borrados'); // v1.2
const { leerTexto } = require('./_r2');
const { avisar } = require('./_aviso');
const { limpiarPdf } = require('./pdf'); // v1.3
const pago = require('./pago'); // v1.4
const crearRegalos = require('./_regalo'); // v1.4

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
];

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
