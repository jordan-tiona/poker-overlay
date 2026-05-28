import { useState, useEffect, useRef, useCallback } from 'react'
import type { GameState } from '../types/poker'
import { extractGameState } from '../lib/ocr'
import { EMPTY_GAME_STATE } from '../types/poker'

declare global {
  interface Window {
    electronAPI: {
      captureIgnition: () => Promise<{ dataUrl?: string; error?: string; sources?: string[] }>
      setIgnoreMouseEvents: (ignore: boolean) => void
      onClickThroughChanged: (cb: (isClickThrough: boolean) => void) => () => void
    }
  }
}

const CAPTURE_INTERVAL_MS = 2000  // capture every 2 seconds

export function useCapture(onStateChange: (state: GameState) => void) {
  const [status, setStatus] = useState<'searching' | 'found' | 'error'>('searching')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isClickThrough, setIsClickThrough] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastKeyRef = useRef<string>('')

  const capture = useCallback(async () => {
    const result = await window.electronAPI.captureIgnition()

    if (result.error || !result.dataUrl) {
      setStatus('error')
      setErrorMsg(result.error ?? 'No screenshot')
      return
    }

    setStatus('found')
    setErrorMsg(null)

    const state = await extractGameState(result.dataUrl)

    // Deduplicate — only fire callback if the key state changed
    const key = JSON.stringify({
      cards: state.holeCards,
      board: state.board,
      pot: state.potBB,
    })

    if (key !== lastKeyRef.current) {
      lastKeyRef.current = key
      onStateChange(state)
    }
  }, [onStateChange])

  useEffect(() => {
    intervalRef.current = setInterval(capture, CAPTURE_INTERVAL_MS)
    capture()  // immediate first run
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [capture])

  useEffect(() => {
    const cleanup = window.electronAPI.onClickThroughChanged(setIsClickThrough)
    return cleanup
  }, [])

  return { status, errorMsg, isClickThrough }
}
