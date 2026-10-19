// lectura.js — Locus Mundi
// Versión 1 · 19/10/2026 · Fase B2, punto 14 (conversación 12).
// REGLAS COMUNES DE LECTURA: un solo archivo para la web (index.html, que lo carga con
// <script src="/lectura.js">) y para el generador del PDF (api/pdf.js, con require). Así la
// Biblioteca y el PDF muestran el libro con las mismas reglas: capítulos (¶), apartados (§),
// [FOTO n], cursiva, comillas por idioma, guiones y apóstrofo. Sacado sin cambios de index.html
// (64469f6): QUOTE_STYLES, toAngleQuotes, frenchQuoteSpaces, curlySingleQuotes, FOTO_MARK_RE,
// fotosColocadas, formatDashes, chapterNumToken, chapterWordNoNum y lo que necesitan; renderInline y
// renderStoryBody se partieron en dos: aquí, qué se muestra (trozosCursiva, bloquesLectura); en
// cada sitio, cómo se dibuja (React en la web, HTML en el PDF).
// SIN JSX ni dependencias: debe funcionar tal cual en el navegador y en Node.
// Si se cambia una regla, cambia en la web y en el PDF a la vez: probar los dos.
(function (raiz) {
  "use strict";

  var CHAPTER_SIGN = "¶", SECTION_SIGN = "§";

  // Palabras de capítulo en los idiomas de la plataforma, sin acentos. SOLO sirven para señalar
  // "posibles capítulos" escritos a mano y para "Renumerar"; nunca deciden la lectura (eso lo hace el ¶).
  var CHAPTER_WORDS_ANY = ["CAPITULO","CAPITOL","CHAPTER","CHAPITRE","KAPITEL","CAPITOLO","ГЛАВА","الفصل","अध्याय"];
  var foldUpper = function (s) { return s.normalize("NFD").replace(/[̀-ͯ]/g,"").toUpperCase(); };

  var fromRoman = function (s) { var v={I:1,V:5,X:10,L:50,C:100,D:500,M:1000}; var n=0;
    for(var i=0;i<s.length;i++){ var a=v[s[i]], b=v[s[i+1]]||0; n+= a<b ? -a : a; } return n; };
  // Número del capítulo: la SEGUNDA palabra de la cabecera ("CAPÍTULO III", "Chapter 2"), y solo
  // si es un número arábigo o un romano bien formado — para no tomar por número palabras como
  // "CIVIL" en "¶ GUERRA CIVIL" (capítulo sin número, que se deja tal cual).
  var ROMAN_OK = /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;
  var chapterNumToken = function (body) {
    var m = body.match(/^(\S+\s+)([IVXLCDM]+|\d+)(?=[\s.:]|$)/);
    if(!m) return null;
    var tok=m[2], arabic=/^\d+$/.test(tok);
    if(!arabic && !ROMAN_OK.test(tok)) return null;
    return { tok: tok, idx: m[1].length, arabic: arabic, n: arabic ? parseInt(tok,10) : fromRoman(tok) };
  };
  // Capítulo con ¶ que empieza por una palabra de capítulo pero no lleva número ("¶ CAPÍTULO: LA
  // GUERRA", "¶ CAPÍTULO"): devuelve dónde acaba la palabra. Solo si a la palabra le siguen dos
  // puntos, un punto o nada. (01/10)
  var chapterWordNoNum = function (body) {
    var m = body.match(/^([^\s:.]+)\s*([:.]|$)/);
    if(!m) return null;
    if(CHAPTER_WORDS_ANY.indexOf(foldUpper(m[1]))===-1) return null;
    return { idx: m[1].length };
  };

  // Cursiva: el editor la marca con guiones bajos, _así_ (también *así*, que a veces devuelve la
  // traducción por IA; **así** no se toca). Solo si va pegado a la palabra y no dentro de ella.
  // Devuelve trozos [{texto, cursiva}] en orden.
  function trozosCursiva(str){
    var re=/(^|[^\p{L}\p{N}_*])([_*])([^_*\n]+?)\2(?=$|[^\p{L}\p{N}_*])/gu;
    var out=[], last=0, m;
    while((m=re.exec(str))){
      var start=m.index+m[1].length;
      // Con asteriscos, el texto debe ir pegado a ellos ("3 * 4 * 5" no es cursiva).
      if(m[2]==="*" && /^\s|\s$/.test(m[3])){ re.lastIndex=start+1; continue; }
      if(start>last) out.push({texto:str.slice(last,start), cursiva:false});
      out.push({texto:m[3], cursiva:true});
      last=start+m[3].length+2;
      re.lastIndex=last;
    }
    if(last<str.length) out.push({texto:str.slice(last), cursiva:false});
    return out;
  }

  // Comillas del libro de estilo (§9bis, 01/10; ampliado el 03/10/2026, decisión B): cada pareja
  // de comillas rectas o curvas de un párrafo se muestra con las del idioma. No se toca un párrafo
  // que ya tiene « o „, ni uno con comillas desparejadas. Chino, japonés, árabe e hindi, tal cual.
  var QUOTE_STYLES = {
    ES:["«","»"], CA:["«","»"], GL:["«","»"], "PT-PT":["«","»"], IT:["«","»"], RU:["«","»"],
    FR:["« "," »"],          // francés: espacio fino inseparable por dentro
    EN:["“","”"], "PT-BR":["“","”"],
    DE:["„","“"]
  };
  function toAngleQuotes(str, lang){
    var st = lang && QUOTE_STYLES[lang];
    if(!st) return str;
    if(str.indexOf("«")!==-1 || str.indexOf("„")!==-1) return str;
    var n=(str.match(/["“”]/g)||[]).length;
    if(n===0 || n%2) return str;
    var open=true;
    return str.replace(/["“”]/g,function(){ var q=open?st[0]:st[1]; open=!open; return q; });
  }
  // Francés (04/10/2026): espacio fino inseparable SIEMPRE dentro de « ».
  function frenchQuoteSpaces(str){
    return str.replace(/«[\s  ]*/g,"« ").replace(/[\s  ]*»/g," »");
  }
  // [P16-B3] Apóstrofo y comillas simples curvos (12/10/2026; Estándar de Colección v2.1).
  function curlySingleQuotes(str){
    return String(str).replace(/(^|[\s(\[«“"‘„—–\-\/])'(?=[\p{L}\p{N}])/gu,"$1‘").replace(/'/g,"’");
  }

  // Marca [FOTO n] (y variantes de la traducción).
  var FOTO_MARK_RE = /^\[\s*([^\]\d\s][^\]\d]*?)\s*(\d+)\s*\]$/;
  // Solo se publican las fotos COLOCADAS en el texto (copia exacta de fotosColocadas de api/_tramos.js v2).
  function fotosColocadas(text){
    var colocadas=new Set();
    String(text||"").split("\n\n").forEach(function(raw){
      var m=raw.trim().match(FOTO_MARK_RE);
      if(m && /^(foto|photo)/i.test(m[1])) colocadas.add(m[2]);
    });
    return colocadas;
  }

  // Guiones al leer (diseño §8.3). Todos los idiomas salvo el inglés: un solo guion, el medio (–).
  //  1. "--" o "---" → –.   6. raya (—) → –.
  //  2. Guion al principio del párrafo → – pegado al texto (salvo un número negativo).
  //  3. Guion de inciso → –.   4. Guion de cierre al final del párrafo → se quita.
  //  5. No se tocan el guion entre letras o cifras sin espacios ni el de un número negativo.
  // Inglés (Estándar §9ter): la raya se respeta y "--" pasa a raya.
  function formatDashes(p, lang){
    if(String(lang||"").toUpperCase()==="EN") return p.replace(/-{2,3}/g,"—");
    var s=p.replace(/-{2,3}/g,"–").replace(/—/g,"–");
    s=s.replace(/^(\s*)[-–]\s*(?=\D)/,"$1–");                                  // 2
    s=s.replace(/(\s)-\s+(?=\S)/g,"$1– ")                                        // 3, a los dos lados
       .replace(/(\s)-(?=[^\s\d-])/g,"$1–")                                       // 3, espacio delante
       .replace(/([^\s-])-(?=\s)/g,"$1–")                                         // 3, espacio detrás
       .replace(/([\p{L}\p{N}])-(?=[.,;:])/gu,"$1–");                             // 3, ante puntuación
    s=s.replace(/(\s–[^–\n]*?[\p{L}\p{N}][^–\n]*?)–([.…!?»”"]*)\s*$/u,"$1$2");     // 4
    return s;
  }

  // QUÉ se muestra de un libro, bloque a bloque (antes, dentro de renderStoryBody). Devuelve, por
  // cada trozo separado por línea en blanco, uno de estos (o null si no se muestra nada):
  //   {tipo:"foto", foto}                      [FOTO n] con foto real detrás
  //   {tipo:"capitulo", etiqueta, titulo}      ¶ (etiqueta pequeña encima, p. ej. "CAPÍTULO I")
  //   {tipo:"apartado", texto}                 §
  //   {tipo:"parrafo", trozos:[{texto,cursiva}]}
  function bloquesLectura(text, fotos, lang){
    fotos = fotos || [];
    return String(text||"").split("\n\n").map(function(raw){
      var p = curlySingleQuotes(String(lang||"").toUpperCase()==="EN" ? raw : raw.replace(/—/g,"–")); // [P16-B3]
      var trimmed = p.trim();
      // Marcador [FOTO n]. Tolerante a propósito (la traducción puede decir [PHOTO 2]); exige una
      // palabra delante del número, para no confundir una línea como "[1990]".
      var fm = trimmed.match(FOTO_MARK_RE);
      var fmFoto = fm && fotos.find(function(x){ return String(x.orden)===fm[2]; });
      if(fm && !(fmFoto && fmFoto.url) && /^(foto|photo)/i.test(fm[1])) return null; // sin foto real: nada
      if(fmFoto && fmFoto.url) return {tipo:"foto", foto:fmFoto};
      if(trimmed.indexOf(CHAPTER_SIGN)===0){
        var body = trimmed.slice(CHAPTER_SIGN.length).trim();
        var idx = body.indexOf(":");
        // Capítulo sin número y sin dos puntos ("¶ PRÓLOGO"): título grande, sin etiqueta (01/10).
        var plainTitle = idx===-1 && !chapterNumToken(body) && !chapterWordNoNum(body);
        return {tipo:"capitulo",
          etiqueta: plainTitle ? "" : (idx>-1 ? body.slice(0,idx) : body),
          titulo: plainTitle ? body : (idx>-1 ? body.slice(idx+1).trim() : "")};
      }
      if(trimmed.indexOf(SECTION_SIGN)===0) return {tipo:"apartado", texto:trimmed.slice(SECTION_SIGN.length).trim()};
      var q = toAngleQuotes(formatDashes(p, lang), lang);
      return {tipo:"parrafo", trozos:trozosCursiva(lang==="FR" ? frenchQuoteSpaces(q) : q)};
    });
  }

  var LM_LECTURA = {
    version: 1,
    CHAPTER_SIGN: CHAPTER_SIGN, SECTION_SIGN: SECTION_SIGN, CHAPTER_WORDS_ANY: CHAPTER_WORDS_ANY,
    foldUpper: foldUpper, fromRoman: fromRoman, ROMAN_OK: ROMAN_OK,
    chapterNumToken: chapterNumToken, chapterWordNoNum: chapterWordNoNum,
    trozosCursiva: trozosCursiva, QUOTE_STYLES: QUOTE_STYLES, toAngleQuotes: toAngleQuotes,
    frenchQuoteSpaces: frenchQuoteSpaces, curlySingleQuotes: curlySingleQuotes,
    FOTO_MARK_RE: FOTO_MARK_RE, fotosColocadas: fotosColocadas, formatDashes: formatDashes,
    bloquesLectura: bloquesLectura
  };
  if (typeof module === "object" && module.exports) module.exports = LM_LECTURA;
  else raiz.LM_LECTURA = LM_LECTURA;
})(typeof window !== "undefined" ? window : this);
