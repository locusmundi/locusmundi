module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  try {
    const { system, userMsg } = req.body;

    if (!userMsg) {
      res.status(400).json({ error: 'Falta userMsg' });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Falta GEMINI_API_KEY en el servidor' });
      return;
    }

    const model = 'gemini-3.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const body = {
      contents: [
        { role: 'user', parts: [{ text: userMsg }] }
      ]
    };

    if (system) {
      body.system_instruction = { parts: [{ text: system }] };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Error de Gemini:', data);
      res.status(response.status).json({ error: data.error?.message || 'Error al llamar a Gemini' });
      return;
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    res.status(200).json({ text });
  } catch (err) {
    console.error('Error en asistente.js:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
