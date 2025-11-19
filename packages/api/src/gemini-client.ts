const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

interface GeminiOptions {
  prompt: string;
}

export async function generateWithGemini({ prompt }: GeminiOptions): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[gemini] GEMINI_API_KEY not set. Skipping AI enrichment.');
    return null;
  }

  try {
    const dynamicImport = new Function('specifier', 'return import(specifier);') as (specifier: string) => Promise<any>;
    const module = await dynamicImport('@google/genai').catch((err) => {
      console.warn('[gemini] dynamic import failed:', (err as Error).message);
      return null as any;
    });
    if (!module?.GoogleGenAI) {
      console.warn('[gemini] @google/genai not installed. Falling back to heuristics.');
      return null;
    }

    const client = new module.GoogleGenAI({ apiKey });
    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }]}],
    });

    if (response?.candidates?.[0]?.content?.parts?.[0]?.text) {
      const text = response.candidates[0].content.parts[0].text;
      console.log('[gemini] extracted text length:', text.length);
      return text;
    }

    console.warn('[gemini] no text found in response:', JSON.stringify(response, null, 2));
    return null;
  } catch (error) {
    console.warn('[gemini] generation failed:', (error as Error).message);
    console.warn('[gemini] prompt snippet:', prompt.slice(0, 500));
    return null;
  }
}
