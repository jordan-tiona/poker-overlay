import { useState, useCallback, useRef } from 'react'
import type { GameState, GTOSuggestion } from '../types/poker'
import { lookupGTO, buildExplanationPrompt } from '../lib/gto/lookup'
import { complete } from '../lib/ollama'

interface GTOState {
  suggestion: GTOSuggestion | null
  explanation: string
  loading: boolean
  error: string | null
}

export function useGTO() {
  const [state, setState] = useState<GTOState>({
    suggestion: null,
    explanation: '',
    loading: false,
    error: null,
  })

  // Cache keyed by "handKey|position|street|facingBet|facingSize"
  const cache = useRef<Map<string, string>>(new Map())

  const analyze = useCallback(async (gameState: GameState) => {
    const suggestion = lookupGTO(gameState)

    if (!suggestion) {
      setState(s => ({
        ...s,
        suggestion: null,
        explanation: gameState.street !== 'preflop'
          ? 'Postflop GTO lookup coming soon — enter position and action manually.'
          : 'Could not determine GTO action for this spot.',
        loading: false,
        error: null,
      }))
      return
    }

    setState(s => ({ ...s, suggestion, loading: true, error: null, explanation: '' }))

    // Build cache key
    const cacheKey = [
      gameState.holeCards?.map(c => c.rank + c.suit).join('') ?? '',
      gameState.heroPosition ?? '',
      gameState.street,
      gameState.facingBet,
      gameState.facingBetSizeBB,
    ].join('|')

    if (cache.current.has(cacheKey)) {
      const cached = cache.current.get(cacheKey)!
      setState(s => ({ ...s, explanation: cached, loading: false }))
      return
    }

    const prompt = buildExplanationPrompt(gameState, suggestion)

    try {
      let streamed = ''
      await complete(prompt, (chunk) => {
        streamed += chunk
        setState(s => ({ ...s, explanation: streamed }))
      })
      cache.current.set(cacheKey, streamed)
      setState(s => ({ ...s, loading: false }))
    } catch (e) {
      setState(s => ({
        ...s,
        loading: false,
        error: `Ollama error: ${String(e)}`,
        explanation: '',
      }))
    }
  }, [])

  return { ...state, analyze }
}
