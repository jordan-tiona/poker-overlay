import React, { useState, useCallback, useEffect, useRef } from 'react'
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
      const merged = {
        ...prev,
        ...newState,
        // Never let OCR overwrite fields it can't detect — preserve user-set values
        heroPosition: newState.heroPosition ?? prev.heroPosition,
        openerPosition: newState.openerPosition ?? prev.openerPosition,
      }
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

  const { status, errorMsg } = useCapture(handleStateChange)

  // Hover-based click-through: panel is interactive when mouse is over it,
  // click-through otherwise — no hotkey toggle needed.
  const layoutRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const overPanel = !!el && el !== document.body && el !== document.documentElement
      window.electronAPI.setIgnoreMouseEvents(!overPanel)
    }
    window.addEventListener('mousemove', onMouseMove)
    // Ensure click-through when component unmounts
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.electronAPI.setIgnoreMouseEvents(true)
    }
  }, [])

  return (
    <div style={styles.root}>
      <div ref={layoutRef} style={styles.layout}>
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
}
