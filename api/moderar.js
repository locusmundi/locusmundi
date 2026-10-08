// api/moderar.js — Locus Mundi
// Versión 2 · 08/10/2026 · Segunda subida: la moderación con IA. Sustituye a la v1 (sin IA).
// Diseño: LOCUS_MUNDI_DISENO_MODERACION.md v10, §4, §5, §6, §7, §11.4 a §11.6, §11.13 y §11.14.
// Cambios respecto a la v1:
//   - "subir" revisa con IA (Flash-Lite, a cargo de la plataforma) el texto y la cabecera
//     (título, subtítulo, nombre, ciudad, profesión, concepto y pies de las fotos colocadas).
//     Cada tramo conserva su veredicto por su huella y la versión del criterio (tabla
//     veredictos_tramo): un tramo sin cambios no se vuelve a mandar a la IA (§11.13, punto 6).
//   - Resultado: publicado; pasajes (con la lista); límite duro (con la lista, sin atajo);
//     veredicto de conjunto (sin lista: 3 o más capítulos ¶ con pasajes, o 10 o más pasajes;
//     §6.1 y §11.13, punto 4). El último resultado queda en la tabla moderaciones.
//   - Solo se publican las fotos COLOCADAS en el texto (§11.13, punto 7), con la regla de la
//     lectura (api/_tramos.js v2).
//   - Las imágenes publicadas que no han pasado la revisión (anteriores a esta versión, o
//     cargadas por el index.html antiguo) se revisan al subir (§5.2).
//   - Límites (§7): 5 subidas al día que necesiten revisión; fusible diario de 5 €.
//   - Si la revisión de un libro largo no cabe en una llamada, se responde REVISION_EN_CURSO
//     y el navegador vuelve a llamar: lo ya revisado queda guardado.
//   - Operaciones nuevas: revisarImagen (al cargar una foto o la portada; el servidor apunta la
//     dirección y cuenta la carga), consultar, error (texto) y errorImagen.
//   - La limpieza respeta los archivos con un "Creo que es un error" de imagen sin decidir.
//   - Una imagen con "Creo que es un error" aceptado por Javier pasa sin IA (revisarImagen), y
//     consultar devuelve los avisos de imagen para que el editor ofrezca usarla.
//
// Operaciones (POST, JSON, todas con token de sesión):
//   subir        {historia_id}
//   consultar    {historia_id}
//   error        {historia_id, pasaje_id, explicacion}
//   revisarImagen{objetivo:"foto", fotoId, ruta} | {objetivo:"portada", historiaId, ruta}
//   errorImagen  {objetivo, fotoId|historiaId, ruta, explicacion}
//
// Variables de entorno (Vercel): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY.

const crypto = require('crypto');
const { huellasVigentes, tramosConCapitulo, fotosColocadas } = require('./_tramos'); // compartido
const almacen = require('./_almacen');      // compartido con api/foto-editor.js
const mod = require('./_moderacion');       // compartido con api/foto-editor.js

// ─── Constantes ─────────────────────────────────────────────────────────

const BUCKET = almacen.BUCKET;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MARGEN_LIMPIEZA_MS = 60 * 60 * 1000; // una hora (§11.4)

// Versión del criterio (§11.13, punto 6). Cambiarla obliga a revisar de nuevo todos los
// tramos en la siguiente subida de cada libro. Cambiarla SIEMPRE que cambien las
// instrucciones de la IA de más abajo.
const VERSION_CRITERIO = 'texto-2026-10-08';

const TIPOS = ['duro', 'tercero', 'menor', 'colectivo', 'sexual'];
const UMBRAL_CAPITULOS = 3;  // §6.1
const UMBRAL_PASAJES = 10;   // §6.1
const MAX_EXPLICACION = 300; // "Creo que es un error": una frase

// Una llamada no puede durar más de 60 s (config, abajo): pasado este tiempo no se empieza
// ninguna revisión nueva y se responde REVISION_EN_CURSO.
const PRESUPUESTO_MS = 35 * 1000;
const REVISIONES_A_LA_VEZ = 6;

// Decisión 9: lo único del contenido del editor que se copia a lo publicado.
const CAMPOS_PUBLICADOS = [
  'name', 'born', 'country', 'lang', 'title', 'subtitle', 'text',
  'pubCity', 'pubProfession', 'pubConcept'
];

// Campos de texto libre publicados que se revisan como "cabecera" (con los pies de foto).
const CAMPOS_CABECERA = [
  ['title', 'Title'], ['subtitle', 'Subtitle'], ['name', 'Author name'],
  ['pubCity', 'City'], ['pubProfession', 'Profession'], ['pubConcept', 'Concept']
];

const IDIOMAS = {
  ES: 'Spanish', CA: 'Catalan', GL: 'Galician', EU: 'Basque', EN: 'English', FR: 'French',
  DE: 'German', IT: 'Italian', 'PT-BR': 'Brazilian Portuguese', 'PT-PT': 'European Portuguese',
  PT: 'Portuguese', NL: 'Dutch', PL: 'Polish', RO: 'Romanian', RU: 'Russian', AR: 'Arabic',
  ZH: 'Chinese', JA: 'Japanese', KO: 'Korean', HI: 'Hindi'
};

// ─── Instrucciones de la IA (criterio de §4.4; §11.4 y §11.13, punto 8) ──

function instruccionesTexto(idioma) {
  const lengua = IDIOMAS[idioma] || 'the language of the text';
  return [
    'You review one fragment of an autobiography before it is published in an open online library.',
    `The book is written in ${lengua}. The author is the narrator ("I"). Apply ONLY the criteria below.`,
    '',
    'HARD LIMIT (type "duro"):',
    '1. Sexual content involving minors. Telling that one suffered abuse as a child IS allowed, as long as it contains no sexual detail.',
    '2. Inciting violence against people or groups, or praising such violence.',
    '',
    'FLAG, passage by passage:',
    '- "tercero": serious private facts about ANOTHER living, identifiable person: attributing to them a crime or seriously reprehensible conduct with no public record; their physical or mental health; their sexuality or intimate life; their addictions; their ethnic origin, religious beliefs or political opinions.',
    '- "menor": any private fact about an identifiable person who is a minor TODAY (not an adult remembered as a child).',
    '- "colectivo": offensive or discriminatory language against a group of people, EXCEPT historical testimony (how people spoke in another era, or what someone said, quoted as such).',
    '- "sexual": explicit sexual description of anyone. The topic is fine; the graphic detail is not.',
    '',
    'DO NOT FLAG:',
    '- Anything about the author themself (except the hard limit).',
    '- What another person did to the author, told as the author\'s own experience ("My husband cheated on me and I left home"). Do flag private matters of others that the author did not live.',
    '- Public facts, including harsh criticism.',
    '- Ordinary private matters of shared life: quarrels, estrangement, character.',
    '- Deceased people (except the hard limit).',
    '- Whether the story is true, its literary quality, spelling or format.',
    '',
    'PRACTICAL RULES:',
    '- Identifiable: anyone with a name, or with a family relationship to the author ("my brother-in-law"), because the book is signed.',
    '- Living: presume the person is alive unless the text makes clear they have died.',
    '- When in doubt, do not flag.',
    '- Lines starting with ¶ or § are chapter and section titles; lines like [FOTO 2] are technical marks.',
    '',
    'OUTPUT: JSON {"pasajes": [ {"cita": "...", "tipo": "...", "motivo_es": "...", "motivo_en": "..."} ]}.',
    '- "cita": copy EXACTLY, character by character, the complete sentence or sentences that contain the problem, as they appear in the fragment. Never part of a sentence. Never rewrite it.',
    '- "tipo": one of "duro", "tercero", "menor", "colectivo", "sexual".',
    '- "motivo_es" and "motivo_en": one plain sentence, in Spanish and in English, saying why, without legal jargon and without repeating the quote. Example: "Atribuye un delito a una persona viva con nombre y apellidos." / "It attributes a crime to a living person named in full."',
    '- Do not suggest any rewording.',
    '- If nothing must be flagged: {"pasajes": []}.'
  ].join('\n');
}

const ESQUEMA_TEXTO = {
  type: 'OBJECT',
  properties: {
    pasajes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          cita: { type: 'STRING' },
          tipo: { type: 'STRING', enum: TIPOS },
          motivo_es: { type: 'STRING' },
          motivo_en: { type: 'STRING' }
        },
        required: ['cita', 'tipo', 'motivo_es', 'motivo_en']
      }
    }
  },
  required: ['pasajes']
};

// Si Google se niega a revisar un fragmento, el fragmento entero cuenta como límite duro: no
// puede publicarse algo que no se ha podido revisar. Texto pendiente de aprobar por Javier.
const MOTIVO_BLOQUEO_ES = 'No hemos podido revisar esta parte del libro porque contiene algo que nuestro sistema no admite. Revísala, suprime lo que no pueda publicarse y vuelve a subir el libro.';
const MOTIVO_BLOQUEO_EN = 'We could not review this part of the book because it contains something our system does not accept. Please review it, remove what cannot be published and upload the book again.';

// ─── Supabase (REST, sin librerías) ─────────────────────────────────────

const SUPA_URL = () => process.env.SUPABASE_URL;
const cabeceras = mod.cabeceras;
const leer = mod.leerFilas;
const insertar = mod.insertarFila;

async function autorDeLaSesion(token) {
  if (!token || typeof token !== 'string') return null;
  const r = await fetch(`${SUPA_URL()}/auth/v1/user`, {
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` }
  });
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  return u && u.id ? u.id : null;
}

async function actualizar(ruta, datos, representacion) {
  const r = await fetch(`${SUPA_URL()}/rest/v1/${ruta}`, {
    method: 'PATCH',
    headers: cabeceras({ Prefer: representacion ? 'return=representation' : 'return=minimal' }),
    body: JSON.stringify(datos)
  });
  if (!r.ok) throw new Error(`actualizar ${ruta.split('?')[0]}: ${r.status} ${await r.text()}`);
  return representacion ? r.json() : null;
}

async function guardarFila(tabla, fila, conflicto) {
  const r = await fetch(`${SUPA_URL()}/rest/v1/${tabla}?on_conflict=${conflicto}`, {
    method: 'POST',
    headers: cabeceras({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(fila)
  });
  if (!r.ok) throw new Error(`guardar ${tabla}: ${r.status} ${await r.text()}`);
}

// Historia del Autor, viva. null si no existe, no es suya o está marcada para eliminar.
async function historiaDelAutor(historiaId, autorId, columnas) {
  if (!UUID.test(String(historiaId || ''))) return null;
  const h = (await leer(`historias?id=eq.${historiaId}&select=id,autor_id,marcado_borrado,${columnas}&limit=1`))[0];
  if (!h || h.autor_id !== autorId || h.marcado_borrado === true || !UUID.test(String(h.autor_id))) return null;
  return h;
}

// ─── Almacén ────────────────────────────────────────────────────────────

const rutaDeDireccion = d => almacen.rutaDeDireccion(d, SUPA_URL());
const esDeLaCarpeta = (d, carpeta) => almacen.esDeLaCarpeta(d, carpeta, SUPA_URL());
const direccionPublica = ruta => almacen.direccionPublica(ruta, SUPA_URL());
const rutaCodificada = ruta => ruta.split('/').map(encodeURIComponent).join('/');

async function descargar(ruta) {
  const r = await fetch(`${SUPA_URL()}/storage/v1/object/${BUCKET}/${rutaCodificada(ruta)}`, { headers: cabeceras() });
  if (!r.ok) return null;
  const buffer = Buffer.from(await r.arrayBuffer());
  const tipo = mod.tipoDeImagen(buffer);
  return tipo ? { buffer, tipo } : null;
}

async function borrarArchivos(rutas) {
  for (let i = 0; i < rutas.length; i += 100) {
    const d = await fetch(`${SUPA_URL()}/storage/v1/object/${BUCKET}`, {
      method: 'DELETE',
      headers: cabeceras(),
      body: JSON.stringify({ prefixes: rutas.slice(i, i + 100) })
    });
    if (!d.ok) throw new Error(`borrar: ${d.status} ${await d.text()}`);
  }
}

// ─── Unidades que se revisan: tramos y cabecera ─────────────────────────

const huellaModeracion = (tipo, texto) =>
  crypto.createHash('sha256').update('moderacion-' + tipo + '\n' + texto, 'utf8').digest('hex');

function unidadesDe(contenido, fotosPub) {
  const unidades = tramosConCapitulo(contenido.text).map((t, i) => ({
    clave: 't' + i, clase: 'tramo', texto: t.texto, capitulo: t.capitulo,
    tituloCapitulo: t.tituloCapitulo, huella: huellaModeracion('tramo', t.texto)
  }));
  // Cabecera: una línea por campo no vacío; los pies, por foto colocada.
  const lineas = [];
  const campos = {};
  for (const [k, etiqueta] of CAMPOS_CABECERA) {
    const v = String(contenido[k] || '').trim();
    if (v) { lineas.push(`${etiqueta}: ${v}`); campos[k] = v; }
  }
  for (const f of fotosPub) {
    const pie = String(f.pie_foto || '').trim();
    if (pie) { lineas.push(`Photo ${f.orden} caption: ${pie}`); campos['pie:' + f.id] = pie; }
  }
  if (lineas.length) {
    const texto = lineas.join('\n');
    unidades.push({ clave: 'c', clase: 'cabecera', texto, campos, capitulo: null, tituloCapitulo: '',
      huella: huellaModeracion('cabecera', texto) });
  }
  return unidades;
}

const normalizar = s => String(s || '').replace(/\s+/g, ' ').trim();

// Pasajes válidos de una respuesta de la IA: tipo conocido y cita que aparece TAL CUAL en el
// fragmento (si no, no se podría marcar en el editor y se descarta; §11.4).
function pasajesValidos(json, unidad) {
  const lista = (json && Array.isArray(json.pasajes)) ? json.pasajes : null;
  if (!lista) return null;
  const vistos = new Set();
  const out = [];
  for (const p of lista) {
    if (!p || !TIPOS.includes(p.tipo)) continue;
    let cita = String(p.cita || '').trim();
    if (unidad.clase === 'cabecera') {
      // En la cabecera, la cita debe estar dentro de UN campo; si la IA ha copiado también la
      // etiqueta de la línea ("Title: …"), se quita.
      const enUnCampo = x => Object.values(unidad.campos).some(v => v.includes(x));
      if (!enUnCampo(cita)) cita = cita.replace(/^(Title|Subtitle|Author name|City|Profession|Concept|Photo \d+ caption):\s*/, '');
      if (!enUnCampo(cita)) continue;
    }
    if (cita.length < 2 || !unidad.texto.includes(cita) || vistos.has(cita)) continue;
    vistos.add(cita);
    out.push({
      cita, tipo: p.tipo,
      motivo_es: String(p.motivo_es || '').trim().slice(0, 400),
      motivo_en: String(p.motivo_en || '').trim().slice(0, 400)
    });
  }
  return out;
}

// Revisa una unidad. Devuelve { pasajes, coste } o lanza si no se ha podido (no es veredicto).
async function revisarUnidad(unidad, idioma) {
  let coste = 0;
  for (let intento = 0; intento < 2; intento++) {
    const r = await mod.llamarGeminiJson({
      modelo: mod.MODELO_MODERACION,
      sistema: instruccionesTexto(idioma),
      partes: [{ text: unidad.clase === 'cabecera'
        ? 'Book header and photo captions (each line is a separate field):\n\n' + unidad.texto
        : unidad.texto }],
      esquema: ESQUEMA_TEXTO
    });
    coste += r.coste;
    if (r.bloqueo) {
      return { coste, pasajes: [{ cita: '', tipo: 'duro', bloqueado: true, motivo_es: MOTIVO_BLOQUEO_ES, motivo_en: MOTIVO_BLOQUEO_EN }] };
    }
    const pasajes = pasajesValidos(r.json, unidad);
    if (pasajes) return { pasajes, coste };
    console.error('moderar: respuesta de texto ilegible; intento', intento + 1);
  }
  const e = new Error('REVISION_TEXTO_FALLIDA');
  e.coste = coste;
  throw e;
}

// Ejecuta tareas de pocas en pocas, sin empezar ninguna nueva pasado el plazo.
async function enParalelo(items, n, plazo, fn) {
  let i = 0;
  const hechos = [];
  const fallos = [];
  async function trabajador() {
    while (i < items.length && Date.now() < plazo) {
      const item = items[i++];
      try { hechos.push(await fn(item)); } catch (e) { fallos.push({ item, error: e }); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, trabajador));
  return { hechos, fallos, quedan: items.length - hechos.length - fallos.length };
}

// ─── Subir ──────────────────────────────────────────────────────────────

async function subir(body, autorId, ip, res) {
  const inicio = Date.now();
  const plazo = inicio + PRESUPUESTO_MS;

  // 1 y 2. Lo que el Autor escribe, leído aquí (nunca lo que envíe el navegador).
  const h = await historiaDelAutor(body.historia_id, autorId,
    'titulo,contenido,portada_url,portada_revisada,idioma_original');
  if (!h) return res.status(404).json({ error: 'NO_ENCONTRADA' });
  const c = h.contenido || {};
  if (!String(c.name || '').trim() || !String(c.text || '').trim() || !String(c.country || '').trim()) {
    return res.status(400).json({ error: 'FALTAN_DATOS' });
  }
  const idioma = String(h.idioma_original || c.lang || 'ES').toUpperCase();

  // Fotos: solo las colocadas en el texto (§11.13, punto 7).
  const colocadas = fotosColocadas(c.text);
  const fotosPub = (await leer(
    `fotos?historia_id=eq.${h.id}&url=not.is.null&select=id,orden,url,pie_foto,imagen_revisada`
  )).filter(f => colocadas.has(String(f.orden)))
    .sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));

  // 3. Direcciones: solo de nuestro almacén y de la carpeta de este libro.
  const carpeta = `${h.autor_id}/${h.id}`;
  if (h.portada_url && !esDeLaCarpeta(h.portada_url, carpeta)) {
    return res.status(400).json({ error: 'DIRECCION_NO_VALIDA', que: 'portada' });
  }
  for (const f of fotosPub) {
    if (!esDeLaCarpeta(f.url, carpeta)) {
      return res.status(400).json({ error: 'DIRECCION_NO_VALIDA', que: 'foto', orden: f.orden });
    }
  }

  // 4. Qué falta por revisar: imágenes sin revisar y unidades de texto sin veredicto.
  const imagenesPendientes = [];
  if (h.portada_url && h.portada_revisada !== h.portada_url) imagenesPendientes.push({ que: 'portada', url: h.portada_url });
  for (const f of fotosPub) if (f.imagen_revisada !== f.url) imagenesPendientes.push({ que: 'foto', foto: f, url: f.url });

  const unidades = unidadesDe(c, fotosPub);
  const huellas = [...new Set(unidades.map(u => u.huella))];
  const guardados = new Map();
  for (let i = 0; i < huellas.length; i += 40) {
    const lote = huellas.slice(i, i + 40);
    const filas = await leer(
      `veredictos_tramo?historia_id=eq.${h.id}&version_criterio=eq.${VERSION_CRITERIO}` +
      `&huella=in.(${lote.join(',')})&select=huella,pasajes`
    );
    filas.forEach(f => guardados.set(f.huella, f.pasajes || []));
  }
  const pendientes = [];
  const yaPendiente = new Set();
  for (const u of unidades) {
    if (!guardados.has(u.huella) && !yaPendiente.has(u.huella)) { pendientes.push(u); yaPendiente.add(u.huella); }
  }
  const hayQueRevisar = pendientes.length > 0 || imagenesPendientes.length > 0;

  // 5. Límites (§7), solo si hay algo que revisar (volver a publicar sin cambios no cuenta).
  // Una llamada que sigue a un REVISION_EN_CURSO de este libro es la misma subida: no cuenta.
  let continuacion = false;
  if (hayQueRevisar) {
    const ultima = (await leer(
      `registro_gasto?servicio=eq.subida&historia_id=eq.${h.id}&fecha=gte.${mod.inicioDeHoy()}` +
      `&select=detalle&order=fecha.desc&limit=1`
    ))[0];
    continuacion = !!(ultima && ultima.detalle && ultima.detalle.en_curso === true);
    if (!continuacion && await mod.subidasRevisadasHoy(autorId) >= mod.LIMITE_SUBIDAS_DIA) {
      return res.status(429).json({ error: 'LIMITE_DIARIO' });
    }
    if (await mod.fusibleSaltado()) {
      await mod.avisarFusible(autorId, h.id);
      return res.status(503).json({ error: 'FUSIBLE' });
    }
  }
  const anotarSubida = (detalle) => mod.anotarGasto('subida', autorId, h.id, 0, {
    version: 'moderar v2', revisada: hayQueRevisar && !continuacion, continuacion, ...detalle
  });

  // 6. Imágenes sin revisar (§5.2): la portada y las fotos colocadas.
  const imgs = await enParalelo(imagenesPendientes, 3, plazo, async (p) => {
    const ruta = rutaDeDireccion(p.url);
    const img = ruta && await descargar(ruta);
    if (!img) return { p, categoria: 'ilegible', coste: 0 };
    let r;
    try { r = await mod.revisarImagen(img); }
    catch (e) { await mod.anotarGasto('moderacion_imagen', autorId, h.id, e.coste || 0, { origen: 'subir', ruta, fallo: true }); throw e; }
    await mod.anotarGasto('moderacion_imagen', autorId, h.id, r.coste, { origen: 'subir', ruta, categoria: r.categoria, bloqueo: r.bloqueo });
    if (r.categoria === 'ok') {
      if (p.que === 'portada') await actualizar(`historias?id=eq.${h.id}&portada_url=eq.${encodeURIComponent(p.url)}`, { portada_revisada: p.url });
      else await actualizar(`fotos?id=eq.${p.foto.id}&url=eq.${encodeURIComponent(p.url)}`, { imagen_revisada: p.url });
    }
    return { p, categoria: r.categoria };
  });
  const rechazada = imgs.hechos.find(x => x.categoria !== 'ok');
  if (rechazada) {
    await anotarSubida({ resultado: 'imagen', categoria: rechazada.categoria });
    return res.status(422).json({
      error: 'IMAGEN_RECHAZADA', que: rechazada.p.que,
      orden: rechazada.p.foto ? rechazada.p.foto.orden : null, categoria: rechazada.categoria
    });
  }
  if (imgs.fallos.length) {
    console.error('moderar: revisión de imagen fallida', imgs.fallos.map(f => f.error.message));
    return res.status(503).json({ error: 'REVISION_NO_DISPONIBLE' });
  }

  // 7. Texto: solo las unidades sin veredicto guardado (§11.13, punto 6).
  const txt = await enParalelo(pendientes, REVISIONES_A_LA_VEZ, plazo, async (u) => {
    let r;
    try { r = await revisarUnidad(u, idioma); }
    catch (e) { await mod.anotarGasto('moderacion_texto', autorId, h.id, e.coste || 0, { huella: u.huella, fallo: true }); throw e; }
    await mod.anotarGasto('moderacion_texto', autorId, h.id, r.coste, { huella: u.huella, pasajes: r.pasajes.length });
    await guardarFila('veredictos_tramo', {
      historia_id: h.id, huella: u.huella, version_criterio: VERSION_CRITERIO,
      pasajes: r.pasajes, fecha: new Date().toISOString()
    }, 'historia_id,huella,version_criterio');
    guardados.set(u.huella, r.pasajes);
    return u;
  });
  if (txt.fallos.length) {
    console.error('moderar: revisión de texto fallida', txt.fallos.map(f => f.error.message));
    await anotarSubida({ resultado: 'fallo', en_curso: true });
    return res.status(503).json({ error: 'REVISION_NO_DISPONIBLE' });
  }
  if (txt.quedan > 0 || imgs.quedan > 0) {
    await anotarSubida({ resultado: 'en_curso', en_curso: true });
    return res.status(202).json({
      estado: 'REVISION_EN_CURSO',
      revisadas: unidades.length - txt.quedan, total: unidades.length
    });
  }

  // 8. Pasajes de todo el libro, menos las frases a las que Javier ha dado la razón.
  const aceptadas = new Set((await leer(
    `avisos_moderacion?historia_id=eq.${h.id}&tipo=eq.error_texto&estado=eq.aceptado&select=cita`
  )).map(a => normalizar(a.cita)));
  const pasajes = [];
  for (const u of unidades) {
    for (const p of guardados.get(u.huella) || []) {
      if (p.cita && aceptadas.has(normalizar(p.cita))) continue;
      const pasaje = {
        id: crypto.createHash('sha256').update(u.huella + '|' + (p.cita || '*')).digest('hex').slice(0, 16),
        huella: u.huella, clase: u.clase, capitulo: u.capitulo, tituloCapitulo: u.tituloCapitulo,
        cita: p.cita, tipo: p.tipo, motivo_es: p.motivo_es, motivo_en: p.motivo_en
      };
      if (p.bloqueado) { pasaje.bloqueado = true; if (u.clase === 'tramo') pasaje.inicio = u.texto.slice(0, 120); }
      if (u.clase === 'cabecera' && p.cita) {
        pasaje.campo = Object.keys(u.campos).find(k => u.campos[k].includes(p.cita)) || null;
      }
      if (!pasajes.some(x => x.id === pasaje.id)) pasajes.push(pasaje);
    }
  }

  // 9. Veredicto (§6.1 y §11.13, punto 4): no cuentan el límite duro ni la cabecera como capítulo.
  if (pasajes.length) {
    const delicados = pasajes.filter(p => p.tipo !== 'duro');
    const capitulos = new Set(delicados.filter(p => p.capitulo !== null).map(p => p.capitulo));
    const resultado = (capitulos.size >= UMBRAL_CAPITULOS || delicados.length >= UMBRAL_PASAJES) ? 'conjunto'
      : pasajes.some(p => p.tipo === 'duro') ? 'limite_duro' : 'pasajes';
    await guardarFila('moderaciones', {
      historia_id: h.id, fecha: new Date().toISOString(), resultado, pasajes, aviso_enviado_en: null
    }, 'historia_id');
    await anotarSubida({ resultado, pasajes: pasajes.length });
    if (resultado === 'conjunto') {
      return res.status(200).json({ ok: false, resultado, total: pasajes.length });
    }
    return res.status(200).json({ ok: false, resultado, pasajes: pasajes.map(pasajePublico) });
  }

  // 10. La copia: lista cerrada de campos y solo las fotos colocadas.
  const contenido = {};
  for (const k of CAMPOS_PUBLICADOS) if (c[k] !== undefined) contenido[k] = c[k];
  contenido.fotos = fotosPub.map(f => ({ id: f.id, orden: f.orden, url: f.url, pie_foto: f.pie_foto || '' }));

  // 11. Publicar de una sola vez (bloquea el libro; todo o nada).
  const r = await fetch(`${SUPA_URL()}/rest/v1/rpc/publicar_historia`, {
    method: 'POST',
    headers: cabeceras(),
    body: JSON.stringify({
      p_historia_id: h.id, p_autor_id: autorId, p_titulo: String(h.titulo || ''),
      p_contenido: contenido, p_portada_url: h.portada_url || null, p_idioma_original: idioma
    })
  });
  if (!r.ok) {
    const texto = await r.text();
    console.error('moderar: publicar_historia', r.status, texto);
    if (/HISTORIA_NO_ENCONTRADA|NO_ES_DEL_AUTOR|HISTORIA_ELIMINADA/.test(texto)) {
      return res.status(404).json({ error: 'NO_ENCONTRADA' });
    }
    return res.status(500).json({ error: 'ERROR' });
  }
  const publicado = await r.json();

  // 12. Anotaciones. Un fallo aquí no deshace la publicación.
  try {
    await guardarFila('moderaciones', {
      historia_id: h.id, fecha: new Date().toISOString(), resultado: 'publicado', pasajes: [], aviso_enviado_en: null
    }, 'historia_id');
  } catch (e) { console.error('moderar: moderaciones', e.message); }
  await anotarSubida({ resultado: 'publicado', nueva: !!publicado.nueva });
  try {
    await insertar('registro_lssi', { autor_id: autorId, accion: 'publicacion', ip });
  } catch (e) { console.error('moderar: registro_lssi', e.message); }

  // 13. Limpieza (nunca tumba la subida).
  await limpiar(h.id, carpeta);

  return res.status(200).json({
    ok: true,
    nueva: !!publicado.nueva,
    fecha_publicacion: publicado.fecha_publicacion,
    fecha_actualizacion: publicado.fecha_actualizacion
  });
}

// Lo que ve el navegador de cada pasaje (nunca la huella completa del tramo).
function pasajePublico(p) {
  const o = {
    id: p.id, clase: p.clase, capitulo: p.capitulo, tituloCapitulo: p.tituloCapitulo,
    cita: p.cita, tipo: p.tipo, motivo_es: p.motivo_es, motivo_en: p.motivo_en
  };
  if (p.campo) o.campo = p.campo;
  if (p.bloqueado) { o.bloqueado = true; if (p.inicio) o.inicio = p.inicio; }
  return o;
}

// ─── Consultar (§11.4): último resultado, para el recuadro de pasajes ───

async function consultar(body, autorId, res) {
  const h = await historiaDelAutor(body.historia_id, autorId, 'id');
  if (!h) return res.status(404).json({ error: 'NO_ENCONTRADA' });
  const m = (await leer(`moderaciones?historia_id=eq.${h.id}&select=fecha,resultado,pasajes,aviso_enviado_en&limit=1`))[0];
  const avisos = (await leer(
    `avisos_moderacion?historia_id=eq.${h.id}&tipo=eq.error_texto&select=cita,estado,fecha,resuelto_en` +
    `&order=fecha.desc&limit=20`
  ));
  // Avisos de imagen: si Javier da la razón, el editor ofrece usar esa foto (revisarImagen la
  // acepta sin IA).
  const avisosImagen = (await leer(
    `avisos_moderacion?historia_id=eq.${h.id}&tipo=eq.error_imagen&select=ruta,estado,fecha,resuelto_en,detalle` +
    `&order=fecha.desc&limit=20`
  )).map(a => ({ ruta: a.ruta, estado: a.estado, fecha: a.fecha, resuelto_en: a.resuelto_en,
    objetivo: a.detalle && a.detalle.objetivo, foto_id: a.detalle && a.detalle.foto_id }));
  if (!m) return res.status(200).json({ resultado: null, avisos, avisosImagen });
  if (m.resultado === 'conjunto') {
    // Nunca la lista sin el Asistente (§6.2).
    return res.status(200).json({ resultado: 'conjunto', total: (m.pasajes || []).length, fecha: m.fecha, avisosImagen });
  }
  return res.status(200).json({
    resultado: m.resultado, fecha: m.fecha,
    pasajes: (m.pasajes || []).map(pasajePublico),
    aviso_enviado: !!m.aviso_enviado_en,
    avisos,
    avisosImagen
  });
}

// ─── "Creo que es un error" (texto): una vez por subida, una frase ──────

async function errorTexto(body, autorId, res) {
  const h = await historiaDelAutor(body.historia_id, autorId, 'id');
  if (!h) return res.status(404).json({ error: 'NO_ENCONTRADA' });
  const explicacion = String(body.explicacion || '').trim().slice(0, MAX_EXPLICACION);
  if (!explicacion) return res.status(400).json({ error: 'FALTA_EXPLICACION' });
  const m = (await leer(`moderaciones?historia_id=eq.${h.id}&select=fecha,resultado,pasajes,aviso_enviado_en&limit=1`))[0];
  if (!m || !['pasajes', 'limite_duro'].includes(m.resultado)) return res.status(409).json({ error: 'SIN_PASAJES' });
  if (m.aviso_enviado_en) return res.status(409).json({ error: 'AVISO_YA_ENVIADO' });
  const p = (m.pasajes || []).find(x => x.id === body.pasaje_id);
  if (!p) return res.status(404).json({ error: 'PASAJE_NO_ENCONTRADO' });
  // Primero se marca (solo si nadie lo ha hecho a la vez): así nunca hay dos avisos por subida.
  const marcadas = await actualizar(
    `moderaciones?historia_id=eq.${h.id}&fecha=eq.${encodeURIComponent(m.fecha)}&aviso_enviado_en=is.null`,
    { aviso_enviado_en: new Date().toISOString() }, true
  );
  if (!marcadas || !marcadas.length) return res.status(409).json({ error: 'AVISO_YA_ENVIADO' });
  await insertar('avisos_moderacion', {
    tipo: 'error_texto', autor_id: autorId, historia_id: h.id, huella: p.huella, cita: p.cita,
    explicacion, detalle: { pasaje_id: p.id, tipo: p.tipo, motivo_es: p.motivo_es, capitulo: p.tituloCapitulo }
  });
  return res.status(200).json({ ok: true });
}

// ─── Imágenes: revisarImagen y errorImagen (§5; §11.13, punto 9) ────────

// Foto o portada del Autor, con su carpeta y el prefijo que deben tener sus archivos.
async function objetivoImagen(body, autorId) {
  if (body.objetivo === 'portada') {
    const h = await historiaDelAutor(body.historiaId, autorId, 'portada_url');
    if (!h) return null;
    return { tipo: 'portada', historia: h, carpeta: `${autorId}/${h.id}`, prefijo: 'cover-' };
  }
  if (body.objetivo === 'foto') {
    if (!UUID.test(String(body.fotoId || ''))) return null;
    const f = (await leer(`fotos?id=eq.${body.fotoId}&select=id,historia_id,url,imagenes_cargadas&limit=1`))[0];
    if (!f) return null;
    const h = await historiaDelAutor(f.historia_id, autorId, 'id');
    if (!h) return null;
    return { tipo: 'foto', foto: f, historia: h, carpeta: `${autorId}/${h.id}`, prefijo: `foto-${f.id}-` };
  }
  return null;
}

// La ruta debe ser un archivo de la carpeta del libro con el nombre de esa foto o portada.
function rutaValida(ruta, obj) {
  if (typeof ruta !== 'string' || !almacen.rutaEnCarpeta(ruta, obj.carpeta)) return false;
  const nombre = ruta.slice(obj.carpeta.length + 1);
  return nombre.startsWith(obj.prefijo) && !nombre.includes('-propuesta-') && /\.(jpe?g|png)$/i.test(nombre);
}

async function revisarImagenCargada(body, autorId, res) {
  const obj = await objetivoImagen(body, autorId);
  if (!obj) return res.status(404).json({ error: 'NO_ENCONTRADA' });
  const ruta = String(body.ruta || '');
  if (!rutaValida(ruta, obj)) return res.status(400).json({ error: 'RUTA_NO_VALIDA' });
  if (obj.tipo === 'foto' && (Number(obj.foto.imagenes_cargadas) || 0) >= 2) {
    return res.status(403).json({ error: 'LIMITE_IMAGENES' });
  }
  // Imagen a la que Javier ha dado la razón ("Creo que es un error" aceptado): pasa sin IA.
  const aceptada = (await leer(
    `avisos_moderacion?tipo=eq.error_imagen&historia_id=eq.${obj.historia.id}&estado=eq.aceptado` +
    `&ruta=eq.${encodeURIComponent(ruta)}&select=id&limit=1`
  )).length > 0;
  let r;
  if (aceptada) {
    if (!(await descargar(ruta))) return res.status(400).json({ error: 'IMAGEN_NO_VALIDA' });
    r = { categoria: 'ok' };
  } else {
    if (await mod.imagenesRevisadasHoy(autorId) >= mod.LIMITE_IMAGENES_DIA) {
      return res.status(429).json({ error: 'LIMITE_IMAGENES_DIA' });
    }
    if (await mod.fusibleSaltado()) {
      await mod.avisarFusible(autorId, obj.historia.id);
      return res.status(503).json({ error: 'FUSIBLE' });
    }
    const img = await descargar(ruta);
    if (!img) return res.status(400).json({ error: 'IMAGEN_NO_VALIDA' });
    try { r = await mod.revisarImagen(img); }
    catch (e) {
      await mod.anotarGasto('moderacion_imagen', autorId, obj.historia.id, e.coste || 0, { origen: 'carga', ruta, fallo: true });
      console.error('moderar: revisarImagen', e.message);
      return res.status(503).json({ error: 'REVISION_NO_DISPONIBLE' });
    }
    await mod.anotarGasto('moderacion_imagen', autorId, obj.historia.id, r.coste,
      { origen: 'carga', ruta, objetivo: obj.tipo, categoria: r.categoria, bloqueo: r.bloqueo });
  }

  if (r.categoria !== 'ok') {
    // Caso 1 (menores): se borra en el acto; nunca se conserva. Casos 2 y 3: queda una hora
    // sin usar (la limpieza lo borra) por si el Autor pulsa "Creo que es un error".
    if (r.categoria === 'menor') {
      try { await borrarArchivos([ruta]); } catch (e) { console.error('moderar: borrar imagen', e.message); }
      return res.status(200).json({ ok: false, categoria: 'menor' });
    }
    return res.status(200).json({ ok: false, categoria: r.categoria, ruta });
  }

  // Pasa: el servidor apunta la dirección y lleva la cuenta (como hacía el disparador).
  const url = direccionPublica(ruta);
  if (obj.tipo === 'portada') {
    await actualizar(`historias?id=eq.${obj.historia.id}`,
      { portada_url: url, portada_revisada: url, portada_original_url: null });
    return res.status(200).json({ ok: true, url });
  }
  const cargadas = (Number(obj.foto.imagenes_cargadas) || 0) + 1;
  const filas = await actualizar(
    `fotos?id=eq.${obj.foto.id}&imagenes_cargadas=eq.${Number(obj.foto.imagenes_cargadas) || 0}`,
    { url, imagen_revisada: url, imagenes_cargadas: cargadas, original_url: null }, true
  );
  if (!filas || !filas.length) return res.status(409).json({ error: 'FOTO_CAMBIADA' }); // otra carga a la vez
  return res.status(200).json({ ok: true, url, imagenes_cargadas: cargadas });
}

async function errorImagen(body, autorId, res) {
  const obj = await objetivoImagen(body, autorId);
  if (!obj) return res.status(404).json({ error: 'NO_ENCONTRADA' });
  const ruta = String(body.ruta || '');
  if (!rutaValida(ruta, obj)) return res.status(400).json({ error: 'RUTA_NO_VALIDA' });
  const explicacion = String(body.explicacion || '').trim().slice(0, MAX_EXPLICACION);
  if (!explicacion) return res.status(400).json({ error: 'FALTA_EXPLICACION' });
  // Solo una imagen que se acaba de rechazar por los casos 2 o 3 (nunca la de un menor).
  const hace = new Date(Date.now() - MARGEN_LIMPIEZA_MS).toISOString();
  const rechazo = (await leer(
    `registro_gasto?servicio=eq.moderacion_imagen&autor_id=eq.${autorId}&fecha=gte.${hace}` +
    `&detalle->>ruta=eq.${encodeURIComponent(ruta)}&select=detalle&order=fecha.desc&limit=1`
  ))[0];
  const categoria = rechazo && rechazo.detalle && rechazo.detalle.categoria;
  if (!['adulto', 'violencia'].includes(categoria)) return res.status(409).json({ error: 'SIN_RECHAZO' });
  const ya = await leer(`avisos_moderacion?tipo=eq.error_imagen&ruta=eq.${encodeURIComponent(ruta)}&select=id&limit=1`);
  if (ya.length) return res.status(409).json({ error: 'AVISO_YA_ENVIADO' });
  await insertar('avisos_moderacion', {
    tipo: 'error_imagen', autor_id: autorId, historia_id: obj.historia.id, ruta, explicacion,
    detalle: { categoria, objetivo: obj.tipo, foto_id: obj.foto ? obj.foto.id : null }
  });
  return res.status(200).json({ ok: true });
}

// ─── Limpieza al subir (§11.4; v2: respeta los avisos de imagen) ────────

async function limpiar(historiaId, carpeta) {
  let pub = null, hist = null, filasFotos = [], avisos = [];
  try {
    pub = (await leer(`publicaciones?historia_id=eq.${historiaId}&select=titulo,contenido,portada_url&limit=1`))[0] || null;
    hist = (await leer(`historias?id=eq.${historiaId}&select=portada_url,portada_original_url&limit=1`))[0] || null;
    filasFotos = await leer(`fotos?historia_id=eq.${historiaId}&select=url,original_url`);
    avisos = await leer(`avisos_moderacion?historia_id=eq.${historiaId}&tipo=eq.error_imagen&estado=in.(pendiente,aceptado)&select=ruta`);
  } catch (e) {
    console.error('moderar: limpieza, lectura', historiaId, e.message);
    return;
  }

  // Traducciones de tramos que ya no existen en lo publicado.
  if (pub) {
    try {
      const vigentes = huellasVigentes(pub);
      const d = await fetch(
        `${SUPA_URL()}/rest/v1/traducciones_cache?historia_id=eq.${historiaId}` +
        `&huella=not.in.(${vigentes.join(',')})`,
        { method: 'DELETE', headers: cabeceras({ Prefer: 'return=minimal' }) }
      );
      if (!d.ok) throw new Error(`${d.status} ${await d.text()}`);
    } catch (e) {
      console.error('moderar: limpieza, traducciones', historiaId, e.message);
    }
  }

  // Archivos que no usa nadie (ni lo publicado, ni lo que se escribe, ni un original
  // recuperable, ni una imagen con "Creo que es un error" sin decidir o aceptada), de más
  // de una hora.
  try {
    const usados = new Set();
    const usar = d => { const r = rutaDeDireccion(d); if (r) usados.add(r); };
    if (pub) {
      usar(pub.portada_url);
      ((pub.contenido && pub.contenido.fotos) || []).forEach(f => usar(f && f.url));
    }
    if (hist) { usar(hist.portada_url); usar(hist.portada_original_url); }
    filasFotos.forEach(f => { usar(f.url); usar(f.original_url); });
    avisos.forEach(a => { if (a.ruta) usados.add(a.ruta); });

    const ahora = Date.now();
    const borrar = [];
    for (const it of await listarCarpeta(carpeta)) {
      if (it.id === null) continue;
      const ruta = `${carpeta}/${it.name}`;
      if (!ruta.startsWith(carpeta + '/') || it.name.includes('/')) continue;
      if (usados.has(ruta)) continue;
      const fecha = Math.max(Date.parse(it.created_at) || 0, Date.parse(it.updated_at) || 0);
      if (!fecha || ahora - fecha < MARGEN_LIMPIEZA_MS) continue;
      borrar.push(ruta);
    }
    await borrarArchivos(borrar);
    if (borrar.length) console.log(`moderar: ${historiaId}: ${borrar.length} archivos sin uso borrados`);
  } catch (e) {
    console.error('moderar: limpieza, archivos', historiaId, e.message);
  }
}

async function listarCarpeta(carpeta) {
  const items = [];
  let offset = 0;
  while (true) {
    const r = await fetch(`${SUPA_URL()}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: cabeceras(),
      body: JSON.stringify({ prefix: carpeta, limit: 1000, offset })
    });
    if (!r.ok) throw new Error(`listar: ${r.status} ${await r.text()}`);
    const lote = await r.json();
    items.push(...lote);
    if (lote.length < 1000) break;
    offset += 1000;
  }
  return items;
}

// ─── Entrada ────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METODO_NO_PERMITIDO' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'CONFIGURACION' });
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const autorId = await autorDeLaSesion(body.token);
    if (!autorId) return res.status(401).json({ error: 'SIN_SESION' });

    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      (req.socket && req.socket.remoteAddress) || '';

    switch (body.operacion) {
      case 'subir': return await subir(body, autorId, ip, res);
      case 'consultar': return await consultar(body, autorId, res);
      case 'error': return await errorTexto(body, autorId, res);
      case 'revisarImagen': return await revisarImagenCargada(body, autorId, res);
      case 'errorImagen': return await errorImagen(body, autorId, res);
      default: return res.status(400).json({ error: 'OPERACION_DESCONOCIDA' });
    }
  } catch (e) {
    console.error('moderar:', e);
    return res.status(500).json({ error: 'ERROR' });
  }
};

module.exports.config = { maxDuration: 60 };
