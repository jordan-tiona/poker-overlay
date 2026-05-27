import React, { useEffect, useState } from 'react'
import { ping } from '../lib/ollama'

interface Props {
  captureStatus: 'searching' | 'found' | 'error'
  captureError: string | null
  ocrConfidence: 'high' | 'low' | 'manual'
}

export function StatusBar({ captureStatus, captureError, ocrConfidence }: Props) {
  const [ollamaOk, setOllamaOk] = useState<boolean | null>(null)
  const [ollamaLabel, setOllamaLabel] = useState('…')

  useEffect(() => {
    ping().then(r => {
      setOllamaOk(r.ok)
      setOllamaLabel(r.ok ? r.model : (r.error ?? 'offline'))
    })
    const id = setInterval(() => {
      ping().then(r => { setOllamaOk(r.ok); setOllamaLabel(r.ok ? r.model : (r.error ?? 'offline')) })
    }, 15_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={styles.bar}>
      <Dot ok={captureStatus === 'found'} label={
        captureStatus === 'found' ? 'Ignition detected' :
        captureStatus === 'searching' ? 'Searching for Ignition…' :
        `Window error: ${captureError}`
      } />
      <Dot ok={ollamaOk === true} label={`Ollama: ${ollamaLabel}`} />
      <Dot ok={ocrConfidence !== 'low'} label={`OCR: ${ocrConfidence}`} />
    </div>
  )
}

function Dot({ ok, label }: { ok: boolean | null; label: string }) {
  const color = ok === null ? '#64748b' : ok ? '#22c55e' : '#ef4444'
  return (
    <span style={styles.item}>
      <span style={{ ...styles.dot, background: color }} />
      {label}
    </span>
  )
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    gap: 16,
    background: 'rgba(10,14,22,0.85)',
    borderRadius: 8,
    padding: '4px 12px',
    fontSize: 11,
    color: '#64748b',
    backdropFilter: 'blur(6px)',
  },
  item: { display: 'flex', alignItems: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: '50%', display: 'inline-block' },
}
