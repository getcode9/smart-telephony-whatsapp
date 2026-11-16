import { required } from './env.ts'

const FALLBACK_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.5-flash',
  'gemini-3.8-flash',
]

export async function geminiText(system: string, user: string): Promise<string> {
  const key = required('GEMINI_API_KEY')
  const preferredModel = process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite'
  const candidateModels = [preferredModel, ...FALLBACK_MODELS.filter((m) => m !== preferredModel)]

  let lastError: Error | null = null

  for (const model of candidateModels) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': key,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
          }),
        },
      )
      const json = await response.json() as {
        candidates?: { content?: { parts?: { text?: string, thought?: boolean }[] } }[]
        error?: { message?: string }
      }
      if (!response.ok) {
        throw new Error(`[${model}] ${json.error?.message || 'Gemini rejected the request.'}`)
      }
      const text = json.candidates?.[0]?.content?.parts
        ?.filter((part) => !part.thought)
        .map((part) => part.text || '')
        .join('')
        .trim()
      if (text) {
        return text
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      console.warn(`Gemini model ${model} failed, trying next...`, lastError.message)
    }
  }

  const error = lastError || new Error('All Gemini models failed.')
  ;(error as any).statusCode = 502
  throw error
}
