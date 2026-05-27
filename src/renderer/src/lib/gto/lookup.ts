import type { Card, GameState, GTOSuggestion, ActionOption } from '../../types/poker'
import { RFI, VS_3BET, type PreflopSpot } from './charts/preflop'

// ── Hand key normalization ───────────────────────────────────────────────────

const RANK_ORDER = '23456789TJQKA'

function rankIndex(r: string): number {
  return RANK_ORDER.indexOf(r)
}

/** Convert two hole cards to a canonical hand key ("AKs", "77", "QJo") */
export function handKey(cards: [Card, Card]): string {
  const [a, b] = cards
  const [hi, lo] =
    rankIndex(a.rank) >= rankIndex(b.rank) ? [a, b] : [b, a]

  if (hi.rank === lo.rank) return `${hi.rank}${lo.rank}`  // pair
  const suited = hi.suit === lo.suit ? 's' : 'o'
  return `${hi.rank}${lo.rank}${suited}`
}

// ── Main GTO lookup ──────────────────────────────────────────────────────────

export function lookupGTO(state: GameState): GTOSuggestion | null {
  const { street, holeCards, heroPosition, facingBet } = state

  if (!holeCards || !heroPosition) return null

  if (street === 'preflop') {
    return lookupPreflop(state)
  }

  // Postflop: placeholder — will plug GTO Wizard API here later
  return null
}

function lookupPreflop(state: GameState): GTOSuggestion | null {
  const { holeCards, heroPosition, facingBet, facingBetSizeBB } = state
  if (!holeCards || !heroPosition) return null

  const key = handKey(holeCards)

  // Facing a 3-bet?
  if (facingBet && facingBetSizeBB > 0) {
    const chart = VS_3BET[heroPosition]
    if (chart?.[key]) {
      return spotToSuggestion(chart[key], key)
    }
    // Default fold if hand not in chart
    return defaultFold()
  }

  // RFI
  const chart = RFI[heroPosition]
  if (!chart) return null  // position not charted yet (BB, LJ, UTG+1, etc.)

  const spot = chart[key]
  if (!spot) {
    // Not in chart = fold
    return defaultFold()
  }

  return spotToSuggestion(spot, key)
}

function spotToSuggestion(spot: PreflopSpot, key: string): GTOSuggestion {
  const actions: ActionOption[] = [
    {
      action: spot.primary.action,
      sizingBB: spot.primary.sizingBB,
      frequency: spot.primary.frequency,
    },
  ]

  if (spot.secondary) {
    actions.push({
      action: spot.secondary.action,
      frequency: spot.secondary.frequency,
    })
  }

  const primary = actions[0]
  const isPure = primary.frequency >= 0.95

  return {
    actions,
    primaryAction: primary.action,
    primaryFrequency: primary.frequency,
    // explanation is filled in by Ollama — start empty
    explanation: '',
  }
}

function defaultFold(): GTOSuggestion {
  return {
    actions: [{ action: 'fold', frequency: 1 }],
    primaryAction: 'fold',
    primaryFrequency: 1,
    explanation: '',
  }
}

// ── Plain-English prompt builder (sent to Ollama) ────────────────────────────

export function buildExplanationPrompt(state: GameState, suggestion: GTOSuggestion): string {
  const { holeCards, heroPosition, street, facingBet, facingBetSizeBB, potBB, stacksBB } = state
  const handStr = holeCards ? handKey(holeCards) : 'unknown hand'
  const primary = suggestion.actions[0]
  const isMixed = suggestion.actions.length > 1

  let context = `You are a friendly GTO poker coach. Explain the following GTO recommendation in 2–3 plain English sentences. Focus on WHY this is correct. No jargon without explanation. Be concise.\n\n`
  context += `Hand: ${handStr}\n`
  context += `Street: ${street}\n`
  context += `Position: ${heroPosition ?? 'unknown'}\n`
  context += `Pot: ${potBB} BB | Hero stack: ${stacksBB.hero} BB | Villain stack: ${stacksBB.villain} BB\n`

  if (facingBet) {
    context += `Facing a bet of ${facingBetSizeBB} BB\n`
  }

  context += `\nGTO recommendation: `

  if (isMixed) {
    const [a, b] = suggestion.actions
    context += `Mix — ${a.action} ${Math.round(a.frequency * 100)}% of the time`
    if (a.sizingBB && a.sizingBB < 900) context += ` (to ${a.sizingBB} BB)`
    context += `, ${b.action} ${Math.round(b.frequency * 100)}%.\n`
  } else {
    context += `${primary.action}`
    if (primary.sizingBB && primary.sizingBB < 900) context += ` to ${primary.sizingBB} BB`
    context += ` (pure — always correct here).\n`
  }

  context += `\nExplanation:`
  return context
}
