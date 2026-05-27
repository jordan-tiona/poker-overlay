import React, { useState, useCallback } from 'react'
import { SuggestionPanel } from './components/SuggestionPanel'
import { StatusBar } from './components/StatusBar'
import { useCapture } from './hooks/useCapture'
import { useGTO } from './hooks/useGTO'
import type { GameState } from './types/poker'
import { EMPTY_GAME_STATE } from './types/poker'

export function App() {
  const [gameState, setGameState] = useState<GameState>(EMPTY_GAME_STATE)
  const { suggestion, explanation, loading, error, analyze } = useGTO()

  const handleStateChange = useCallback((newState: GameState) => {
    setGameState(prev => {
      const merged = { ...prev, ...newState }
      // Re-analyze whenever state changes
      analyze(merged)
      return merged
    })
  }, [analyze])

  const handleManualEdit = useCallback((updates: Partial<GameState>) => {
    setGameState(prev => {
      const merged = { ...prev, ...updates, confidence: 'manual' as const }
      analyze(merged)
      return merged
    })
  }, [analyze])

  const { status, errorMsg, isClickThrough } = useCapture(handleStateChange)

  return (
    <div style={styles.root}>
      {/* Show a subtle "locked" indicator when click-through is on */}
      {isClickThrough && (
        <div style={styles.lockedBadge} title="Ctrl+Shift+P to interact">
          🔒
        </div>
      )}

      <div style={styles.layout}>
        <SuggestionPanel
          suggestion={suggestion}
          explanation={explanation}
          loading={loading}
          error={error}
          gameState={gameState}
          onManualEdit={handleManualEdit}
        />
        <StatusBar
          captureStatus={status}
          captureError={errorMsg}
          ocrConfidence={gameState.confidence}
        />
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'fixed',
    inset: 0,
    pointerEvents: 'none',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
  },
  layout: {
    pointerEvents: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    margin: '16px 16px 0 0',
  },
  lockedBadge: {
    position: 'fixed',
    top: 8,
    left: 8,
    fontSize: 18,
    opacity: 0.4,
    userSelect: 'none',
    pointerEvents: 'none',
  },
}
