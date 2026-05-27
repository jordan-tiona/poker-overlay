/**
 * Ollama client — calls the local Ollama REST API for plain-English explanations.
 * Default model: llama3.1 (configurable via OLLAMA_MODEL in localStorage).
 */

const OLLAMA_BASE = 'http://localhost:11434'

export function getModel(): string {
  return localStorage.getItem('ollama_model') ?? 'llama3.1'
}

export function setModel(model: string): void {
  localStorage.setItem('ollama_model', model)
}

/** Stream a completion from Ollama and return the full text */
export async function complete(
  prompt: string,
  onChunk?: (text: string) => void
): Promise<string> {
  const response = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: getModel(),
      prompt,
      stream: true,
    }),
  })

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status} ${response.statusText}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let fullText = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value, { stream: true })
    // Each line is a JSON object
    for (const line of chunk.split('\n').filter(Boolean)) {
      try {
        const data = JSON.parse(line) as { response: string; done: boolean }
        fullText += data.response
        onChunk?.(data.response)
        if (data.done) break
      } catch {
        // ignore malformed lines
      }
    }
  }

  return fullText.trim()
}

/** Check that Ollama is reachable and the model is available */
export async function ping(): Promise<{ ok: boolean; model: string; error?: string }> {
  const model = getModel()
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`)
    if (!res.ok) return { ok: false, model, error: `HTTP ${res.status}` }
    const data = await res.json() as { models: Array<{ name: string }> }
    const available = data.models.map(m => m.name)
    const found = available.some(n => n.startsWith(model))
    if (!found) {
      return { ok: false, model, error: `Model "${model}" not found. Available: ${available.join(', ')}` }
    }
    return { ok: true, model }
  } catch (e) {
    return { ok: false, model, error: String(e) }
  }
}
