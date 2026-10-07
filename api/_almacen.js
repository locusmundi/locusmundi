// api/_almacen.js — Locus Mundi
// Versión 1 · 06/10/2026 · Nuevo. Diseño de la moderación v6, §11.5 y §11.8.
// Archivo COMPARTIDO por api/moderar.js (v1) y api/foto-editor.js (v4): una sola regla para
// pasar de una dirección pública a su archivo del almacén y comprobar que es de la carpeta
// de un libro. Vercel no convierte en función un archivo de api/ que empieza por guion bajo.

const BUCKET = 'fotos';

// Dirección pública de un archivo → su ruta en el almacén ("autor/historia/archivo"),
// o null si no es de nuestro almacén. Se ignora lo que vaya tras "?" (el ?v= antiguo).
function rutaDeDireccion(direccion, supabaseUrl) {
  if (!direccion || typeof direccion !== 'string') return null;
  let u, base;
  try { u = new URL(direccion); base = new URL(supabaseUrl); } catch (_) { return null; }
  if (u.origin !== base.origin) return null;
  const prefijo = `/storage/v1/object/public/${BUCKET}/`;
  if (!u.pathname.startsWith(prefijo)) return null;
  let ruta;
  try { ruta = decodeURIComponent(u.pathname.slice(prefijo.length)); } catch (_) { return null; }
  if (!ruta || ruta.includes('..') || ruta.includes('//')) return null;
  return ruta;
}

// ¿Es un archivo de esa carpeta, sin subcarpetas? (carpeta = "autor/historia")
function rutaEnCarpeta(ruta, carpeta) {
  return !!ruta && ruta.startsWith(carpeta + '/') && !ruta.slice(carpeta.length + 1).includes('/');
}

function esDeLaCarpeta(direccion, carpeta, supabaseUrl) {
  return rutaEnCarpeta(rutaDeDireccion(direccion, supabaseUrl), carpeta);
}

// Dirección pública de una ruta. Sin ?v=: desde la v6 del diseño cada archivo es único.
function direccionPublica(ruta, supabaseUrl) {
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${ruta}`;
}

module.exports = { BUCKET, rutaDeDireccion, rutaEnCarpeta, esDeLaCarpeta, direccionPublica };
