// api/_r2.js — Locus Mundi
// Versión 1 · 17/10/2026 · Fase B2, puntos 6 y 19 (b). Continuidad, sesión "17/10/2026 (conversación 5)".
// Acceso al almacén de copias de Cloudflare R2 (locusmundi-copias, jurisdicción UE), sin librerías:
// cada petición se firma con las llaves R2_ACCESS_KEY_ID y R2_SECRET_ACCESS_KEY (firma AWS v4,
// que es la que usa R2). El guion bajo hace que Vercel no lo publique como función.
// Caducidad: una regla de R2 ("caducidad-35-dias") borra sola todo objeto a los 35 días.

const crypto = require('crypto');

const CUENTA = '58a6f5dc2d335a20af2e5f754dcd3f44';
const HOST = `${CUENTA}.eu.r2.cloudflarestorage.com`;
const BUCKET = 'locusmundi-copias';

function sha256hex(datos) {
  return crypto.createHash('sha256').update(datos).digest('hex');
}
function hmac(llave, datos) {
  return crypto.createHmac('sha256', llave).update(datos).digest();
}
function codificar(segmento) {
  return encodeURIComponent(segmento).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

async function peticion(metodo, clave, cuerpo, tipo) {
  const id = process.env.R2_ACCESS_KEY_ID;
  const secreta = process.env.R2_SECRET_ACCESS_KEY;
  if (!id || !secreta) throw new Error('R2: faltan las llaves en Vercel');

  const body = cuerpo == null ? Buffer.alloc(0) : Buffer.isBuffer(cuerpo) ? cuerpo : Buffer.from(cuerpo);
  const amzFecha = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''); // AAAAMMDDTHHMMSSZ
  const dia = amzFecha.slice(0, 8);
  const ruta = '/' + BUCKET + '/' + clave.split('/').map(codificar).join('/');
  const hashCuerpo = sha256hex(body);

  const cab = { host: HOST, 'x-amz-content-sha256': hashCuerpo, 'x-amz-date': amzFecha };
  if (tipo) cab['content-type'] = tipo;
  const nombres = Object.keys(cab).sort();
  const firmadas = nombres.join(';');
  const canonica = [metodo, ruta, '', nombres.map((n) => `${n}:${cab[n]}\n`).join(''), firmadas, hashCuerpo].join('\n');
  const ambito = `${dia}/auto/s3/aws4_request`;
  const aFirmar = ['AWS4-HMAC-SHA256', amzFecha, ambito, sha256hex(canonica)].join('\n');
  let llave = hmac('AWS4' + secreta, dia);
  llave = hmac(llave, 'auto');
  llave = hmac(llave, 's3');
  llave = hmac(llave, 'aws4_request');
  const firma = crypto.createHmac('sha256', llave).update(aFirmar).digest('hex');

  const headers = { ...cab };
  delete headers.host; // lo pone fetch, con el mismo valor
  headers.Authorization = `AWS4-HMAC-SHA256 Credential=${id}/${ambito}, SignedHeaders=${firmadas}, Signature=${firma}`;
  return fetch(`https://${HOST}${ruta}`, { method: metodo, headers, body: metodo === 'PUT' ? body : undefined });
}

// Guarda un objeto. Lanza un error si R2 no lo acepta.
async function subir(clave, cuerpo, tipo) {
  const r = await peticion('PUT', clave, cuerpo, tipo || 'application/octet-stream');
  if (!r.ok) throw new Error(`R2 subir ${clave}: ${r.status} ${await r.text()}`);
}

// Lee un objeto como texto; null si no existe.
async function leerTexto(clave) {
  const r = await peticion('GET', clave);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`R2 leer ${clave}: ${r.status} ${await r.text()}`);
  return r.text();
}

module.exports = { subir, leerTexto, BUCKET };
