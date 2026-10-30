// LOCUS MUNDI — «Cómo funciona» / «How it works» (v1, 30/10/2026)
// Presentación por pantallas: se elige «Leer» (3) o «Escribir» (10). Solo se carga al pulsar el enlace
// del Inicio (index.html, ComoFuncionaEnlace). Capturas en /como-funciona/<es|en>-<leer|escribir>-<n>.webp (4:3).
// Textos cerrados con Javier (Continuidad, sesión «30/10/2026 (mejoras de la web, parte 1)», punto 3).
// Sin JSX: React.createElement, con el React de la página.
(function(){
  "use strict";
  var h = React.createElement, useState = React.useState, useEffect = React.useEffect, useRef = React.useRef;

  var TEXTOS = {
    ES: {
      titulo: "Cómo funciona", pregunta: "¿Qué quieres hacer?",
      leer: "Leer", escribir: "Escribir", leerSub: "3 pantallas", escribirSub: "10 pantallas",
      anterior: "‹ Anterior", siguiente: "Siguiente ›", volver: "‹ Volver", de: "de", cerrar: "Cerrar",
      fin: { leer: "Ir a la Biblioteca", escribir: "Escribe tu historia" },
      leerP: [
        ["Inicio", "Locus Mundi es una biblioteca de historias contadas por quienes las vivieron. Leer es gratis y no hace falta cuenta."],
        ["Biblioteca", "En la «Biblioteca», las historias más recientes salen primero. Busca por nombre, título, país, ciudad o profesión, y pulsa una tarjeta para abrir el libro."],
        ["Lectura", "Lee el libro en su idioma original o pulsa «Traducir y leer» para leerlo en el tuyo. También puedes agrandar la letra."]
      ],
      escribirP: [
        ["Crear la cuenta", "Pulsa «Escribe tu historia» y crea tu cuenta: correo, contraseña y tu nombre completo, que no se publica. Es gratis."],
        ["Revisa tu correo", "Te enviamos un enlace: ábrelo para entrar por primera vez. Si no lo ves, mira en la carpeta de spam."],
        ["Datos del libro", "Elige tu nombre de Autor (así firmarás), el título y, si quieres, una portada. Todo se puede cambiar después."],
        ["Condiciones de Publicación", "Léelas con calma: son cortas. Acéptalas y empieza a escribir."],
        ["El editor", "Empieza donde quieras y ordena tu historia en capítulos con «+ Capítulo» y en apartados con «+ Apartado». Todo se guarda solo mientras escribes."],
        ["Fotos", "Añade fotografías a tu libro y colócalas donde quieras del texto, con su pie. Cuestan 1 € cada una, en lotes de 5, y caben hasta 20 por libro. La portada es gratis."],
        ["Dales vida a tus fotos viejas", "Con el editor de fotos con IA puedes restaurar una foto vieja (rayas, manchas, luz), darle color o las dos cosas. Pasarla a blanco y negro o a sepia es gratis."],
        ["El Asistente editorial (opcional)", "Si quieres ayuda, el Asistente editorial te corrige, te ayuda a ordenar y te escucha si prefieres dictar. Pagas solo lo que usas, desde 5 €."],
        ["Tu libro en PDF", "Crea un archivo PDF de tu libro, en DIN A4 o A5, para imprimirlo o regalarlo. Cuesta 5 €, con 15 descargas."],
        ["Publica mientras escribes", "No esperes a terminar: sube ya a la Biblioteca tus primeras páginas y recibirás tu número de Autor. Antes, una revisión automática comprueba el texto. Después, sigue escribiendo y sube los cambios cuando quieras. También puedes compartir el enlace de tu libro con tus contactos."]
      ]
    },
    EN: {
      titulo: "How it works", pregunta: "What would you like to do?",
      leer: "Read", escribir: "Write", leerSub: "3 screens", escribirSub: "10 screens",
      anterior: "‹ Previous", siguiente: "Next ›", volver: "‹ Back", de: "of", cerrar: "Close",
      fin: { leer: "Go to the Library", escribir: "Write your story" },
      leerP: [
        ["Home", "Locus Mundi is a library of stories told by those who lived them. Reading is free, and you don't need an account."],
        ["Library", "In the “Library”, the newest stories come first. Search by name, title, country, city or profession, and tap a card to open the book."],
        ["Reading", "Read the book in its original language, or tap “Translate and read” to read it in yours. You can also make the text larger."]
      ],
      escribirP: [
        ["Create your account", "Tap “Write your story” and create your account: email, password and your full name, which is never shown. It's free."],
        ["Check your email", "We'll send you a link: open it to sign in for the first time. If you can't see it, check your spam folder."],
        ["Your book's details", "Choose your Author name (how you'll sign your book), a title and, if you like, a cover. You can change everything later."],
        ["Publication Terms", "Take your time: they're short. Accept them and start writing."],
        ["The editor", "Start wherever you like and organise your story into chapters with “+ Chapter” and sections with “+ Section”. Everything saves itself as you write."],
        ["Photos", "Add photos to your book and place them anywhere in the text, with a caption. They cost €1 each, in sets of 5, up to 20 per book. The cover is free."],
        ["Bring your old photos to life", "With the AI photo editor you can restore an old photo (scratches, stains, lighting), colour it, or both. Switching to black and white or sepia is free."],
        ["The editorial Assistant (optional)", "If you'd like help, the editorial Assistant corrects, helps you organise and listens if you'd rather dictate. You only pay for what you use, from €5."],
        ["Your book as a PDF", "Create a PDF of your book, in A4 or A5, to print it or give it as a gift. It costs €5, with 15 downloads."],
        ["Publish as you write", "Don't wait until you've finished: upload your first pages to the Library now and you'll receive your Author number. First, an automatic review checks the text. Then keep writing and upload your changes whenever you like. You can also share your book's link with your contacts."]
      ]
    }
  };
  var VISTA_FINAL = { leer: "library", escribir: "write" };
  var img = function(L, recorrido, n){ return "/como-funciona/" + L.toLowerCase() + "-" + recorrido + "-" + n + ".webp"; };

  var CSS = [
    ".cf-ov{position:fixed;inset:0;z-index:1000;background:rgba(26,14,7,0.55);display:flex;align-items:center;justify-content:center;padding:1.2rem}",
    ".cf-caja{position:relative;background:var(--bg3,#FBF7EE);width:100%;max-width:760px;max-height:calc(100vh - 2.4rem);overflow:auto;border-radius:3px;box-shadow:0 12px 40px rgba(26,14,7,0.35);padding:1.6rem 1.8rem 1.4rem;display:flex;flex-direction:column}",
    ".cf-x{position:absolute;top:0.55rem;right:0.7rem;border:none;background:none;font-size:1.5rem;line-height:1;color:var(--muted,#7a6a58);cursor:pointer;padding:0.3rem 0.5rem}",
    ".cf-h{font-family:var(--serif,serif);font-size:1.9rem;font-weight:500;color:var(--ink,#1A0E07);margin:0 0 0.3rem}",
    ".cf-p{font-family:var(--body,serif);color:var(--muted,#7a6a58);margin:0 0 1.4rem}",
    ".cf-elige{display:grid;grid-template-columns:1fr 1fr;gap:1rem}",
    ".cf-op{font-family:var(--body,serif);border:1px solid var(--border,#d8c7a3);background:var(--bg2,#F7F0E0);padding:1.6rem 1rem;cursor:pointer;border-radius:2px;text-align:center;transition:border-color .2s}",
    ".cf-op:hover{border-color:var(--gold,#C4932A)}",
    ".cf-op b{display:block;font-family:var(--serif,serif);font-size:1.6rem;font-weight:500;color:var(--navy,#1B3A6B)}",
    ".cf-op span{font-size:0.85rem;color:var(--muted,#7a6a58)}",
    ".cf-volver{align-self:flex-start;border:none;background:none;font-family:var(--body,serif);font-size:0.85rem;color:var(--muted,#7a6a58);cursor:pointer;padding:0 0 0.7rem}",
    ".cf-img{width:100%;aspect-ratio:4/3;background:var(--bg,#EDE0C4);border:1px solid var(--border,#d8c7a3);display:block;object-fit:contain}",
    ".cf-t{font-family:var(--serif,serif);font-size:1.45rem;font-weight:500;color:var(--ink,#1A0E07);margin:1rem 0 0.35rem}",
    ".cf-x2{font-family:var(--body,serif);font-size:1.02rem;line-height:1.6;color:var(--ink,#1A0E07);margin:0;min-height:4.9em}",
    ".cf-pie{display:flex;align-items:center;justify-content:space-between;gap:0.8rem;margin-top:1rem}",
    ".cf-b{font-family:var(--body,serif);font-size:0.9rem;padding:0.5rem 1rem;border-radius:2px;cursor:pointer;border:1px solid var(--navy,#1B3A6B);background:transparent;color:var(--navy,#1B3A6B);white-space:nowrap}",
    ".cf-b.cf-sig{background:var(--navy,#1B3A6B);color:#fff}",
    ".cf-b.cf-fin{background:var(--gold,#C4932A);border-color:var(--gold,#C4932A);color:#fff}",
    ".cf-b[disabled]{visibility:hidden}",
    ".cf-puntos{display:flex;flex-direction:column;align-items:center;gap:0.3rem;font-family:var(--body,serif);font-size:0.8rem;color:var(--muted,#7a6a58)}",
    ".cf-puntos i{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--border,#d8c7a3);margin:0 3px}",
    ".cf-puntos i.on{background:var(--navy,#1B3A6B)}",
    "@media(max-width:680px){.cf-ov{padding:0}.cf-caja{max-width:none;height:100%;max-height:none;border-radius:0;padding:1rem 1rem 0.8rem}",
    ".cf-h{font-size:1.6rem;margin-top:1.4rem}.cf-t{font-size:1.25rem;margin-top:0.8rem}.cf-x2{font-size:0.98rem;min-height:0}",
    ".cf-pie{margin-top:auto;padding-top:0.9rem}.cf-b{padding:0.5rem 0.75rem;font-size:0.86rem}.cf-puntos i{width:6px;height:6px;margin:0 2px}",
    ".cf-elige{grid-template-columns:1fr}}"
  ].join("\n");
  function ponerCss(){
    if (document.getElementById("cf-css")) return;
    var s = document.createElement("style"); s.id = "cf-css"; s.textContent = CSS; document.head.appendChild(s);
  }

  function ComoFunciona(props){
    var L = props.lang === "EN" ? "EN" : "ES";
    var tx = TEXTOS[L];
    var st = useState(null), recorrido = st[0], setRecorrido = st[1];   // null | "leer" | "escribir"
    var sp = useState(0), paso = sp[0], setPaso = sp[1];
    var cajaRef = useRef(null), toque = useRef(null);
    var pantallas = recorrido ? tx[recorrido + "P"] : [];
    var total = pantallas.length, ultimo = paso === total - 1;

    useEffect(function(){ ponerCss(); var prev = document.body.style.overflow; document.body.style.overflow = "hidden";
      if (cajaRef.current) cajaRef.current.focus();
      return function(){ document.body.style.overflow = prev; }; }, []);
    // Teclado: Esc cierra; flechas, pantalla anterior o siguiente.
    useEffect(function(){
      var tecla = function(e){
        if (e.key === "Escape") { props.onClose(); return; }
        if (!recorrido) return;
        if (e.key === "ArrowRight") setPaso(function(p){ return Math.min(total - 1, p + 1); });
        if (e.key === "ArrowLeft") setPaso(function(p){ return Math.max(0, p - 1); });
      };
      window.addEventListener("keydown", tecla);
      return function(){ window.removeEventListener("keydown", tecla); };
    }, [recorrido, total]);
    // La captura siguiente se pide por adelantado, para que no tarde al pasar.
    useEffect(function(){ if (recorrido && paso + 1 < total) { var i = new Image(); i.src = img(L, recorrido, paso + 2); } }, [recorrido, paso, L]);

    var elegir = function(r){ setRecorrido(r); setPaso(0); };
    var inicioToque = function(e){ var t = e.touches && e.touches[0]; toque.current = t ? { x:t.clientX, y:t.clientY } : null; };
    var finToque = function(e){
      var a = toque.current, t = e.changedTouches && e.changedTouches[0]; toque.current = null;
      if (!a || !t || !recorrido) return;
      var dx = t.clientX - a.x, dy = t.clientY - a.y;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0) setPaso(function(p){ return Math.min(total - 1, p + 1); });
      else setPaso(function(p){ return Math.max(0, p - 1); });
    };

    var contenido;
    if (!recorrido) {
      contenido = [
        h("h2", { key:"h", className:"cf-h", id:"cf-titulo" }, tx.titulo),
        h("p", { key:"p", className:"cf-p" }, tx.pregunta),
        h("div", { key:"e", className:"cf-elige" },
          h("button", { type:"button", className:"cf-op", onClick:function(){ elegir("leer"); } }, h("b", null, tx.leer), h("span", null, tx.leerSub)),
          h("button", { type:"button", className:"cf-op", onClick:function(){ elegir("escribir"); } }, h("b", null, tx.escribir), h("span", null, tx.escribirSub)))
      ];
    } else {
      var pant = pantallas[paso], puntos = [];
      for (var k = 0; k < total; k++) puntos.push(h("i", { key:k, className: k === paso ? "on" : "" }));
      contenido = [
        h("button", { key:"v", type:"button", className:"cf-volver", onClick:function(){ setRecorrido(null); } }, tx.volver),
        h("img", { key:"i" + recorrido + paso, className:"cf-img", src: img(L, recorrido, paso + 1), alt: pant[0] }),
        h("h3", { key:"t", className:"cf-t", id:"cf-titulo" }, pant[0]),
        h("p", { key:"x", className:"cf-x2" }, pant[1]),
        h("div", { key:"pie", className:"cf-pie" },
          h("button", { type:"button", className:"cf-b", disabled: paso === 0, onClick:function(){ setPaso(paso - 1); } }, tx.anterior),
          h("div", { className:"cf-puntos", "aria-live":"polite" }, h("div", null, puntos), h("span", null, (paso + 1) + " " + tx.de + " " + total)),
          ultimo
            ? h("button", { type:"button", className:"cf-b cf-fin", onClick:function(){ props.irA(VISTA_FINAL[recorrido]); } }, tx.fin[recorrido])
            : h("button", { type:"button", className:"cf-b cf-sig", onClick:function(){ setPaso(paso + 1); } }, tx.siguiente))
      ];
    }
    return h("div", { className:"cf-ov", onClick:function(e){ if (e.target === e.currentTarget) props.onClose(); } },
      h("div", { className:"cf-caja", role:"dialog", "aria-modal":"true", "aria-labelledby":"cf-titulo", tabIndex:-1, ref:cajaRef,
                 onTouchStart:inicioToque, onTouchEnd:finToque },
        h("button", { type:"button", className:"cf-x", "aria-label":tx.cerrar, onClick:props.onClose }, "×"),
        contenido));
  }
  ComoFunciona.TEXTOS = TEXTOS;   // para el banco de pruebas
  window.LM_COMO_FUNCIONA = ComoFunciona;
})();
