// api/_cuentas.js — Locus Mundi
// Versión 1 · 31/10/2026 · Fase C, condición de lanzamiento n.º 3 (Lista, pendiente q). Continuidad, sesión
// "31/10/2026 (gasto de IA, «más leídos» y Alex)", punto 4 quater. Lo llama api/diario.js (v1.10) cada día.
// Cuentas vacías: una cuenta sin ninguna historia (ni siquiera un borrador) recibe, a los 6 meses, un correo
// (castellano e inglés) con 3 meses de prórroga; si sigue sin historia, se borra. Cuenta desde el alta o, si
// el Autor eliminó su historia, desde ese día. Cualquier historia sin eliminar mantiene viva la cuenta.
// Necesita dos columnas en `autores` (cambio propuesto, sin aplicar): `vacia_desde` y `aviso_vacia_en`.
// Al borrar la cuenta (Supabase Auth), caen en cascada `autores` e `historias`; el disparador
// `autores_registro_lssi_baja` anota la baja; `ventas` no está unida a `autores` y se conserva.
// Si queda tinta del Asistente, el aviso dice cuánta y que se pierde al borrar la cuenta (decisión de
// Javier, 31/10: la tinta no caduca mientras haya una historia; va también a las Condiciones).
// Versión 1.1 · 31/10/2026 · Lista 9.3 en real: al borrar la cuenta, sus archivos se quedaban en el almacén
// `fotos` (la historia cae en cascada y la purga ya no la encuentra). Ahora: (1) antes de borrar la cuenta se
// vacía su carpeta `<autor_id>/` (si falla, la cuenta no se borra y se reintenta mañana); (2) barrido diario de
// carpetas cuyo Autor ya no existe (también las de cuentas borradas a mano), comprobando cada una otra vez.

const { enviarCorreo } = require('./_aviso');

const MESES_AVISO = 6;
const MESES_PRORROGA = 3;
const MAXIMO_POR_DIA = 40; // correos y borrados por pasada (límite de Resend y de los 60 s de diario)
const WEB = 'https://www.locusmundi.com';
const BUCKET = 'fotos';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAXIMO_CARPETAS_HUERFANAS = 20; // por pasada; el resto, al día siguiente

function supa(ruta, opciones = {}) {
  if (!process.env.SUPABASE_URL) throw new Error('CONFIGURACION_INCOMPLETA');
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return fetch(`${process.env.SUPABASE_URL}${ruta}`, {
    ...opciones,
    headers: { apikey: llave, Authorization: `Bearer ${llave}`, 'Content-Type': 'application/json', ...(opciones.headers || {}) },
  });
}
async function leer(ruta) {
  const r = await supa(`/rest/v1/${ruta}`);
  if (!r.ok) throw new Error(`${ruta.split('?')[0]}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
async function cambiar(id, campos) {
  const r = await supa(`/rest/v1/autores?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(campos) });
  if (!r.ok) throw new Error(`autores ${id}: ${r.status} ${(await r.text()).slice(0, 200)}`);
}

// Archivos (rutas completas) bajo una carpeta del almacén, bajando por las subcarpetas.
async function listar(prefijo) {
  const rutas = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await supa(`/storage/v1/object/list/${BUCKET}`, { method: 'POST', body: JSON.stringify({ prefix: prefijo, limit: 1000, offset }) });
    if (!r.ok) throw new Error(`listar ${prefijo || '(raíz)'}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    const items = await r.json();
    for (const it of items) {
      const ruta = prefijo ? `${prefijo}/${it.name}` : it.name;
      if (it.id === null) { if (prefijo) rutas.push(...await listar(ruta)); else rutas.push({ carpeta: ruta }); }
      else rutas.push(ruta);
    }
    if (items.length < 1000) return rutas;
  }
}
// Vacía la carpeta de un Autor. Devuelve cuántos archivos borró; lanza si no queda vacía.
async function vaciarCarpeta(autorId) {
  if (!UUID.test(String(autorId))) throw new Error('identificador no válido');
  const archivos = await listar(autorId);
  for (const ruta of archivos) if (!ruta.startsWith(autorId + '/')) throw new Error(`ruta fuera de la carpeta: ${ruta}`);
  for (let i = 0; i < archivos.length; i += 100) {
    const d = await supa(`/storage/v1/object/${BUCKET}`, { method: 'DELETE', body: JSON.stringify({ prefixes: archivos.slice(i, i + 100) }) });
    if (!d.ok) throw new Error(`borrar archivos: ${d.status} ${(await d.text()).slice(0, 200)}`);
  }
  if ((await listar(autorId)).length) throw new Error('la carpeta no ha quedado vacía');
  return archivos.length;
}

// Suma meses de calendario (31/08 + 6 → 28/02 o 29/02).
function sumarMeses(fecha, n) {
  const d = new Date(fecha);
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return d;
}
const fechaLarga = (f, en) => new Date(f).toLocaleDateString(en ? 'en-GB' : 'es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' });

function correoAviso(plazo, tinta = 0) {
  const es = fechaLarga(plazo, false), en = fechaLarga(plazo, true);
  const t = Number(tinta) > 0 ? Number(tinta) : 0;
  const tES = t.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const tEN = '€' + t.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const asunto = 'Tu cuenta de Locus Mundi / Your Locus Mundi account';
  const ES = [
    'Hola:',
    'Hace más de seis meses que tu cuenta de Locus Mundi no tiene ninguna historia, ni siquiera un borrador.',
    `Si no empiezas una antes del ${es}, borraremos la cuenta y sus datos. Para conservarla, basta con entrar y empezar a escribir: cualquier borrador la mantiene.`,
    ...(t ? [`Te quedan ${tES} de tinta del Asistente; si se borra la cuenta, se pierden.`] : []),
    'Si prefieres que la borremos ya, responde a este correo.',
  ];
  const EN = [
    'Hello,',
    'For more than six months your Locus Mundi account has had no story in it, not even a draft.',
    `If you don't start one before ${en}, we will delete the account and its data. To keep it, just sign in and start writing: any draft keeps it open.`,
    ...(t ? [`You have ${tEN} of Assistant ink left; if the account is deleted, it will be lost.`] : []),
    'If you would rather we delete it now, reply to this email.',
  ];
  const texto = [...ES, '', ...EN, '', WEB, '', 'Locus Mundi'].join('\n\n').replace(/\n{3,}/g, '\n\n');
  const p = (s) => `<p style="margin:0 0 1em">${s}</p>`;
  const html = `<div style="font-family:Georgia,serif;font-size:16px;line-height:1.5;color:#222;max-width:560px">`
    + ES.map(p).join('') + '<hr style="border:0;border-top:1px solid #ccc;margin:1.5em 0">'
    + `<div lang="en">${EN.map(p).join('')}</div>`
    + p(`<a href="${WEB}" style="color:#222">www.locusmundi.com</a>`) + p('Locus Mundi') + '</div>';
  return { asunto, texto, html };
}

// Una pasada. Devuelve las cifras para el informe del vigía; lanza si algo falla.
async function cuentasVacias({ ahora = Date.now() } = {}) {
  const hoy = new Date(ahora);
  const autores = await leer('autores?select=id,email,created_at,tinta_euros,vacia_desde,aviso_vacia_en');
  const historias = await leer('historias?select=autor_id,marcado_borrado,fecha_marcado_borrado');
  const supresiones = await leer('supresiones?select=autor_id,purgado_en');

  const vivas = new Set(historias.filter(h => !h.marcado_borrado).map(h => h.autor_id));
  const ultimoBorrado = {};
  const anotar = (id, f) => { if (id && f && (!ultimoBorrado[id] || f > ultimoBorrado[id])) ultimoBorrado[id] = f; };
  for (const h of historias) if (h.marcado_borrado) anotar(h.autor_id, h.fecha_marcado_borrado);
  for (const s of supresiones) anotar(s.autor_id, s.purgado_en);

  const c = { vacias: 0, reactivadas: 0, avisadas: 0, borradas: 0, con_tinta: 0, pendientes: 0, huerfanas: 0, archivos: 0, fallos: [] };
  let gastadas = 0;
  for (const a of autores) {
    try {
      if (vivas.has(a.id)) {
        if (a.vacia_desde || a.aviso_vacia_en) { await cambiar(a.id, { vacia_desde: null, aviso_vacia_en: null }); c.reactivadas++; }
        continue;
      }
      c.vacias++;
      let desde = a.vacia_desde;
      if (!desde) {
        const borrado = ultimoBorrado[a.id];
        desde = borrado && new Date(borrado) > new Date(a.created_at) ? borrado : a.created_at;
        await cambiar(a.id, { vacia_desde: desde });
      }
      if (Number(a.tinta_euros) > 0) c.con_tinta++;
      if (!a.aviso_vacia_en) {
        if (sumarMeses(desde, MESES_AVISO) > hoy) continue;
        if (gastadas >= MAXIMO_POR_DIA) { c.pendientes++; continue; }
        gastadas++;
        const plazo = sumarMeses(hoy, MESES_PRORROGA);
        await enviarCorreo({ para: a.email, de: 'cuentas', ...correoAviso(plazo, a.tinta_euros) });
        await cambiar(a.id, { aviso_vacia_en: hoy.toISOString() });
        c.avisadas++;
      } else if (sumarMeses(a.aviso_vacia_en, MESES_PRORROGA) <= hoy) {
        if (gastadas >= MAXIMO_POR_DIA) { c.pendientes++; continue; }
        gastadas++;
        // Comprobación de última hora: si ha empezado una historia en estos segundos, no se borra.
        const suyas = await leer(`historias?autor_id=eq.${a.id}&marcado_borrado=eq.false&select=id&limit=1`);
        if (suyas.length) continue;
        c.archivos += await vaciarCarpeta(a.id); // v1.1: primero sus archivos; si falla, la cuenta sigue
        const r = await supa(`/auth/v1/admin/users/${a.id}`, { method: 'DELETE' });
        if (!r.ok && r.status !== 404) throw new Error(`borrar: ${r.status} ${(await r.text()).slice(0, 200)}`);
        c.borradas++;
      }
    } catch (e) {
      c.fallos.push(`${a.email}: ${e.message}`);
    }
  }

  // v1.1: carpetas del almacén cuyo Autor ya no existe. Nunca con la lista de Autores vacía, y cada una se
  // comprueba otra vez justo antes (por si alguien se ha dado de alta en estos segundos).
  if (autores.length) {
    const conocidos = new Set(autores.map(a => a.id));
    const carpetas = (await listar('')).filter(x => x.carpeta && UUID.test(x.carpeta) && !conocidos.has(x.carpeta)).map(x => x.carpeta);
    for (const id of carpetas.slice(0, MAXIMO_CARPETAS_HUERFANAS)) {
      try {
        if ((await leer(`autores?id=eq.${id}&select=id`)).length) continue;
        c.archivos += await vaciarCarpeta(id);
        c.huerfanas++;
      } catch (e) {
        c.fallos.push(`carpeta ${id}: ${e.message}`);
      }
    }
  }
  return c;
}

module.exports = { cuentasVacias, utiles: { sumarMeses, MAXIMO_CARPETAS_HUERFANAS, correoAviso, MESES_AVISO, MESES_PRORROGA, MAXIMO_POR_DIA } };
