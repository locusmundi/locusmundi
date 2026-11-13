// api/admin.js — Locus Mundi
// Versión 5.6 · 13/11/2026 · Leves (dd)+(ee) de «Suprimir»: (dd) si la cita no está tal cual, se busca sin la
//   puntuación ni los espacios de los extremos, con comillas, guiones y espacios tipográficos como iguales;
//   (ee) lo que se quita es siempre la frase o frases enteras que contienen la cita, nunca un trozo. Con
//   `previa: true` no cambia nada y devuelve lo que se quitaría (admin.html lo enseña y pide confirmación).
//   El aviso al Autor cita lo quitado y le dice que puede rehacer el pasaje (pasa por la revisión).
// Versión 5.5 · 13/11/2026 · Las respuestas a los correos al Autor y a quien denunció van a contacto@locusmundi.com
//   (antes, al Gmail del proyecto; ImprovMX las reenvía al mismo buzón). Nada más cambia.
// Versión 5.4 · 31/10/2026 · Firma corporativa (api/_firma.js) al pie de los correos al Autor y a quien denunció (todos
//   los de correo()): HTML con el logo y texto plano sin imagen. Sin el «Locus Mundi» final (lo dice la firma); la
//   identificación «Locus Mundi · Alastuey & Morera Asociados, S.L.» del 3.2 se conserva (Lista, pendiente r).
// Versión 5.3 · 29/10/2026 · Sin la dirección de producción de reserva (3 sitios): sin SUPABASE_URL, error
//   CONFIGURACION_INCOMPLETA en vez de ir a producción (Lista, pendiente h).
// Versión 5.2 · 28/10/2026 · Opción A de la retirada (Lista, 8.3). Marcas [R8.3].
//  - "retirar" pone además historias.retirada_en: el Autor ya no puede volver a subir el libro
//    (publicar_historia lo rechaza con LIBRO_RETIRADO; el editor muestra el aviso).
//    Original: solo estado_publicacion = "despublicado".
//  - Nueva acción "levantar": quita la marca (el libro NO se vuelve a publicar solo: el Autor lo sube
//    y pasa la revisión). Motivo obligatorio y admin_log, como las demás; con aviso_autor = true,
//    correo al Autor. Solo si el libro está retirado.
//  - El correo 3.3 de la retirada añade que no podrá volver a subirlo mientras siga retirado.
// Versión 5.1 · 28/10/2026 · Endurecimiento, pasada de la Lista (parte II), 8.3: al suprimir un pasaje,
//   un párrafo que queda con solo puntuación (la cita copiada sin su punto final) se borra también.
// Versión 5 · 25/10/2026 · Fase C, pendientes de index.html (II): denuncias (DSA, arts. 16 y 17;
// Locus_Mundi_Denuncias_DSA_v1.md, §2 y §3, de tú). Nuevas acciones, con la misma ADMIN_CLAVE:
//  - "suprimir": quita del texto, en las dos versiones, una cita exacta que aparezca una sola vez
//    (lo que antes exigía pegar el texto entero con "modificar"). Queda en admin_log.
//  - "resolver_denuncia": anota la decisión (siempre humana) en `denuncias` y envía el correo 3.2 a
//    quien denunció (si dio correo) y, si hay medida, el 3.3 al Autor, sin decirle quién denuncia.
//  - "retirar" y "suprimir" sin denuncia pueden avisar al Autor (3.3, "por iniciativa de Locus Mundi")
//    con aviso_autor = true. "modificar" no avisa (uso excepcional).
// Versión 4 · 22/10/2026 · Fase C (C2): GET ?clave=… devuelve el recuento de Autores, como hacía
// api/contador-autores.js (que se retira para dejar la plaza a api/pago.js; Hobby admite 12 funciones).
// Misma clave (CONTADOR_CLAVE). Lo demás, sin cambios.
// Versión 3 · 08/10/2026 · Diseño de la moderación v10, §11.13, punto 12. Cambio respecto a la
// v2: "modificar" sube en uno historias.revision (columna solo del servidor). Así el editor
// que el Autor tenga abierto se da cuenta, deja de autoguardar el texto antiguo y recarga el
// nuevo (index.html de la segunda subida). Nada más cambia.
// Versión 2 · 06/10/2026 · Diseño de la moderación v6, §4.3 y §11.8 (dos versiones de cada
// libro; decisión de Javier en la conversación de la primera subida).
// Acción de administrador sobre una historia: "retirar" (despublicar) o "modificar"
// (sustituir el texto completo). Protegido con ADMIN_CLAVE, propia y distinta de
// SUPABASE_SERVICE_ROLE_KEY y de CONTADOR_CLAVE. Cada uso queda registrado en
// admin_log con motivo obligatorio y el contenido anterior, por si hay que revisarlo.
// Solo se llama desde admin.html vía POST, nunca desde el navegador directamente.
//
// Cambios de la v2:
//  - "retirar": igual (pone "despublicado"); el disparador historias_retirar_publicacion
//    borra entonces la fila de publicaciones y el libro sale de la Biblioteca al instante.
//  - "modificar": cambia el texto EN LAS DOS VERSIONES, la que se escribe (historias) y la
//    que se lee (publicaciones), para que el Autor no pueda volver a subir el pasaje
//    retirado; después borra las traducciones de tramos que ya no existen (api/_tramos.js).
//    Antes solo cambiaba historias, que con dos versiones es solo el borrador.
//  - admin_log.contenido_anterior guarda las dos versiones anteriores: { escrito, publicado }.
//  - historia_id debe ser un identificador válido; SUPABASE_URL de las variables de entorno.

const { conFirma } = require("./_firma"); // v5.4
const { huellasVigentes } = require("./_tramos"); // compartido con traducir.js y moderar.js

// v5: quita una cita del texto y arregla los espacios que deja.
// v5.1: si la cita deja un párrafo con solo puntuación (p. ej. el punto final no copiado), se quita también.
// Original: sin la línea de los párrafos de solo puntuación.
// v5.6 (dd)+(ee): dónde está la cita y qué frase(s) enteras la contienen. Devuelve { exacta } con el
// texto tal cual aparece (para quitarlo con quitarCita) o { error }.
const COMILLAS = "\"'«»“”‘’„", GUIONES = "-‐–—";
function patronFlexible(cita) {
  const limpia = String(cita).replace(/^[\s.,;:!?…«»“”‘’„"'()\[\]\-‐–—]+|[\s.,;:!?…«»“”‘’„"'()\[\]\-‐–—]+$/g, "");
  if (limpia.length < 3) return null;
  let p = "";
  for (const ch of limpia) {
    if (/\s/.test(ch)) { if (!p.endsWith("\\s+")) p += "\\s+"; }
    else if (COMILLAS.includes(ch)) p += "[" + COMILLAS.replace(/[\]\\^-]/g, "\\$&") + "]";
    else if (GUIONES.includes(ch)) p += "[\\-‐–—]";
    else p += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(p, "g");
}
function ampliarAFrases(texto, ini, fin) {
  const parIni = texto.lastIndexOf("\n\n", ini - 1) + 1 > 0 ? texto.lastIndexOf("\n\n", ini - 1) + 2 : 0;
  let parFin = texto.indexOf("\n\n", fin); if (parFin === -1) parFin = texto.length;
  const par = texto.slice(parIni, parFin);
  // Fin de frase: . ! ? … (y comillas o paréntesis de cierre) seguidos de espacio y de algo que empieza en
  // mayúscula o cifra (también tras raya o comillas). «¿Vienes? —preguntó» no corta.
  const cortes = [];
  const re = /[.!?…]+[»”"’)\]]*(?=\s+[«“"‘(\-‐–—]*[\p{Lu}\p{N}¿¡])/gu;
  let m; while ((m = re.exec(par))) cortes.push(parIni + m.index + m[0].length);
  let a = parIni; for (const c of cortes) if (c <= ini) a = c;
  let b = parFin; for (const c of cortes) if (c >= fin) { b = c; break; }
  // Si la cita acaba justo antes de su punto, el punto va con ella.
  const resto = texto.slice(fin, b);
  if (b === parFin && /^[.!?…»”"’)\]\s]*$/.test(resto)) b = parFin;
  return texto.slice(a, b).trim();
}
function localizarPasaje(texto, cita) {
  cita = String(cita || "");
  let ini = -1, fin = -1;
  const veces = cita.trim().length >= 3 ? texto.split(cita).length - 1 : 0;
  if (veces === 1) { ini = texto.indexOf(cita); fin = ini + cita.length; }
  else if (veces > 1) return { error: `La cita aparece ${veces} veces: alárgala para que sea única.` };
  else {
    const re = patronFlexible(cita);
    if (!re) return { error: "La cita es demasiado corta." };
    const hall = [...texto.matchAll(re)];
    if (hall.length > 1) return { error: `La cita aparece ${hall.length} veces: alárgala para que sea única.` };
    if (!hall.length) return { error: "La cita no está en el texto escrito (ni siquiera sin la puntuación de los extremos)." };
    ini = hall[0].index; fin = ini + hall[0][0].length;
  }
  const exacta = ampliarAFrases(texto, ini, fin);
  if (texto.split(exacta).length - 1 !== 1) return { error: "No se ha podido aislar la frase: cópiala entera." };
  return { exacta };
}

function quitarCita(texto, cita) {
  return texto.replace(cita, "").replace(/[ \t]{2,}/g, " ").replace(/ +([.,;:!?»”)])/g, "$1")
    .replace(/(^|\n)[ \t]*[.,;:!?…»”"')\]]+[ \t]*(?=\n|$)/g, "$1")
    .replace(/[ \t]+(?=\n|$)/g, "").replace(/(^|\n)[ \t]+/g, "$1") // v5.6: sin espacios al principio ni al final de un párrafo
    .replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async function handler(req, res) {
  if (!process.env.SUPABASE_URL) return res.status(500).json({ error: "CONFIGURACION_INCOMPLETA" }); // v5.3: sin dirección de reserva
  // v4: recuento de Autores (antes api/contador-autores.js, con su misma clave CONTADOR_CLAVE).
  if (req.method === "GET") {
    if (!process.env.CONTADOR_CLAVE || req.query.clave !== process.env.CONTADOR_CLAVE) {
      res.status(403).send("No autorizado");
      return;
    }
    try {
      const SB = process.env.SUPABASE_URL;
      const r = await fetch(`${SB}/rest/v1/autores?select=id`, {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          Prefer: "count=exact",
          Range: "0-0",
        },
      });
      const contentRange = r.headers.get("content-range"); // ej. "0-0/12"
      const total = contentRange ? contentRange.split("/")[1] : "?";
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.status(200).send(`Autores registrados en Locus Mundi: ${total}`);
    } catch (err) {
      res.status(500).send("Error al consultar Supabase");
    }
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido" });
    return;
  }

  const { clave, accion, motivo, realizado_por } = req.body || {};
  let { historia_id, nuevo_texto } = req.body || {};

  if (!process.env.ADMIN_CLAVE || clave !== process.env.ADMIN_CLAVE) {
    res.status(403).json({ error: "Clave incorrecta" });
    return;
  }
  if (accion === "resolver_denuncia") {
    try { await resolverDenuncia(req.body, res); }
    catch (err) { res.status(500).json({ error: err.message }); }
    return;
  }
  if (!historia_id || !accion || !motivo || !realizado_por) {
    res.status(400).json({ error: "Faltan datos (historia_id, accion, motivo, realizado_por)" });
    return;
  }
  if (!UUID.test(String(historia_id).trim())) {
    res.status(400).json({ error: "El id de la historia no es válido" });
    return;
  }
  if (!["retirar", "modificar", "suprimir", "levantar"].includes(accion)) { // [R8.3] "levantar"
    res.status(400).json({ error: "Acción no reconocida" });
    return;
  }
  if (accion === "modificar" && !nuevo_texto) {
    res.status(400).json({ error: "Falta nuevo_texto para la acción modificar" });
    return;
  }

  const id = String(historia_id).trim().toLowerCase();
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const headers = {
    "Content-Type": "application/json",
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  };

  try {
    // Las dos versiones actuales.
    const getRes = await fetch(
      `${SUPABASE_URL}/rest/v1/historias?id=eq.${id}&select=id,contenido,estado_publicacion,revision,retirada_en`,
      { headers }
    );
    if (!getRes.ok) throw new Error("Error al leer la historia: " + (await getRes.text()));
    const rows = await getRes.json();
    if (!rows || !rows.length) {
      res.status(404).json({ error: "Historia no encontrada" });
      return;
    }
    const historiaActual = rows[0];
    // [R8.3] "levantar" solo tiene sentido con la marca puesta.
    if (accion === "levantar" && !historiaActual.retirada_en) {
      res.status(409).json({ error: "Este libro no está retirado: no hay nada que levantar." });
      return;
    }

    // v5: "suprimir" = "modificar" con el texto sin la cita (que debe aparecer una sola vez).
    let accionReal = accion;
    if (accion === "suprimir") {
      const texto = String((historiaActual.contenido && historiaActual.contenido.text) || "");
      const loc = localizarPasaje(texto, req.body.cita); // v5.6 (dd)+(ee)
      if (loc.error) { res.status(400).json({ error: loc.error }); return; }
      if (req.body.previa === true) { res.status(200).json({ previa: loc.exacta }); return; } // v5.6: sin cambiar nada
      req.body.cita = loc.exacta; // lo que se quita (y se cita al Autor y en admin_log): la frase entera
      nuevo_texto = quitarCita(texto, loc.exacta);
      accionReal = "modificar";
    }

    const pubRes = await fetch(
      `${SUPABASE_URL}/rest/v1/publicaciones?historia_id=eq.${id}&select=titulo,contenido`,
      { headers }
    );
    if (!pubRes.ok) throw new Error("Error al leer lo publicado: " + (await pubRes.text()));
    const publicada = (await pubRes.json())[0] || null;

    let avisoTraducciones = "";
    if (accionReal === "retirar") {
      const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/historias?id=eq.${id}`, {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=minimal" },
        // [R8.3] con la marca (original: solo estado_publicacion).
        body: JSON.stringify({ estado_publicacion: "despublicado", retirada_en: new Date().toISOString() }),
      });
      if (!patchRes.ok) throw new Error("Error al retirar la historia: " + (await patchRes.text()));
    } else if (accionReal === "levantar") { // [R8.3]
      const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/historias?id=eq.${id}`, {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify({ retirada_en: null }),
      });
      if (!patchRes.ok) throw new Error("Error al levantar la retirada: " + (await patchRes.text()));
    } else {
      // 1. Lo que se escribe.
      const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/historias?id=eq.${id}`, {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify({
          contenido: { ...(historiaActual.contenido || {}), text: nuevo_texto },
          revision: (Number(historiaActual.revision) || 0) + 1, // v3
        }),
      });
      if (!patchRes.ok) throw new Error("Error al modificar la historia: " + (await patchRes.text()));

      // 2. Lo que se lee, si está publicado.
      if (publicada) {
        // v5: al suprimir, se quita la cita de lo publicado por separado (si está una vez), para no
        // publicar de paso los cambios que el Autor aún no ha subido.
        let textoPublicado = nuevo_texto;
        if (accion === "suprimir") {
          const tp = String((publicada.contenido && publicada.contenido.text) || "");
          textoPublicado = tp.split(req.body.cita).length - 1 === 1 ? quitarCita(tp, req.body.cita) : tp;
        }
        const nuevaPublicada = { ...publicada, contenido: { ...(publicada.contenido || {}), text: textoPublicado } };
        const pRes = await fetch(`${SUPABASE_URL}/rest/v1/publicaciones?historia_id=eq.${id}`, {
          method: "PATCH",
          headers: { ...headers, Prefer: "return=minimal" },
          body: JSON.stringify({ contenido: nuevaPublicada.contenido, fecha_actualizacion: new Date().toISOString() }),
        });
        if (!pRes.ok) {
          throw new Error("El borrador se modificó, pero lo publicado NO: " + (await pRes.text()) +
            ". Repite la acción o usa \"retirar\".");
        }

        // 3. Traducciones del texto que ya no se lee.
        try {
          const vigentes = huellasVigentes(nuevaPublicada);
          const dRes = await fetch(
            `${SUPABASE_URL}/rest/v1/traducciones_cache?historia_id=eq.${id}&huella=not.in.(${vigentes.join(",")})`,
            { method: "DELETE", headers: { ...headers, Prefer: "return=minimal" } }
          );
          if (!dRes.ok) throw new Error(await dRes.text());
        } catch (e) {
          avisoTraducciones = " OJO: no se pudieron borrar las traducciones antiguas (" + e.message +
            "); repite la acción.";
        }
      }
    }

    const logRes = await fetch(`${SUPABASE_URL}/rest/v1/admin_log`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({
        historia_id: id,
        accion,
        motivo,
        realizado_por,
        contenido_anterior: {
          retirada_en: historiaActual.retirada_en || null, // [R8.3]
          escrito: historiaActual.contenido,
          publicado: publicada ? publicada.contenido : null,
        },
      }),
    });
    if (!logRes.ok) {
      throw new Error("Acción aplicada, pero el registro en admin_log falló: " + (await logRes.text()));
    }

    // v5: aviso al Autor (3.3) por iniciativa propia, si se pide.
    let avisoAutor = "";
    if (req.body.aviso_autor === true && (accion === "retirar" || accion === "suprimir")) {
      try {
        await avisarAutor(id, {
          medida: accion === "retirar" ? "libro_retirado" : "pasaje_suprimido",
          cita: req.body.cita, motivo_decision: motivo, base: req.body.base, origen: "iniciativa",
        });
        avisoAutor = " Aviso enviado al Autor.";
      } catch (e) { avisoAutor = " OJO: no se pudo avisar al Autor (" + e.message + ")."; }
    }
    // [R8.3] aviso de que se levanta la retirada, si se pide.
    if (req.body.aviso_autor === true && accion === "levantar") {
      try { await avisarLevantada(id); avisoAutor = " Aviso enviado al Autor."; }
      catch (e) { avisoAutor = " OJO: no se pudo avisar al Autor (" + e.message + ")."; }
    }

    const alcance = accion === "levantar" // [R8.3]
      ? " (el Autor ya puede volver a subirlo; no se ha publicado)"
      : accion !== "retirar"
      ? (publicada ? " (texto cambiado en lo escrito y en lo publicado)" : " (el libro no está publicado: cambiado solo lo escrito)")
      : "";
    res.status(200).json({ ok: true, mensaje: `Acción "${accion}" aplicada y registrada${alcance}.${avisoTraducciones}${avisoAutor}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ---------------------------------------------------------------------------------------------
// v5: denuncias y avisos (Locus_Mundi_Denuncias_DSA_v1.md, §3; de tú).

const SBU = () => process.env.SUPABASE_URL;
const sbH = (extra) => ({
  "Content-Type": "application/json",
  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  ...(extra || {}),
});
const INTERNO = "contactlocusmundi@gmail.com";
const DECISIONES = {
  sin_accion: "no se toma ninguna medida",
  pasaje_suprimido: "se ha suprimido el pasaje denunciado",
  libro_retirado: "se ha retirado la obra de la Biblioteca",
};
const fechaES = (d) => new Date(d).toLocaleDateString("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "long", year: "numeric" });

async function correo(to, subject, text) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Locus Mundi <avisos@locusmundi.com>", to, reply_to: "contacto@locusmundi.com", subject, ...conFirma(text) }) /* v5.5 */, // v5.4: html y text con la firma
  });
  if (!r.ok) throw new Error(await r.text());
}

// Correo 3.3 al Autor. medida: "pasaje_suprimido" | "libro_retirado"; origen: "denuncia" | "iniciativa".
// [R8.3] Libro y Autor para los correos (antes, dentro de avisarAutor).
async function libroYAutor(historiaId) {
  const h = await fetch(`${SBU()}/rest/v1/historias?id=eq.${historiaId}&select=titulo,contenido,autor_id`, { headers: sbH() });
  const libro = h.ok ? (await h.json())[0] : null;
  if (!libro || !libro.autor_id) throw new Error("libro o Autor no encontrado");
  const a = await fetch(`${SBU()}/rest/v1/autores?id=eq.${libro.autor_id}&select=email,nombre`, { headers: sbH() });
  const autor = a.ok ? (await a.json())[0] : null;
  if (!autor || !autor.email) throw new Error("el Autor no tiene correo");
  const titulo = libro.titulo || (libro.contenido && libro.contenido.title) || "sin título";
  const nombre = String(autor.nombre || "").trim().split(/\s+/)[0];
  return { email: autor.email, titulo, nombre };
}

// [R8.3] Correo al Autor cuando se levanta la retirada.
async function avisarLevantada(historiaId) {
  const { email, titulo, nombre } = await libroYAutor(historiaId);
  await correo(email, `Tu libro «${titulo}» ya puede volver a la Biblioteca`,
    `Hola${nombre ? ", " + nombre : ""}. Locus Mundi ha levantado la retirada de tu libro «${titulo}». ` +
    `Ya puedes volver a subirlo a la Biblioteca; antes de publicarse pasará la revisión habitual.`); // v5.4: sin «Locus Mundi» (firma)
}

async function avisarAutor(historiaId, { medida, cita, motivo_decision, base, origen }) {
  const { email, titulo, nombre } = await libroYAutor(historiaId); // [R8.3]
  const pasaje = medida === "pasaje_suprimido";
  const text =
    `Hola${nombre ? ", " + nombre : ""}. Te informamos de que Locus Mundi ha ${pasaje ? "suprimido un pasaje de" : "retirado de la Biblioteca"} tu libro «${titulo}» el ${fechaES(new Date())}.` +
    (pasaje && cita ? ` El pasaje suprimido es: «${String(cita).trim()}».` : "") +
    `\n\nMotivo: ${motivo_decision}. Base: ${base || "apartado 4 de las Condiciones de Publicación"}. ` +
    `La decisión se ha tomado ${origen === "denuncia" ? "a raíz de una denuncia" : "por iniciativa de Locus Mundi"}, y la ha tomado una persona, sin medios automatizados.` +
    `\n\nSi no estás de acuerdo, responde a este correo con tus razones y la revisaremos. También puedes acudir a los tribunales. ` +
    (pasaje ? "Tu libro sigue publicado sin ese pasaje. Si quieres, puedes reescribirlo y volver a subir el libro: pasará la revisión habitual. " /* v5.6 */ : "Puedes seguir trabajando en él, pero no podrás volver a subirlo mientras siga retirado. ") + // [R8.3]
    `Lo demás de tu cuenta sigue igual.`; // v5.4: sin «Locus Mundi» (firma)
  await correo(email, `Cambio en tu libro «${titulo}»`, text);
}

async function resolverDenuncia(b, res) {
  const { clave, realizado_por, decision, motivo_decision, base, cita } = b || {};
  if (!process.env.ADMIN_CLAVE || clave !== process.env.ADMIN_CLAVE) { res.status(403).json({ error: "Clave incorrecta" }); return; }
  const ref = String(b.denuncia || "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$/.test(ref)) { res.status(400).json({ error: "Referencia de denuncia no válida (8 caracteres o el id completo)" }); return; }
  if (!DECISIONES[decision] || !motivo_decision || !realizado_por) { res.status(400).json({ error: "Faltan datos (decisión, motivo, responsable)" }); return; }

  // La referencia corta son los 8 primeros caracteres del id.
  const filtro = ref.length === 36 ? `id=eq.${ref}` : `id=gte.${ref}-0000-0000-0000-000000000000&id=lte.${ref}-ffff-ffff-ffff-ffffffffffff`;
  const r = await fetch(`${SBU()}/rest/v1/denuncias?${filtro}&select=*`, { headers: sbH() });
  const filas = r.ok ? await r.json() : [];
  if (filas.length !== 1) { res.status(404).json({ error: filas.length ? "Hay varias denuncias con esa referencia: usa el id completo" : "Denuncia no encontrada" }); return; }
  const d = filas[0];
  if (d.estado === "resuelta") { res.status(409).json({ error: "Esta denuncia ya está resuelta" }); return; }
  if (decision !== "sin_accion" && !d.historia_id) { res.status(400).json({ error: "La denuncia no tiene libro asociado: no se puede avisar al Autor" }); return; }

  const ahora = new Date().toISOString();
  const cambios = { estado: "resuelta", decision, motivo_decision: String(motivo_decision).trim(), decidida_en: ahora };
  const avisos = [];

  // 3.2, a quien denunció.
  if (d.email) {
    const corto = String(d.id).slice(0, 8).toUpperCase();
    try {
      await correo(d.email, `Decisión sobre tu denuncia ${corto}`,
        `Hemos estudiado tu denuncia sobre ${d.referencia.replace(/ · .*$/, "")}. Decisión: ${DECISIONES[decision]}. Motivo: ${cambios.motivo_decision}. La decisión la ha tomado una persona, sin medios automatizados.` +
        `\n\nSi no estás de acuerdo, puedes responder a este correo con nuevos elementos y la revisaremos, o acudir a los tribunales. Si la denuncia afecta a tus datos personales, también puedes reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).` +
        `\n\nLocus Mundi · Alastuey & Morera Asociados, S.L.`);
      cambios.decision_enviada_en = new Date().toISOString();
      avisos.push("decisión enviada a quien denunció");
    } catch (e) { avisos.push("OJO: no se pudo enviar la decisión a quien denunció (" + e.message + ")"); }
  } else avisos.push("denuncia anónima: no hay a quién enviar la decisión");

  // 3.3, al Autor, solo si hay medida.
  if (decision !== "sin_accion") {
    try {
      await avisarAutor(d.historia_id, { medida: decision, cita, motivo_decision: cambios.motivo_decision, base, origen: "denuncia" });
      cambios.aviso_autor_enviado_en = new Date().toISOString();
      avisos.push("aviso enviado al Autor");
    } catch (e) { avisos.push("OJO: no se pudo avisar al Autor (" + e.message + ")"); }
  }

  const u = await fetch(`${SBU()}/rest/v1/denuncias?id=eq.${d.id}`, { method: "PATCH", headers: sbH({ Prefer: "return=minimal" }), body: JSON.stringify(cambios) });
  if (!u.ok) throw new Error("Correos enviados, pero no se pudo anotar la decisión: " + (await u.text()));

  await fetch(`${SBU()}/rest/v1/admin_log`, {
    method: "POST", headers: sbH({ Prefer: "return=minimal" }),
    body: JSON.stringify({ historia_id: d.historia_id, accion: "resolver_denuncia", motivo: `${decision}: ${cambios.motivo_decision}`, realizado_por, contenido_anterior: { denuncia: d.id } }),
  }).catch(() => {});

  res.status(200).json({ ok: true, mensaje: `Denuncia ${String(d.id).slice(0, 8).toUpperCase()} resuelta (${DECISIONES[decision]}): ${avisos.join("; ")}.` });
}
