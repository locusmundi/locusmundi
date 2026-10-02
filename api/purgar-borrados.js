// api/purgar-borrados.js — v2 · 02/10/2026
// Purga semanal (cron de vercel.json, domingos 03:00 UTC).
// Borra de verdad las historias marcadas como borradas hace más de 30 días.
// Para cada historia, por este orden:
//   1. Todos los archivos de su carpeta en Storage (autor_id/historia_id/):
//      portada, fotos, propuestas del editor (-propuesta) y cualquier resto.
//   2. La fila de `historias`. Sus filas de `fotos` y `traducciones_cache`
//      se borran solas (cascada, comprobado en vivo el 02/10/2026).
// Si algo falla en una historia, se la salta: sigue marcada y se reintenta
// el domingo siguiente. Nunca se borra la fila sin haber vaciado antes su
// carpeta, porque la ruta de la carpeta sale de esa fila.
// `admin_log` ya no bloquea: su enlace con `historias` se quitó el 02/10/2026.

const BUCKET = "fotos";
const DIAS_MARGEN = 30;
const MAX_HISTORIAS_POR_PASADA = 50; // el resto, el domingo siguiente
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async function handler(req, res) {
  const auth = req.headers["authorization"] || "";
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || "https://olpfybpykuascwltnqtv.supabase.co";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    res.status(500).json({ error: "CONFIGURACION" });
    return;
  }
  const cabeceras = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json"
  };

  const limite = new Date(Date.now() - DIAS_MARGEN * 24 * 60 * 60 * 1000).toISOString();
  const resultado = { ok: true, purgadas: 0, archivos_borrados: 0, fallidas: [], quedan_mas: false };

  // Lista los archivos de una carpeta (rutas completas). Las subcarpetas
  // (id nulo) también se devuelven, para que la comprobación final las vea.
  async function listarCarpeta(carpeta) {
    const rutas = [];
    let offset = 0;
    while (true) {
      const r = await fetch(`${supabaseUrl}/storage/v1/object/list/${BUCKET}`, {
        method: "POST",
        headers: cabeceras,
        body: JSON.stringify({ prefix: carpeta, limit: 1000, offset })
      });
      if (!r.ok) throw new Error(`listar: ${r.status} ${await r.text()}`);
      const items = await r.json();
      for (const it of items) rutas.push({ ruta: `${carpeta}/${it.name}`, esCarpeta: it.id === null });
      if (items.length < 1000) break;
      offset += 1000;
    }
    return rutas;
  }

  try {
    // 1. Historias candidatas (sin borrar nada todavía).
    const q = await fetch(
      `${supabaseUrl}/rest/v1/historias?select=id,autor_id` +
        `&marcado_borrado=eq.true&fecha_marcado_borrado=lt.${encodeURIComponent(limite)}` +
        `&order=fecha_marcado_borrado.asc&limit=${MAX_HISTORIAS_POR_PASADA + 1}`,
      { headers: cabeceras }
    );
    if (!q.ok) {
      res.status(500).json({ error: `buscar: ${await q.text()}` });
      return;
    }
    let historias = await q.json();
    if (historias.length > MAX_HISTORIAS_POR_PASADA) {
      resultado.quedan_mas = true;
      historias = historias.slice(0, MAX_HISTORIAS_POR_PASADA);
    }

    // 2. Una por una.
    for (const h of historias) {
      try {
        // Seguridad: sin dos identificadores válidos no se toca Storage
        // (una carpeta vacía o mal formada podría apuntar a todo el bucket).
        if (!UUID.test(String(h.id)) || !UUID.test(String(h.autor_id))) {
          throw new Error("identificadores no válidos");
        }
        const carpeta = `${h.autor_id}/${h.id}`;

        // 2a. Borrar los archivos de la carpeta, de 100 en 100.
        const contenido = await listarCarpeta(carpeta);
        const archivos = contenido.filter((x) => !x.esCarpeta).map((x) => x.ruta);
        for (const ruta of archivos) {
          if (!ruta.startsWith(carpeta + "/")) throw new Error(`ruta fuera de la carpeta: ${ruta}`);
        }
        for (let i = 0; i < archivos.length; i += 100) {
          const d = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}`, {
            method: "DELETE",
            headers: cabeceras,
            body: JSON.stringify({ prefixes: archivos.slice(i, i + 100) })
          });
          if (!d.ok) throw new Error(`borrar archivos: ${d.status} ${await d.text()}`);
        }

        // 2b. Comprobar que la carpeta ha quedado vacía.
        const resto = await listarCarpeta(carpeta);
        if (resto.length > 0) throw new Error(`la carpeta no ha quedado vacía (${resto.length})`);

        // 2c. Borrar la fila (solo si sigue marcada). Cascada: fotos y traducciones.
        const b = await fetch(
          `${supabaseUrl}/rest/v1/historias?id=eq.${h.id}&marcado_borrado=eq.true`,
          { method: "DELETE", headers: { ...cabeceras, Prefer: "return=representation" } }
        );
        if (!b.ok) throw new Error(`borrar fila: ${b.status} ${await b.text()}`);
        const borradas = await b.json();
        if (borradas.length !== 1) throw new Error("la fila ya no estaba marcada");

        resultado.purgadas += 1;
        resultado.archivos_borrados += archivos.length;
      } catch (e) {
        console.error(`purgar-borrados: historia ${h.id}: ${e.message}`);
        resultado.fallidas.push({ historia_id: h.id, error: e.message });
      }
    }

    console.log(`purgar-borrados: ${JSON.stringify(resultado)}`);
    res.status(200).json(resultado);
  } catch (e) {
    console.error(`purgar-borrados: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
};

module.exports.config = { maxDuration: 60 };
