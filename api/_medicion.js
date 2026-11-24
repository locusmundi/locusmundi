// api/_medicion.js — Locus Mundi
// Versión 1 · 24/11/2026 · D14, medición por canal y lugar (consulta de marketing del 24/11).
// Suma 1 en la tabla de totales `medicion` (día, tipo, canal, país, provincia o región, ciudad), SIN unirla a
// ninguna cuenta y SIN guardar la IP: el lugar es el que Vercel deduce de la conexión (cabeceras
// x-vercel-ip-*), aproximado (en móvil suele salir la capital de provincia). Tipos: 'alta' (desde
// api/registro-lssi.js) y 'arbol' (descarga del Árbol, desde api/contador-historias.js). Es un módulo
// (guion bajo), no una función de Vercel. Nunca hace fallar a quien lo llama.

const CANAL_RE = /^[a-z0-9]{1,12}$/;

function cabecera(req, nombre, tope) {
  let v = String((req.headers && req.headers[nombre]) || '');
  try { v = decodeURIComponent(v); } catch (e) { /* se queda como venía */ }
  return v.replace(/[\u0000-\u001f]/g, '').trim().slice(0, tope);
}

function lugar(req) {
  return {
    pais: cabecera(req, 'x-vercel-ip-country', 2).toUpperCase(),
    region: cabecera(req, 'x-vercel-ip-country-region', 10).toUpperCase(),
    ciudad: cabecera(req, 'x-vercel-ip-city', 80),
  };
}

async function sumarMedicion(tipo, canal, req) {
  try {
    const url = process.env.SUPABASE_URL, llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !llave) return;
    const c = String(canal || '').toLowerCase();
    const l = lugar(req);
    const r = await fetch(`${url}/rest/v1/rpc/sumar_medicion`, {
      method: 'POST',
      headers: { apikey: llave, Authorization: `Bearer ${llave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_tipo: tipo, p_canal: CANAL_RE.test(c) ? c : '', p_pais: l.pais, p_region: l.region, p_ciudad: l.ciudad }),
    });
    if (!r.ok) console.error('medicion:', r.status, (await r.text()).slice(0, 200));
  } catch (e) { console.error('medicion:', e.message); }
}

module.exports = { sumarMedicion, lugar };
