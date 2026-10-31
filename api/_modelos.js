// api/_modelos.js — Locus Mundi
// Versión 1.2 · 31/10/2026 · Lista, pendiente (n): precio del modelo de fotos (comprobado el 31/10 en
//   ai.google.dev/gemini-api/docs/pricing: entrada 0,50 $, texto y pensamiento 3 $, imagen 60 $ por millón
//   de tokens; equivale a 0,101 $ por imagen 2K) y costeImagenEnEuros(), para que el editor anote su gasto.
// Versión 1.1 · 26/10/2026 · TEST de los pendientes de index.html: nuevo trabajo «traduccion_respaldo»
//   (gemini-3.5-flash), para cuando Flash-Lite devuelve el tramo sin traducir (pasó con el gallego).
// Versión 1 · 17/10/2026 · Fase B2, punto 19 (c). Continuidad, sesión "17/10/2026 (conversación 6)".
// ÚNICO sitio donde viven los nombres de los modelos de Google, sus precios y el cambio
// dólar/euro. Lo leen asistente.js, _moderacion.js, moderar.js, traducir.js, foto-editor.js y
// diario.js (el vigía comprueba cada mañana que todos estos modelos siguen existiendo).
// Vercel no convierte en función un archivo de api/ que empieza por guion bajo.
//
// Si Google retira un modelo: cambiar aquí su nombre (y su precio), subir y hacer el TEST
// de lo que lo usa. Nada más.

// Qué modelo hace cada trabajo.
const MODELOS = {
  conversacion: 'gemini-3.5-flash',      // Asistente: conversación
  pasaje:       'gemini-3.5-flash',      // Asistente: modo "Revisar los pasajes señalados"
  revision:     'gemini-3.5-flash-lite', // Asistente: revisión automática por párrafo
  dictado:      'gemini-3.5-flash-lite', // Asistente: puntuación del dictado
  traduccion:   'gemini-3.5-flash-lite', // Traducción para lectores
  traduccion_respaldo: 'gemini-3.5-flash', // v1.1: segundo intento si el primero no sirve
  moderacion:   'gemini-3.5-flash-lite', // Moderación: texto (primera revisión) e imágenes
  confirmacion: 'gemini-3.5-flash',      // Moderación: confirma lo que señala la primera revisión
  fotos:        'gemini-3.1-flash-image-preview' // Editor de fotos (Nano Banana 2)
};

// Dólares por millón de tokens (precio oficial de Google). Los tokens de "pensamiento"
// se cobran como salida. Todo modelo de texto de MODELOS debe estar aquí.
const PRECIOS_USD = {
  'gemini-3.5-flash':      { entrada: 1.50, salida: 9.00 },
  'gemini-3.5-flash-lite': { entrada: 0.30, salida: 2.50 }
};

// v1.2: modelos de imagen, por separado (la salida de imagen se cobra aparte de la de texto).
// `por_imagen`: lo que cuesta una imagen 2K, por si Google no devuelve el recuento de tokens.
const PRECIOS_IMAGEN_USD = {
  'gemini-3.1-flash-image-preview': { entrada: 0.50, salida_texto: 3.00, salida_imagen: 60.00, por_imagen: 0.101 }
};
// Cambio dólar → euro, algo por encima del real (mejor contar de más). Revisar de vez en cuando.
const DOLAR_A_EURO = 0.90;

// Coste en euros de una llamada, a partir de usageMetadata de Gemini.
// Si falta el precio de un modelo (se cambió el nombre y no el precio), se usa el más caro
// conocido y se avisa en el registro: nunca se cuenta de menos ni se tumba la operación.
function costeEnEuros(modelo, uso) {
  let p = PRECIOS_USD[modelo];
  if (!p) {
    console.error(`_modelos: falta el precio de ${modelo}; se usa el más caro`);
    p = Object.values(PRECIOS_USD).reduce((a, b) => (b.salida > a.salida ? b : a));
  }
  const entrada = uso?.promptTokenCount || 0;
  const salida = (uso?.candidatesTokenCount || 0) + (uso?.thoughtsTokenCount || 0);
  return ((entrada * p.entrada + salida * p.salida) / 1e6) * DOLAR_A_EURO;
}

// v1.2: coste en euros de una imagen generada. Con usageMetadata, por tokens (los de imagen, a su
// precio; texto y pensamiento, al suyo); sin él, el precio de una imagen 2K más la entrada estimada.
// Sin precio del modelo, el más caro conocido (nunca de menos).
function costeImagenEnEuros(modelo, uso) {
  let p = PRECIOS_IMAGEN_USD[modelo];
  if (!p) {
    console.error(`_modelos: falta el precio de ${modelo}; se usa el más caro`);
    p = Object.values(PRECIOS_IMAGEN_USD).reduce((a, b) => (b.salida_imagen > a.salida_imagen ? b : a));
  }
  const detalles = uso?.candidatesTokensDetails || [];
  const deImagen = detalles.filter(d => d.modality === 'IMAGE').reduce((n, d) => n + (d.tokenCount || 0), 0);
  const salida = uso?.candidatesTokenCount || 0;
  if (!uso || (!salida && !deImagen)) return (p.por_imagen + (1500 * p.entrada) / 1e6) * DOLAR_A_EURO;
  const imagen = deImagen || salida; // sin desglose, toda la salida se cuenta como imagen (lo más caro)
  const texto = Math.max(0, salida - imagen) + (uso.thoughtsTokenCount || 0);
  const entrada = uso.promptTokenCount || 0;
  return ((entrada * p.entrada + imagen * p.salida_imagen + texto * p.salida_texto) / 1e6) * DOLAR_A_EURO;
}
// Lista sin repetidos, para el vigía.
const modelosEnUso = () => [...new Set(Object.values(MODELOS))];

// Modelos de texto sin precio (el vigía avisa si hay alguno).
const modelosSinPrecio = () =>
  [...new Set(Object.entries(MODELOS).map(([k, m]) => [k, m]))]
    .filter(([k, m]) => (k === 'fotos' ? !PRECIOS_IMAGEN_USD[m] : !PRECIOS_USD[m])).map(([, m]) => m)
    .filter((m, i, a) => a.indexOf(m) === i); // v1.2: también el de fotos

module.exports = { MODELOS, PRECIOS_USD, PRECIOS_IMAGEN_USD, DOLAR_A_EURO, costeEnEuros, costeImagenEnEuros, modelosEnUso, modelosSinPrecio };
