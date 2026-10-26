// api/moderar.js — Locus Mundi
// Versión 3.13 · 26/10/2026 · Número de Autor al publicar por primera vez (Continuidad, sesión
//   «26/10/2026 (limpieza)», punto 3). publicar_historia lo asigna en Supabase; aquí solo se devuelve
//   al editor: numero_autor y numero_nuevo (true la primera vez). Nada más cambia.
// Versión 3.12 · 26/10/2026 · TEST de los pendientes de index.html: cada «Creo que es un error» (texto o
//   imagen) manda además un aviso interno (api/_aviso.js, a la dirección de los avisos), para que Javier
//   sepa que hay uno pendiente. Si el aviso falla, el «Creo que es un error» queda guardado igual.
//   LIMITE_CONJUNTO cuenta solo las subidas revisadas con resultado «conjunto» (antes, todas las revisadas
//   de la semana: un libro con dos subidas normales quedaba bloqueado una semana tras su primer conjunto).
// Versión 3.11 · 25/10/2026 · Fase C, pendientes de index.html (II). Decisiones de Javier:
//   - Veredicto de conjunto: la lista de pasajes y sus motivos se envían también, gratis (Condiciones
//     de Publicación, apartado 4; DSA art. 17.3). Sustituye a "nunca la lista sin el Asistente" (§6.2).
//     «Creo que es un error» vale también en ese caso. El Asistente sigue siendo la vía cómoda (de pago).
//   - Límite propio para esos libros: si la última revisión fue de conjunto, como mucho 1 subida
//     revisada al día y 3 en 7 días (LIMITE_CONJUNTO). Lo demás, sin cambios.
// Versión 3.10 · 21/10/2026 · Campo «Dedicatoria» (Fase B2, punto 14; Continuidad, sesión "20-21/10/2026
// (conversación 12-4)"). 'dedication' se copia a lo publicado (hasta 400 caracteres) y se revisa con la
// cabecera, como el subtítulo, en una sola línea (sus saltos de línea, como espacios). No entra en la
// tarjeta traducida. Nada más cambia.
// Versión 3.9 · 19/10/2026 · Lista cerrada de países (Fase B2, punto 10; Continuidad, sesión
// "19/10/2026 (conversación 10: lista cerrada de países)"). Único cambio: la copia a lo publicado
// lleva también 'countryCode' (código fijo de dos letras, tabla paises de Supabase), en
// mayúsculas; si no tiene forma de código (dos letras A–Z), no se copia. Un código bien formado
// pero inexistente no hace daño: el disparador de la búsqueda no le encuentra nombres y la web
// no lo muestra. Nada más cambia (moderación, tarjeta traducida, límites).
// Versión 3.8 · 18/10/2026 · Corrige la tarjeta traducida de la v3.7 tras el TEST real: la respuesta
// (una lista sin límite) se alargó hasta el máximo de Google (2 minutos, 0,15 €, ilegible). Ahora:
//   - La respuesta es un objeto con un apartado fijo por idioma y campos fijos (no una lista): no
//     puede repetirse sin fin.
//   - Tope de respuesta (MAX_TOKENS_TARJETA, con _moderacion.js v1.5): como mucho unos 2 céntimos.
//   - Un solo intento por subida (la siguiente subida vuelve a intentarlo).
//   - Temperatura por defecto (a 0, un texto largo y repetitivo en 13 idiomas se atasca más).
// Versión 3.7 · 18/10/2026 · Tarjeta traducida (Fase B2, punto 12; Continuidad, sesión
// "18/10/2026 (conversación 9: tarjeta traducida)"). Decisiones de Javier (conversación 8, 5 a y b):
//   - Tras publicar, en la misma subida, la tarjeta (título, subtítulo, país, ciudad, profesión y
//     concepto) se traduce UNA vez a los 14 idiomas de la web (IDIOMAS_WEB) en una sola llamada;
//     el extracto, solo al inglés (lo único que se muestra; la búsqueda no mira el extracto).
//     El nombre del Autor no se traduce.
//   - Se guarda en publicaciones.tarjeta_traducida (solo del servidor), con la huella de la
//     tarjeta original: si no cambió, no se traduce ni se gasta nada.
//   - El disparador de publicaciones añade las 14 versiones a la búsqueda y vacía la traducción
//     si cambia la tarjeta sin traducirla a la vez (también con "Modificar").
//   - Nunca tumba la publicación: si falla, salta el fusible o no queda tiempo, el libro queda
//     publicado y la tarjeta se ve en su idioma original hasta la siguiente subida.
//   - Gasto anotado en registro_gasto ('traduccion_tarjeta'). Modelo: M.MODELOS.traduccion.
// Versión 3.6 · 16/10/2026 · Criterio de salud e identificación (Fase B2, punto 21; Continuidad,
// sesión "16/10/2026 (conversación 4: criterio)"). Decisiones de Javier, tras la consulta jurídica:
//   - Salud de terceros: pasa la dolencia corriente que no marca a la persona (infarto, covid, una
//     operación, una gripe) y la enfermedad grave contada como historia acabada (vencida o
//     terminada con la muerte). Se señala la enfermedad grave presente, la salud mental, las
//     adicciones y la salud sexual o reproductiva (estas cuatro, también en pasado).
//   - "Una de mis tías", "uno de mis primos", "un tío mío" (uno entre varios, sin decir cuál)
//     cuentan como referencia vaga. "Mi tía", "mi tía Rosa", con nombre, siguen identificando.
//   - Las opiniones políticas presentes de una persona viva siguen en el criterio (sin cambios).
//   - VERSION_CRITERIO nueva. Nada más cambia (memoria de frases, confirmación, límites).
//   - (17/10/2026, punto 19 (c)) Los modelos se leen de api/_modelos.js.
// Versión 3.5 · 11/10/2026 · Memoria de frases aprobadas (idea de Javier: "si ya pasó el filtro
// una vez, que sirva para siempre"). En el TEST real, una frase que había pasado ("Mi primo Luis
// vota…") se señaló al cambiar sus vecinas: Flash-Lite juzga cada frase según su contexto.
//   - Tabla nueva frases_aprobadas (libro, versión del criterio, huella de la frase; cerrada a la
//     web; cascada con el libro). Solo guarda la huella, nunca el texto.
//   - Al revisar un fragmento, sus frases que no quedan señaladas se guardan como aprobadas.
//   - Un pasaje cuyas frases están TODAS aprobadas para este libro y esta versión del criterio no
//     se muestra. Nunca para el límite duro ni para un fragmento que no se pudo revisar.
//   - Si la tabla falla, la subida sigue como en la v3.4 (la memoria nunca tumba nada).
//   - Las instrucciones de la IA no cambian: VERSION_CRITERIO sigue siendo la misma.
// Versión 3.4 · 11/10/2026 · Tras la batería real de la v3.3 ("Mía"): Flash-Lite no señaló al
// primo Luis porque sus instrucciones le pedían prudencia ("en la duda, no se señala"), cuando
// en este esquema solo propone y decide Flash. Cambios respecto a la v3.3, aprobados por Javier:
//   - Primera revisión (Flash-Lite) sensible: "en la duda, señala; otro revisor confirmará". Sin
//     la marca "claro", que ya no usa nadie.
//   - La confirmación (Flash) mantiene el criterio estricto: solo lo claro y manifiesto.
//   - Temperatura 0 en las dos llamadas (respuestas estables), con _moderacion.js v1.1.
//   - VERSION_CRITERIO nueva.
// Versión 3.3 · 11/10/2026 · Coste (Javier: la publicación es gratuita y debe ser sostenible).
// La v3.2 revisaba todo con Flash: unos 5 céntimos por un libro corto. Cambios respecto a la
// v3.2, aprobados por Javier:
//   - "Flash-Lite revisa, Flash confirma": cada capítulo lo revisa Flash-Lite (barato, como hasta
//     la v3.1); solo si señala algo que no sea límite duro, Flash confirma en UNA llamada por
//     capítulo cada frase señalada, con su párrafo como contexto, y se quedan solo las que
//     confirma como claras. Un libro sano no paga nada de Flash.
//   - Si la confirmación falla (red, bloqueo, respuesta ilegible), se conserva lo que señaló
//     Flash-Lite (más vale pedir una revisión de más que publicar algo grave).
//   - El "claro" que marca Flash-Lite ya no descarta nada por sí solo (no es fiable): decide Flash.
//   - VERSION_CRITERIO nueva.
// Versión 3.2 · 11/10/2026 · Estabilidad del criterio, tras el TEST A real (Continuidad, sesión
// "11/10/2026 (subida pequeña)"): con la v3.1, una frase que había pasado ("Un vecino engaña…")
// se señaló al revisar de nuevo su capítulo, y también la propuesta del Asistente ("Un familiar
// vota…"). Cambios respecto a la v3.1, aprobados por Javier:
//   - Las referencias vagas y los seudónimos ("un familiar", "un vecino", "el señor Oso") van
//     también en "DO NOT FLAG", donde la IA mira qué no debe señalar.
//   - Solo se señala lo manifiesto: la IA dice de cada pasaje si es claro ("claro": true) y el
//     servidor descarta los dudosos (salvo el límite duro, que bloquea siempre).
//   - El texto se revisa con Flash (MODELO_TEXTO), que sigue mejor las reglas con matices; las
//     imágenes siguen con Flash-Lite (_moderacion.js, sin cambios).
//   - VERSION_CRITERIO nueva.
// Versión 3.1 · 11/10/2026 · Corrige la v3 tras el TEST A real (Continuidad, sesión
// "11/10/2026 (subida pequeña)"). Cambios respecto a la v3, aprobados por Javier:
//   - El motivo de "tercero" no decía "privada": la regla va ahora dentro de la instrucción del
//     motivo, con ejemplos de ese tipo (la IA imita el ejemplo más que la regla).
//   - Nueva excepción en "DO NOT FLAG": la actividad política o sindical y la persecución,
//     juicio, cárcel, exilio o represión por motivos políticos en el pasado, contados como
//     testimonio histórico, son hechos públicos (caso del tío Mariano, preso político). Sigue
//     señalándose la opinión política privada y presente de una persona viva.
//   - La etiqueta del registro de gastos dice "moderar v3" (la v3 seguía diciendo "moderar v2").
//   - VERSION_CRITERIO nueva (cambian las instrucciones).
// Versión 3 · 11/10/2026 · Cambio del criterio (LOCUS_MUNDI_DISENO_MODERACION.md v13, §11.17,
// punto 5; v14, §11.18, punto 7; Continuidad, sesión "11/10/2026 (subida pequeña)"). Cambios
// respecto a la v2, solo en las instrucciones de la IA:
//   - Regla "Identifiable": una referencia vaga ("un familiar", "un vecino", "una persona") no
//     identifica a nadie, salvo que el contexto deje claro de quién se trata.
//   - Cuando el tipo es "tercero", el motivo dice que el hecho es privado.
//   - VERSION_CRITERIO nueva: cada libro se revisa entero en su siguiente subida. Los avisos
//     "Creo que es un error" aceptados se siguen respetando (van por frase, no por versión).
// Nada más cambia.
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
const { avisar } = require('./_aviso');     // v3.12: aviso interno de «Creo que es un error»

// ─── Constantes ─────────────────────────────────────────────────────────

const BUCKET = almacen.BUCKET;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MARGEN_LIMPIEZA_MS = 60 * 60 * 1000; // una hora (§11.4)

// Versión del criterio (§11.13, punto 6). Cambiarla obliga a revisar de nuevo todos los
// tramos en la siguiente subida de cada libro. Cambiarla SIEMPRE que cambien las
// instrucciones de la IA de más abajo.
const VERSION_CRITERIO = 'texto-2026-10-16';

// v3.3: la revisión del texto la hace Flash-Lite (mod.MODELO_MODERACION, el de las imágenes) y
// Flash solo confirma lo señalado. Los dos precios están en la tabla de _moderacion.js.
const M = require('./_modelos'); // v3.6, punto 19 (c)
const MODELO_REVISION = M.MODELOS.moderacion;
const MODELO_CONFIRMACION = M.MODELOS.confirmacion;

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
  'name', 'born', 'country', 'lang', 'title', 'subtitle', 'dedication', 'text', // v3.10: dedication
  'pubCity', 'pubProfession', 'pubConcept', 'countryCode' // v3.9: código fijo del país
];

// Campos de texto libre publicados que se revisan como "cabecera" (con los pies de foto).
const CAMPOS_CABECERA = [
  ['title', 'Title'], ['subtitle', 'Subtitle'], ['dedication', 'Dedication'], ['name', 'Author name'],
  ['pubCity', 'City'], ['pubProfession', 'Profession'], ['pubConcept', 'Concept']
];

const IDIOMAS = {
  ES: 'Spanish', CA: 'Catalan', GL: 'Galician', EU: 'Basque', EN: 'English', FR: 'French',
  DE: 'German', IT: 'Italian', 'PT-BR': 'Brazilian Portuguese', 'PT-PT': 'European Portuguese',
  PT: 'Portuguese', NL: 'Dutch', PL: 'Polish', RO: 'Romanian', RU: 'Russian', AR: 'Arabic',
  ZH: 'Chinese', JA: 'Japanese', KO: 'Korean', HI: 'Hindi'
};

// v3.7: los 14 idiomas de la web (LANGS_UI de index.html). Si un día hay más, se amplía aquí y
// se cambia VERSION_TARJETA: cada tarjeta se retraduce en su siguiente subida.
const IDIOMAS_WEB = ['ES', 'EN', 'FR', 'DE', 'IT', 'PT-PT', 'PT-BR', 'ZH', 'AR', 'JA', 'RU', 'HI', 'GL', 'CA'];
const VERSION_TARJETA = 'tarjeta-2026-10-18';
const CAMPOS_TARJETA = ['title', 'subtitle', 'country', 'pubCity', 'pubProfession', 'pubConcept'];
const MODELO_TARJETA = M.MODELOS.traduccion;
const MAX_CAMPO_TARJETA = 400;
// Si la subida ya ha gastado más que esto, no se empieza la traducción (límite de 60 s).
const TIEMPO_MAX_PARA_TARJETA_MS = 40 * 1000;

// ─── Instrucciones de la IA (criterio de §4.4; §11.4 y §11.13, punto 8) ──

// v3.4: fase 'revision' (Flash-Lite, sensible) o 'confirmacion' (Flash, estricta).
function instruccionesTexto(idioma, fase) {
  const confirmacion = fase === 'confirmacion';
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
    '- "tercero": serious private facts about ANOTHER living, identifiable person: attributing to them a crime or seriously reprehensible conduct with no public record; their health, ONLY in these cases: any mental health matter, any addiction, any sexual or reproductive health matter (abortion, infertility, sexually transmitted infections) — these even if told in the past —, or a serious illness they are suffering NOW (cancer, HIV, dementia, a terminal or degenerative disease, a disability); their sexuality or intimate life; their addictions; their ethnic origin, religious beliefs or political opinions.',
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
    '- Facts about someone referred to only vaguely or by a nickname or invented name meant to hide who they are ("a relative", "an acquaintance", "a neighbour", "a person", "Mr Bear"; in Spanish "un familiar", "un conocido", "un vecino", "una persona", "el señor Oso"): nobody can be identified, even if the fact is private.',
    '- Ordinary ailments that do not mark a person (a heart attack, covid, an operation, the flu, a broken bone), and a serious illness told as a finished story: overcome ("my aunt had cancer and beat it") or ended by death.',
    '- Facts about one unspecified person among several ("one of my aunts", "one of my cousins", "an uncle of mine"; in Spanish "una de mis tías", "uno de mis primos", "un tío mío"), with no name: it is not said which one, so nobody is identified.',
    '- Political or union activity, and persecution, trial, imprisonment, exile or repression for political reasons in the past (for example under a dictatorship or during a war), told as historical testimony: these are public, historical facts, even if they reveal the person\'s ideology. Do flag a living person\'s present, private political opinions or vote.',
    '- Whether the story is true, its literary quality, spelling or format.',
    '',
    'PRACTICAL RULES:',
    '- Identifiable: anyone named, or with a specific family relationship or tie to the author ("my brother-in-law", "my aunt", "my neighbour on the third floor"), because the book is signed. A vague reference ("a relative", "an acquaintance", "a neighbour", "a person", "one of my aunts") does not identify anyone, unless the context makes clear who it is (a name, or a detail that singles the person out).',
    '- Living: presume the person is alive unless the text makes clear they have died.',
    confirmacion
      ? '- When in doubt, do not flag. Only clear, manifest cases count.'
      : '- In this first review, when in doubt, DO flag: another reviewer will confirm each case. Still never flag what the DO NOT FLAG list excludes.',
    '- Lines starting with ¶ or § are chapter and section titles; lines like [FOTO 2] are technical marks.',
    '',
    'OUTPUT: JSON {"pasajes": [ {"cita": "...", "tipo": "...", "motivo_es": "...", "motivo_en": "..."} ]}.',
    '- "cita": copy EXACTLY, character by character, the complete sentence or sentences that contain the problem, as they appear in the fragment. Never part of a sentence. Never rewrite it.',
    '- "tipo": one of "duro", "tercero", "menor", "colectivo", "sexual".',
    '- "motivo_es" and "motivo_en": one plain sentence, in Spanish and in English, saying why, without legal jargon and without repeating the quote. When "tipo" is "tercero", the sentence MUST say that the fact is private ("privada" / "private"; for a crime: "sin constancia pública" / "not public knowledge"). Examples: "Revela información privada sobre la salud mental de un familiar vivo e identificable." / "It reveals private mental health information about an identifiable living relative." — "Atribuye un delito sin constancia pública a una persona viva con nombre." / "It attributes a crime that is not public knowledge to a named living person."',
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
    const v = String(contenido[k] || '').replace(/\s*\n\s*/g, ' ').trim(); // v3.10: una línea por campo
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

// ─── v3.5: memoria de frases aprobadas ──────────────────────────────────

const ETIQUETA_CABECERA = /^(Title|Subtitle|Dedication|Author name|City|Profession|Concept|Photo \d+ caption):\s*/;

// Frases de un texto: por párrafos (o líneas, en la cabecera) y, dentro, tras . ! ? … (con sus
// comillas de cierre). Misma función para el fragmento y para la cita: así coinciden.
function frasesDe(texto, cabecera) {
  const bloques = cabecera
    ? String(texto || '').split('\n').map(l => l.replace(ETIQUETA_CABECERA, ''))
    : String(texto || '').replace(/\r\n?/g, '\n').split(/\n\s*\n/);
  const out = [];
  for (const b of bloques) {
    for (const f of b.split(/(?<=[.!?…][»"”’)]*)\s+/)) {
      const n = normalizar(f);
      if (n.length >= 2) out.push(n);
    }
  }
  return out;
}

const huellaFrase = f => crypto.createHash('sha256').update('frase\n' + normalizar(f), 'utf8').digest('hex');

async function frasesAprobadas(historiaId) {
  try {
    const filas = await leer(
      `frases_aprobadas?historia_id=eq.${historiaId}&version_criterio=eq.${VERSION_CRITERIO}&select=huella&limit=100000`
    );
    return new Set(filas.map(f => f.huella));
  } catch (e) {
    console.error('moderar: frases_aprobadas, lectura', e.message);
    return new Set();
  }
}

// Guarda como aprobadas las frases del fragmento que no han quedado señaladas.
async function aprobarFrases(historiaId, unidad, pasajes) {
  if (pasajes.some(p => p.bloqueado)) return; // no se pudo revisar: nada se aprueba
  const citas = pasajes.map(p => normalizar(p.cita)).filter(Boolean);
  const huellas = [...new Set(frasesDe(unidad.texto, unidad.clase === 'cabecera')
    .filter(f => !citas.some(c => c.includes(f) || f.includes(c)))
    .map(huellaFrase))];
  if (!huellas.length) return;
  try {
    for (let i = 0; i < huellas.length; i += 500) {
      const r = await fetch(`${SUPA_URL()}/rest/v1/frases_aprobadas?on_conflict=historia_id,version_criterio,huella`, {
        method: 'POST',
        headers: cabeceras({ Prefer: 'resolution=ignore-duplicates,return=minimal' }),
        body: JSON.stringify(huellas.slice(i, i + 500).map(huella => ({
          historia_id: historiaId, version_criterio: VERSION_CRITERIO, huella
        })))
      });
      if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    }
  } catch (e) {
    console.error('moderar: frases_aprobadas, escritura', e.message);
  }
}

// ¿Todas las frases de la cita estaban ya aprobadas?
function yaAprobada(p, unidad, aprobadas) {
  if (!p.cita || p.bloqueado || p.tipo === 'duro' || !aprobadas.size) return false;
  const fr = frasesDe(p.cita, unidad.clase === 'cabecera');
  return fr.length > 0 && fr.every(f => aprobadas.has(huellaFrase(f)));
}

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
      if (!enUnCampo(cita)) cita = cita.replace(/^(Title|Subtitle|Dedication|Author name|City|Profession|Concept|Photo \d+ caption):\s*/, '');
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
      modelo: MODELO_REVISION,
      sistema: instruccionesTexto(idioma, 'revision'),
      temperatura: 0,
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
    if (pasajes) {
      const c = await confirmar(pasajes, unidad, idioma);
      return { pasajes: c.pasajes, coste: coste + c.coste, confirmacion: c.estado };
    }
    console.error('moderar: respuesta de texto ilegible; intento', intento + 1);
  }
  const e = new Error('REVISION_TEXTO_FALLIDA');
  e.coste = coste;
  throw e;
}

// v3.3: Flash confirma lo que ha señalado Flash-Lite (salvo el límite duro, que no se discute).
// Una sola llamada por unidad. Devuelve { pasajes, coste, estado }.
const ESQUEMA_CONFIRMACION = {
  type: 'OBJECT',
  properties: {
    decisiones: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { n: { type: 'INTEGER' }, claro: { type: 'BOOLEAN' } },
        required: ['n', 'claro']
      }
    }
  },
  required: ['decisiones']
};

// El párrafo (o los párrafos) del fragmento que contienen la cita; en la cabecera, su línea.
function contextoDe(cita, unidad) {
  const bloques = unidad.clase === 'cabecera'
    ? unidad.texto.split('\n')
    : unidad.texto.replace(/\r\n?/g, '\n').split(/\n\s*\n/);
  const b = bloques.find(x => x.includes(cita));
  return (b || cita).trim().slice(0, 3000);
}

async function confirmar(pasajes, unidad, idioma) {
  const dudables = pasajes.filter(p => p.tipo !== 'duro');
  if (!dudables.length) return { pasajes, coste: 0, estado: null };
  const lista = dudables.map((p, i) => ({ n: i + 1, cita: p.cita, tipo: p.tipo, contexto: contextoDe(p.cita, unidad) }));
  const sistema = instruccionesTexto(idioma, 'confirmacion') + '\n\n' + [
    'CONFIRMATION TASK (this replaces the OUTPUT section above): another reviewer flagged the sentences below.',
    'For each one, decide only whether it is a clear, manifest case under the criteria above: the person is clearly identifiable (named, or with a specific relationship to the author) and the fact is clearly private and serious (or, for the other types, clearly offensive or explicit).',
    'Vague references (including "one of my aunts"), nicknames, ordinary ailments, serious illnesses told as overcome or ended, deceased people, public facts, what others did to the author, and past political repression told as historical testimony are NOT clear cases. When in doubt, "claro": false.',
    'Return only JSON: {"decisiones": [ {"n": 1, "claro": true} ]}, one item per sentence.'
  ].join('\n');
  let r;
  try {
    r = await mod.llamarGeminiJson({
      modelo: MODELO_CONFIRMACION, sistema, temperatura: 0,
      partes: [{ text: JSON.stringify(lista) }],
      esquema: ESQUEMA_CONFIRMACION
    });
  } catch (e) {
    console.error('moderar: confirmación fallida, se conserva lo señalado', e.message);
    return { pasajes, coste: e.coste || 0, estado: 'fallo' };
  }
  const decisiones = r.json && Array.isArray(r.json.decisiones) ? r.json.decisiones : null;
  if (r.bloqueo || !decisiones) {
    console.error('moderar: confirmación sin respuesta legible, se conserva lo señalado');
    return { pasajes, coste: r.coste, estado: 'fallo' };
  }
  const claros = new Set(decisiones.filter(d => d && d.claro === true).map(d => d.n));
  const quedan = dudables.filter((p, i) => claros.has(i + 1));
  return { pasajes: [...pasajes.filter(p => p.tipo === 'duro'), ...quedan], coste: r.coste,
    estado: { senalados: dudables.length, confirmados: quedan.length } };
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

// ─── Tarjeta traducida (v3.7) ───────────────────────────────────────────

// v3.8: objeto con un apartado fijo por idioma y campos fijos (la v3.7 usaba una lista sin límite).
function esquemaTarjeta(destinos, campos) {
  const props = {};
  for (const d of destinos) {
    const cs = campos.filter(k => k !== 'extracto' || d === 'EN');
    props[d] = { type: 'OBJECT', properties: Object.fromEntries(cs.map(k => [k, { type: 'STRING' }])), required: cs };
  }
  return { type: 'OBJECT', properties: props, required: destinos };
}
const MAX_TOKENS_TARJETA = 6000;

function instruccionesTarjeta(idioma, destinos, campos) {
  const lengua = IDIOMAS[idioma] || 'the language of the text';
  return [
    'You translate the library card of a published autobiography. The card is written in ' + lengua + '.',
    'Translate it into each of these languages (codes): ' + destinos.map(d => `${d} (${IDIOMAS[d]})`).join(', ') + '.',
    'Fields: ' + campos.join(', ') + '. "pubCity" is a city or place: use its usual name in each language (exonym) if it has one, otherwise keep it. "country" is a country name. "extracto" is the opening of the book, cut short; keep its final "…" and translate it ONLY for EN.',
    'Translate faithfully and naturally, as a publisher would for a book card: no additions, no explanations, no quotation marks that are not in the original. Keep proper names of people unchanged.',
    'Return only JSON: one object per language code, {"EN": {"title": "...", ...}, "FR": {...}, ...}, each with exactly the fields given (and "extracto" only in EN). Each language once; nothing else.'
  ].join('\n');
}

// Tarjeta original: los campos de la ficha publicada que no estén vacíos, y el extracto que se ve.
function tarjetaOriginal(titulo, contenido, extracto) {
  const t = {};
  const valor = k => String((k === 'title' ? (titulo || contenido.title) : contenido[k]) || '').trim();
  for (const k of CAMPOS_TARJETA) if (valor(k)) t[k] = valor(k).slice(0, MAX_CAMPO_TARJETA);
  if (String(extracto || '').trim()) t.extracto = String(extracto).trim().slice(0, MAX_CAMPO_TARJETA);
  return t;
}

// Valida la respuesta: solo los idiomas pedidos, solo los campos de la tarjeta original, texto plano.
function tarjetaValida(json, destinos, original) {
  if (!json || typeof json !== 'object') return null;
  // v3.8: objeto por idioma ({"EN": {...}}); se admite también la lista de la v3.7.
  const lista = Array.isArray(json.idiomas) ? json.idiomas
    : Object.entries(json).map(([codigo, o]) => ({ ...(o && typeof o === 'object' ? o : {}), codigo }));
  const idiomas = {};
  for (const item of lista) {
    const cod = String(item && item.codigo || '').toUpperCase();
    if (!destinos.includes(cod) || idiomas[cod]) continue;
    const o = {};
    for (const k of Object.keys(original)) {
      if (k === 'extracto' && cod !== 'EN') continue;
      const v = String(item[k] == null ? '' : item[k]).replace(/\s+/g, ' ').trim();
      if (v) o[k] = v.slice(0, MAX_CAMPO_TARJETA);
    }
    if (Object.keys(o).length) idiomas[cod] = o;
  }
  // Mínimo exigido: el inglés (lo que se ve) y casi todos los demás.
  if (destinos.includes('EN') && !idiomas.EN) return null;
  if (Object.keys(idiomas).length < Math.ceil(destinos.length * 0.8)) return null;
  return idiomas;
}

// Nunca lanza: lo peor que pasa es que la tarjeta se vea solo en su idioma original.
async function traducirTarjeta(historiaId, autorId, idioma, titulo, contenido, fechaActualizacion, inicio) {
  try {
    const fila = (await leer(
      `publicaciones?historia_id=eq.${historiaId}&select=extracto,extracto_elegido,tarjeta_traducida&limit=1`
    ))[0];
    if (!fila) return 'sin_fila';
    const original = tarjetaOriginal(titulo, contenido, fila.extracto_elegido || fila.extracto);
    if (!Object.keys(original).length) return 'vacia';
    const huella = crypto.createHash('sha256')
      .update(JSON.stringify({ v: VERSION_TARJETA, idioma, original })).digest('hex');
    if (fila.tarjeta_traducida && fila.tarjeta_traducida.huella === huella) return 'igual';

    if (Date.now() - inicio > TIEMPO_MAX_PARA_TARJETA_MS) return 'sin_tiempo';
    if (await mod.fusibleSaltado()) return 'fusible';

    const destinos = IDIOMAS_WEB.filter(d => d !== idioma);
    const campos = Object.keys(original);
    let coste = 0;
    let idiomas = null;
    for (let intento = 0; intento < 1 && !idiomas; intento++) { // v3.8: un solo intento
      try {
        const r = await mod.llamarGeminiJson({
          modelo: MODELO_TARJETA, sistema: instruccionesTarjeta(idioma, destinos, campos),
          partes: [{ text: JSON.stringify(original) }], esquema: esquemaTarjeta(destinos, campos),
          maxTokens: MAX_TOKENS_TARJETA
        });
        coste += r.coste || 0;
        if (!r.bloqueo) idiomas = tarjetaValida(r.json, destinos, original);
      } catch (e) {
        coste += e.coste || 0;
        console.error('moderar: traducción de la tarjeta', e.message);
      }
    }
    await mod.anotarGasto('traduccion_tarjeta', autorId, historiaId, coste,
      { version: VERSION_TARJETA, idiomas: idiomas ? Object.keys(idiomas).length : 0, fallo: !idiomas });
    if (!idiomas) return 'fallo';

    // Solo si nadie ha vuelto a publicar entretanto (misma fecha de actualización).
    await actualizar(
      `publicaciones?historia_id=eq.${historiaId}&fecha_actualizacion=eq.${encodeURIComponent(fechaActualizacion)}`,
      { tarjeta_traducida: { huella, version: VERSION_TARJETA, modelo: MODELO_TARJETA, fecha: new Date().toISOString(), idiomas } }
    );
    return 'traducida';
  } catch (e) {
    console.error('moderar: tarjeta traducida', e.message);
    return 'error';
  }
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
    // v3.11: libro con veredicto de conjunto: 1 subida revisada al día y 3 en 7 días.
    if (!continuacion) {
      const previa = (await leer(`moderaciones?historia_id=eq.${h.id}&select=resultado&limit=1`))[0];
      if (previa && previa.resultado === 'conjunto') {
        const semana = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
        const hechas = await leer(
          `registro_gasto?servicio=eq.subida&historia_id=eq.${h.id}&fecha=gte.${encodeURIComponent(semana)}` +
          `&detalle->>revisada=eq.true&detalle->>resultado=eq.conjunto&select=fecha` // v3.12: solo las subidas con veredicto de conjunto
        );
        const hoy = new Date(mod.inicioDeHoy()).getTime();
        const deHoy = hechas.filter(x => new Date(x.fecha).getTime() >= hoy).length;
        if (deHoy >= 1 || hechas.length >= 3) {
          return res.status(429).json({ error: 'LIMITE_CONJUNTO', semana: hechas.length >= 3 });
        }
      }
    }
    if (await mod.fusibleSaltado()) {
      await mod.avisarFusible(autorId, h.id);
      return res.status(503).json({ error: 'FUSIBLE' });
    }
  }
  const anotarSubida = (detalle) => mod.anotarGasto('subida', autorId, h.id, 0, {
    version: 'moderar v3.11', revisada: hayQueRevisar && !continuacion, continuacion, ...detalle
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
  // v3.5: las frases aprobadas antes de esta subida (se leen antes de guardar las nuevas).
  const aprobadas = await frasesAprobadas(h.id);
  const txt = await enParalelo(pendientes, REVISIONES_A_LA_VEZ, plazo, async (u) => {
    let r;
    try { r = await revisarUnidad(u, idioma); }
    catch (e) { await mod.anotarGasto('moderacion_texto', autorId, h.id, e.coste || 0, { huella: u.huella, fallo: true }); throw e; }
    await mod.anotarGasto('moderacion_texto', autorId, h.id, r.coste,
      { huella: u.huella, pasajes: r.pasajes.length, ...(r.confirmacion ? { confirmacion: r.confirmacion } : {}) });
    await guardarFila('veredictos_tramo', {
      historia_id: h.id, huella: u.huella, version_criterio: VERSION_CRITERIO,
      pasajes: r.pasajes, fecha: new Date().toISOString()
    }, 'historia_id,huella,version_criterio');
    guardados.set(u.huella, r.pasajes);
    await aprobarFrases(h.id, u, r.pasajes);
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
      if (yaAprobada(p, u, aprobadas)) continue; // v3.5: ya pasó en una revisión anterior
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
    if (resultado === 'conjunto') { // v3.11: con la lista, gratis
      return res.status(200).json({ ok: false, resultado, total: pasajes.length, pasajes: pasajes.map(pasajePublico) });
    }
    return res.status(200).json({ ok: false, resultado, pasajes: pasajes.map(pasajePublico) });
  }

  // 10. La copia: lista cerrada de campos y solo las fotos colocadas.
  const contenido = {};
  for (const k of CAMPOS_PUBLICADOS) if (c[k] !== undefined) contenido[k] = c[k];
  if (contenido.dedication !== undefined) contenido.dedication = String(contenido.dedication || '').slice(0, 400); // v3.10
  // v3.9: el código del país, solo con forma de código (dos letras); si no, fuera.
  if (contenido.countryCode !== undefined) {
    const cc = String(contenido.countryCode || '').trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(cc)) contenido.countryCode = cc; else delete contenido.countryCode;
  }
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
  // 12 bis (v3.7). La tarjeta traducida: nunca tumba la publicación.
  const tarjeta = await traducirTarjeta(h.id, autorId, idioma, String(h.titulo || ''), contenido,
    publicado.fecha_actualizacion, inicio);
  await anotarSubida({ resultado: 'publicado', nueva: !!publicado.nueva, tarjeta });
  try {
    await insertar('registro_lssi', { autor_id: autorId, accion: 'publicacion', ip });
  } catch (e) { console.error('moderar: registro_lssi', e.message); }

  // 13. Limpieza (nunca tumba la subida).
  await limpiar(h.id, carpeta);

  return res.status(200).json({
    ok: true,
    nueva: !!publicado.nueva,
    fecha_publicacion: publicado.fecha_publicacion,
    fecha_actualizacion: publicado.fecha_actualizacion,
    numero_autor: publicado.numero_autor ?? null, // v3.13
    numero_nuevo: !!publicado.numero_nuevo        // v3.13: true solo al publicar por primera vez
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
  // v3.11: también el conjunto lleva la lista (antes, "nunca la lista sin el Asistente", §6.2).
  return res.status(200).json({
    ...(m.resultado === 'conjunto' ? { total: (m.pasajes || []).length } : {}),
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
  if (!m || !['pasajes', 'limite_duro', 'conjunto'].includes(m.resultado)) return res.status(409).json({ error: 'SIN_PASAJES' }); // v3.11: conjunto
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
  await avisar('Locus Mundi: «Creo que es un error» (texto) pendiente', // v3.12
    `Libro: ${h.id}\nAutor: ${autorId}\nMotivo señalado: ${p.motivo_es || ''}\nPasaje: ${String(p.cita || '').slice(0, 400)}\nExplicación del Autor: ${explicacion}\n\nEstá en avisos_moderacion (pendiente). Resuélvelo con Claude.`
  ).catch(e => console.error('Aviso interno no enviado:', e.message));
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
  await avisar('Locus Mundi: «Creo que es un error» (imagen) pendiente', // v3.12
    `Libro: ${obj.historia.id}\nAutor: ${autorId}\nCategoría del rechazo: ${categoria}\nImagen: ${ruta}\nExplicación del Autor: ${explicacion}\n\nEstá en avisos_moderacion (pendiente). Resuélvelo con Claude.`
  ).catch(e => console.error('Aviso interno no enviado:', e.message));
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
