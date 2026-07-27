# LOCUS MUNDI — Documento de Continuidad
## Estado del proyecto al 26/07/2026

---

## DATOS BÁSICOS

- **Dominio:** locusmundi.com (GoDaddy, pendiente de conectar)
- **Web en vivo:** locusmundi.vercel.app
- **Repositorio GitHub:** locusmundi (cuenta: locusmundis-projects)
- **Email de contacto:** contactlocusmundi@gmail.com
- **Fundador:** Javier Batlle Vilaseca (X. Batlle como firma literaria)

---

## STACK TÉCNICO

- **Frontend:** archivo único `index.html` con React + Babel standalone
- **Hosting:** Vercel (conectado a GitHub, auto-deploy en cada commit)
- **Base de datos:** ninguna todavía (Fase 2 pendiente → Supabase)
- **IA:** API Anthropic (claude-sonnet-4-20250514), clave en el frontend (Fase 2: mover a backend seguro)
- **Pagos:** simulados (Fase 2 → Stripe real)

---

## ARCHIVOS EN GITHUB (repositorio locusmundi)

| Archivo | Descripción |
|---|---|
| `index.html` | Web principal completa |
| `irene-vilaseca.html` | Autobiografía completa Irene Vilaseca Fructuoso |
| `olegario-sotelo.html` | Autobiografía completa Olegario Sotelo Blanco |
| `pablo-cava.html` | Autobiografía completa Pablo Cava Domínguez |
| `vercel.json` | Configuración de rutas Vercel |
| `package.json` | Metadatos del proyecto |

---

## AUTOBIOGRAFÍAS PUBLICADAS

1. **Irene Vilaseca Fructuoso** (ES) — *Recuerdos de mi familia* — España, 1932
2. **Olegario Sotelo Blanco** (GL) — *O neno pastor que venceu o lobo* — Galicia, 1938
3. **Pablo Cava Domínguez** (ES) — *Historia de mi vida* — Extremadura, 1944
4. **Javier Batlle Vilaseca** (CA) — *La vida escrita* — PENDIENTE DE SUBIR

---

## ESTÁNDAR DE COLECCIÓN (versión 1.1)

Dos documentos de referencia:
- `LOCUS_MUNDI_ESTILO_COLECCION.md` v1.1
- `LOCUS_MUNDI_CHECKLIST_VALIDACION.md` v1.1

Reglas clave:
- Guion único: en-dash (–, U+2013) en todo el documento
- Comillas angulares («») por defecto; inglesas (" ") solo anidadas
- Clases CSS definidas, sin estilos inline sueltos
- Colofón "Publicado en Locus Mundi · locusmundi.com" obligatorio

---

## DISEÑO Y PALETA

- **Logo oficial:** figura humana de periódico leyendo libro, con "Locus Mundi" y monograma LM
- **Paleta web:** `--navy:#1B3A6B` / `--gold:#C4932A` / `--bg:#EDE0C4` / `--ink:#1A0E07`
- **Paleta colección:** `--bu:#7B1E2E` / `--cr:#FAF7F0` / `--dk:#2A2316`
- **Tipografía web:** Cormorant Garamond + Crimson Pro
- **Tipografía colección:** Playfair Display + EB Garamond
- **Lema:** Recuerda · Cuenta · Publica · Comparte

---

## MODELO DE PRECIOS (acordado, pendiente de implementar en Fase 2)

| Opción | Precio | Incluye |
|---|---|---|
| Base | €0 siempre | Texto ilimitado, 1 foto portada, traducción, archivo permanente |
| Ilustrada | €9,99 pago único | Hasta 10 fotos, PDF descargable (solo autores), +€1/foto adicional |
| Asistente editorial | €4,99/mes | IA para escribir, mejorar, estructurar, corregir (activable/desactivable) |

**Notas:**
- PDF solo accesible para el autor, nunca para lectores
- Cuota diaria gratuita de IA: 15-20 interacciones/día
- Límite de gasto mensual Anthropic: fijar antes de abrir al público
- Vídeo: anunciado como "próximamente", implementar en Fase 3

---

## HOJA DE RUTA PENDIENTE

### Inmediato (antes de abrir al público)
- [ ] Subir autobiografía de Javier Batlle (poemario *La vida escrita* en catalán)
- [ ] Revisar y afinar diseño de portada de la web
- [ ] Probar flujo completo de "Escribe tu historia" con texto real

### Fase 2 — Con Supabase + Backend
- [ ] Conectar Supabase (base de datos real para autobiografías)
- [ ] Sistema de autenticación (cada autor accede solo a su texto)
- [ ] Mover clave API Anthropic a backend seguro (Vercel Functions)
- [ ] Conectar Stripe real (pagos Premium e Ilustrada)
- [ ] Conectar Formspree para formulario de contacto real
- [ ] Generación automática de libro HTML con estándar de colección
- [ ] Cuota diaria de IA por usuario
- [ ] Contadores reales (historias publicadas, lecturas)
- [ ] Mapamundi interactivo de origen de autobiografías
- [ ] Conectar locusmundi.com en GoDaddy (último paso antes de abrir)

### Fase 3 — Crecimiento
- [ ] Cuestionario inicial calibrador del asistente IA
- [ ] FAQ contextual (aparece donde surge la duda)
- [ ] Vídeo integrado (±€5/minuto)
- [ ] Libro impreso bajo demanda (Lulu.com / Amazon KDP)
- [ ] Narración en audio IA
- [ ] Árbol genealógico vinculado entre autobiografías
- [ ] Versión institucional para bibliotecas y centros

---

## CAMBIOS IMPLEMENTADOS EN LA ÚLTIMA SESIÓN

- Logo nuevo oficial (figura leyendo) integrado en header y banda CTA
- Lema hero: "Tu historia importa y no está en venta"
- FAQ 1: "sea posible" · FAQ 2: "ser fiel a la verdad"
- Etiqueta Cava: "traición" en lugar de "Barcelona"
- Banda CTA inferior: logo + email contactlocusmundi@gmail.com
- Biblioteca: solo país visible en tarjetas (sin badge de idioma)
- Precios: nueva estructura Base / Ilustrada (€9,99) / Asistente (€4,99/mes)
- Modal Premium: renombrado a "Opción Ilustrada"
- Footer: email real contactlocusmundi@gmail.com

---

## PARA RETOMAR EN CONVERSACIÓN NUEVA

Pegar este mensaje al inicio:

> "Soy Javier Batlle, fundador de Locus Mundi (locusmundi.vercel.app). 
> Desarrollo la plataforma contigo desde hace tiempo. Adjunto el documento 
> de continuidad del proyecto. Continuamos desde donde lo dejamos."

Y adjuntar este archivo.

---

*Actualizado: julio 2026 · Locus Mundi*
