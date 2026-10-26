// api/backup-semanal.js — Locus Mundi
// Versión 3 · 17/10/2026 · Fase B2, punto 6. Continuidad, sesión "17/10/2026 (conversación 5)".
// Cambios respecto a la v2:
//  - La copia va a Cloudflare R2 (locusmundi-copias, UE), no a GitHub: allí una regla borra cada
//    objeto a los 35 días de verdad (en GitHub seguía en el historial). Resuelve la caducidad.
//  - Copia también fotos (tabla y archivos), autores, registro_lssi y admin_log.
//  - Lee por páginas de 1.000 filas (antes se quedaba en 1.000 sin avisar).
//  - Si algo falla, no marca la copia como buena y avisa por correo.
// Estructura en R2: copia-AAAA-MM-DD/tablas/<tabla>.json, copia-AAAA-MM-DD/fotos/<ruta original>,
// copia-AAAA-MM-DD/fin.json (resumen) y ultima-copia.json (solo si la copia está completa; lo lee
// el vigía, api/diario.js).
// Versión 3.1 · 26/10/2026 · Fase C (limpieza): copia también denuncias, avisos_moderacion, ventas y regalos.
// Límite conocido: con el tiempo máximo de 60 s, unas 1.500 fotos por pasada. Si no le da tiempo,
// la copia queda incompleta y avisa (revisar con Vercel Pro o copia incremental).

const { subir } = require('./_r2');
const { avisar } = require('./_aviso');

const TABLAS = {
  historias: 'id',
  publicaciones: 'historia_id',
  fotos: 'id',
  autores: 'id',
  registro_lssi: 'id',
  admin_log: 'id',
  denuncias: 'id', // v3.1
  avisos_moderacion: 'id', // v3.1
  ventas: 'id', // v3.1
  regalos: 'id', // v3.1
};
const BUCKET_FOTOS = 'fotos';
const TIEMPO_MAXIMO_MS = 45000;
const EN_PARALELO = 5;

module.exports = async function handler(req, res) {
  const auth = req.headers['authorization'];
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const inicio = Date.now();
  const url = process.env.SUPABASE_URL;
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cab = { apikey: llave, Authorization: `Bearer ${llave}`, 'Content-Type': 'application/json' };
  const hoy = new Date().toISOString().slice(0, 10);
  const carpeta = `copia-${hoy}`;
  const resumen = { fecha: hoy, tablas: {}, fotos: 0, mb_fotos: 0, completa: false };

  try {
    if (!url || !llave) throw new Error('faltan las variables de Supabase');

    // 1. Tablas, por páginas.
    for (const [tabla, orden] of Object.entries(TABLAS)) {
      const filas = [];
      for (let desde = 0; ; desde += 1000) {
        const r = await fetch(`${url}/rest/v1/${tabla}?select=*&order=${orden}.asc&limit=1000&offset=${desde}`, { headers: cab });
        if (!r.ok) throw new Error(`leer ${tabla}: ${r.status} ${await r.text()}`);
        const pagina = await r.json();
        filas.push(...pagina);
        if (pagina.length < 1000) break;
      }
      await subir(`${carpeta}/tablas/${tabla}.json`, JSON.stringify(filas), 'application/json');
      resumen.tablas[tabla] = filas.length;
    }

    // 2. Lista de todos los archivos del almacén de fotos (las carpetas tienen id nulo).
    async function listar(prefijo) {
      const rutas = [];
      for (let desde = 0; ; desde += 1000) {
        const r = await fetch(`${url}/storage/v1/object/list/${BUCKET_FOTOS}`, {
          method: 'POST',
          headers: cab,
          body: JSON.stringify({ prefix: prefijo, limit: 1000, offset: desde }),
        });
        if (!r.ok) throw new Error(`listar fotos: ${r.status} ${await r.text()}`);
        const items = await r.json();
        for (const it of items) {
          const ruta = prefijo ? `${prefijo}/${it.name}` : it.name;
          if (it.id === null) rutas.push(...(await listar(ruta)));
          else rutas.push(ruta);
        }
        if (items.length < 1000) break;
      }
      return rutas;
    }
    const archivos = await listar('');

    // 3. Copiar cada archivo, de 5 en 5, vigilando el tiempo.
    for (let i = 0; i < archivos.length; i += EN_PARALELO) {
      if (Date.now() - inicio > TIEMPO_MAXIMO_MS) {
        throw new Error(`sin tiempo: copiadas ${resumen.fotos} de ${archivos.length} fotos`);
      }
      await Promise.all(
        archivos.slice(i, i + EN_PARALELO).map(async (ruta) => {
          const d = await fetch(`${url}/storage/v1/object/${BUCKET_FOTOS}/${ruta.split('/').map(encodeURIComponent).join('/')}`, { headers: cab });
          if (!d.ok) throw new Error(`descargar ${ruta}: ${d.status}`);
          const datos = Buffer.from(await d.arrayBuffer());
          await subir(`${carpeta}/fotos/${ruta}`, datos, d.headers.get('content-type') || 'application/octet-stream');
          resumen.fotos += 1;
          resumen.mb_fotos += datos.length / 1048576;
        })
      );
    }
    resumen.mb_fotos = Math.round(resumen.mb_fotos * 10) / 10;

    // 4. Cierre: la copia solo cuenta como buena si llega aquí.
    resumen.completa = true;
    resumen.segundos = Math.round((Date.now() - inicio) / 1000);
    await subir(`${carpeta}/fin.json`, JSON.stringify(resumen), 'application/json');
    await subir('ultima-copia.json', JSON.stringify(resumen), 'application/json');

    console.log(`backup-semanal: ${JSON.stringify(resumen)}`);
    return res.status(200).json(resumen);
  } catch (e) {
    console.error(`backup-semanal: ${e.message}`);
    try {
      await avisar(
        'Locus Mundi: la copia semanal ha fallado',
        `La copia del ${hoy} no se ha completado.\n\nMotivo: ${e.message}\n\nResumen: ${JSON.stringify(resumen)}`
      );
    } catch (e2) {
      console.error(`backup-semanal: tampoco se pudo avisar: ${e2.message}`);
    }
    return res.status(500).json({ error: e.message, resumen });
  }
};

module.exports.config = { maxDuration: 60 };
