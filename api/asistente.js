// api/asistente.js
// Vercel Function: intermediario seguro entre el navegador y la API de Anthropic.
// La clave de verdad (ANTHROPIC_API_KEY) vive solo aquí, como variable de entorno
// del servidor — nunca llega al navegador. El navegador solo le manda el texto.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido" });
    return;
  }

  const { system, userMsg } = req.body || {};
  if (!system || !userMsg) {
    res.status(400).json({ error: "Faltan datos (system o userMsg)" });
    return;
  }

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system,
        messages: [{ role: "user", content: userMsg }]
      })
    });

    const data = await anthropicRes.json();

    if (data.error) {
      res.status(502).json({ error: data.error.message });
      return;
    }

    res.status(200).json({ text: data.content[0].text });
  } catch (err) {
    res.status(500).json({ error: "Error interno al contactar con la IA" });
  }
}
