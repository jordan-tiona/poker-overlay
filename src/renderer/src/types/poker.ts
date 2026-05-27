export type Suit = 'h' | 'd' | 'c' | 's'
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A'

export interface Card {
  rank: Rank
  suit: Suit
}

export type Street = 'preflop' | 'flop' | 'turn' | 'river'

export type Position =
  | 'UTG' | 'UTG+1' | 'UTG+2'
  | 'LJ' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB'

export type Action = 'fold' | 'check' | 'call' | 'raise' | 'bet' | 'allin'

export interface ActionOption {
  action: Action
  sizingBB?: number      // bet/raise size in BBs, if applicable
  frequency: number      // 0–1, GTO mix frequency
}

export interface GTOSuggestion {
  actions: ActionOption[]
  primaryAction: Action
  primaryFrequency: number
  explanation: string    // plain English, filled in by Ollama
}

export interface GameState {
  street: Street
  holeCards: [Card, Card] | null
  board: Card[]             // 0 (preflop) | 3 (flop) | 4 (turn) | 5 (river)
  heroPosition: Position | null
  potBB: number
  stacksBB: {
    hero: number
    villain: number         // effective
  }
  facingBet: boolean
  facingBetSizeBB: number
  villainsActive: number    // how many opponents remaining

  // OCR confidence / detection status
  confidence: 'high' | 'low' | 'manual'
}

export const EMPTY_GAME_STATE: GameState = {
  street: 'preflop',
  holeCards: null,
  board: [],
  heroPosition: null,
  potBB: 0,
  stacksBB: { hero: 100, villain: 100 },
  facingBet: false,
  facingBetSizeBB: 0,
  villainsActive: 1,
  confidence: 'manual',
}
