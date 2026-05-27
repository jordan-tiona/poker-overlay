import React from 'react'
import type { GTOSuggestion, GameState, Action } from '../types/poker'

interface Props {
  suggestion: GTOSuggestion | null
  explanation: string
  loading: boolean
  error: string | null
  gameState: GameState
  onManualEdit: (updates: Partial<GameState>) => void
}

const ACTION_COLOR: Record<Action, string> = {
  fold:  '#ef4444',
  check: '#22c55e',
  call:  '#3b82f6',
  bet:   '#f59e0b',
  raise: '#f59e0b',
  allin: '#ec4899',
}

const ACTION_LABEL: Record<Action, string> = {
  fold:  'FOLD',
  check: 'CHECK',
  call:  'CALL',
  bet:   'BET',
  raise: 'RAISE',
  allin: 'ALL IN',
}

export function SuggestionPanel({ suggestion, explanation, loading, error, gameState, onManualEdit }: Props) {
  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.title}>🃏 GTO Advisor</span>
        <span style={styles.street}>{gameState.street.toUpperCase()}</span>
      </div>

      {/* Hand + position controls */}
      <ManualControls gameState={gameState} onManualEdit={onManualEdit} />

      {/* Action recommendation */}
      {suggestion && (
        <div style={styles.actions}>
          {suggestion.actions.map((a, i) => (
            <div key={i} style={styles.actionRow}>
              <div
                style={{
                  ...styles.actionBadge,
                  background: ACTION_COLOR[a.action],
                  opacity: i === 0 ? 1 : 0.6,
                }}
              >
                {ACTION_LABEL[a.action]}
                {a.sizingBB && a.sizingBB < 900 && (
                  <span style={styles.sizing}> {a.sizingBB}BB</span>
                )}
              </div>
              <div style={styles.freq}>
                {Math.round(a.frequency * 100)}%
                {i === 0 && suggestion.actions.length > 1 && (
                  <span style={styles.mixLabel}> (mix)</span>
                )}
              </div>
              {/* Frequency bar */}
              <div style={styles.freqBarBg}>
                <div style={{ ...styles.freqBar, width: `${a.frequency * 100}%`, background: ACTION_COLOR[a.action] }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Explanation */}
      <div style={styles.explanation}>
        {error && <span style={styles.error}>{error}</span>}
        {!error && loading && !explanation && (
          <span style={styles.loading}>Asking Ollama…</span>
        )}
        {!error && explanation && (
          <span>{explanation}{loading && <span style={styles.cursor}>▋</span>}</span>
        )}
        {!error && !loading && !explanation && !suggestion && (
          <span style={styles.hint}>Set your position and hole cards to get a suggestion.</span>
        )}
      </div>

      <div style={styles.hotkey}>Ctrl+Shift+P — toggle mouse interaction</div>
    </div>
  )
}

// ── Manual override controls ─────────────────────────────────────────────────

interface ControlsProps {
  gameState: GameState
  onManualEdit: (updates: Partial<GameState>) => void
}

const POSITIONS = ['UTG', 'UTG+1', 'UTG+2', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'] as const

function ManualControls({ gameState, onManualEdit }: ControlsProps) {
  return (
    <div style={styles.controls}>
      <label style={styles.controlLabel}>Position</label>
      <select
        style={styles.select}
        value={gameState.heroPosition ?? ''}
        onChange={e => onManualEdit({ heroPosition: e.target.value as GameState['heroPosition'] })}
      >
        <option value="">—</option>
        {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
      </select>

      <label style={styles.controlLabel}>Facing bet?</label>
      <input
        type="checkbox"
        checked={gameState.facingBet}
        onChange={e => onManualEdit({ facingBet: e.target.checked })}
        style={{ cursor: 'pointer' }}
      />
      {gameState.facingBet && (
        <>
          <label style={styles.controlLabel}>Size (BB)</label>
          <input
            type="number"
            style={styles.numberInput}
            value={gameState.facingBetSizeBB}
            min={0}
            step={0.5}
            onChange={e => onManualEdit({ facingBetSizeBB: parseFloat(e.target.value) || 0 })}
          />
        </>
      )}
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  panel: {
    background: 'rgba(15, 20, 30, 0.92)',
    border: '1px solid rgba(99, 120, 180, 0.4)',
    borderRadius: 12,
    padding: '14px 18px',
    width: 320,
    color: '#e2e8f0',
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    fontSize: 13,
    backdropFilter: 'blur(8px)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    userSelect: 'none',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: { fontWeight: 700, fontSize: 15, color: '#93c5fd' },
  street: { fontSize: 11, color: '#64748b', letterSpacing: 1 },

  controls: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    padding: '8px 0',
    borderBottom: '1px solid rgba(99,120,180,0.2)',
  },
  controlLabel: { color: '#94a3b8', fontSize: 11 },
  select: {
    background: 'rgba(30,40,60,0.9)',
    border: '1px solid rgba(99,120,180,0.4)',
    borderRadius: 6,
    color: '#e2e8f0',
    fontSize: 12,
    padding: '2px 6px',
    cursor: 'pointer',
  },
  numberInput: {
    background: 'rgba(30,40,60,0.9)',
    border: '1px solid rgba(99,120,180,0.4)',
    borderRadius: 6,
    color: '#e2e8f0',
    fontSize: 12,
    padding: '2px 6px',
    width: 60,
  },

  actions: { marginBottom: 12 },
  actionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  actionBadge: {
    borderRadius: 6,
    padding: '3px 10px',
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: 0.5,
    color: '#fff',
    minWidth: 70,
    textAlign: 'center' as const,
  },
  sizing: { fontWeight: 400, fontSize: 11 },
  freq: { fontSize: 12, color: '#94a3b8', minWidth: 50 },
  mixLabel: { fontSize: 11, color: '#64748b' },
  freqBarBg: {
    flex: 1,
    height: 4,
    background: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  freqBar: { height: '100%', borderRadius: 2, transition: 'width 0.3s ease' },

  explanation: {
    fontSize: 13,
    lineHeight: 1.55,
    color: '#cbd5e1',
    minHeight: 60,
    padding: '8px 0',
    borderTop: '1px solid rgba(99,120,180,0.2)',
  },
  loading: { color: '#64748b', fontStyle: 'italic' },
  error: { color: '#f87171' },
  hint: { color: '#475569', fontStyle: 'italic' },
  cursor: { animation: 'blink 1s step-end infinite' },

  hotkey: {
    marginTop: 10,
    fontSize: 10,
    color: '#334155',
    textAlign: 'center' as const,
  },
}
