/**
 * OCR module — takes a screenshot data URL of the Ignition window and extracts game state.
 *
 * Strategy:
 *  1. Draw the full screenshot onto a canvas
 *  2. Crop known Ignition UI regions (pot, cards, stacks, etc.)
 *  3. Run Tesseract on text regions, colour-detect on card regions
 *
 * NOTE: Ignition's layout is fixed (1920×1080 reference). Regions below are calibrated
 * for that resolution and will need tuning if the window is resized.
 * In dev mode you can click "Calibrate" to drag-drop region boxes.
 */

import { createWorker } from 'tesseract.js'
import type { Card, GameState, Position, Rank, Suit, Street } from '../types/poker'
import { EMPTY_GAME_STATE } from '../types/poker'

// ── Region definitions (1920×1080 reference frame) ──────────────────────────
// All values are fractions of the window dimensions so they scale with resize.

interface Region {
  x: number  // fraction of width
  y: number
  w: number
  h: number
}

const REGIONS = {
  pot:         { x: 0.42, y: 0.41, w: 0.16, h: 0.04 },
  street:      { x: 0.42, y: 0.36, w: 0.16, h: 0.03 },
  heroCard1:   { x: 0.435, y: 0.78, w: 0.055, h: 0.09 },
  heroCard2:   { x: 0.510, y: 0.78, w: 0.055, h: 0.09 },
  board1:      { x: 0.300, y: 0.52, w: 0.055, h: 0.09 },
  board2:      { x: 0.370, y: 0.52, w: 0.055, h: 0.09 },
  board3:      { x: 0.440, y: 0.52, w: 0.055, h: 0.09 },
  board4:      { x: 0.510, y: 0.52, w: 0.055, h: 0.09 },
  board5:      { x: 0.580, y: 0.52, w: 0.055, h: 0.09 },
  heroStack:   { x: 0.42, y: 0.87, w: 0.16, h: 0.03 },
  villStack:   { x: 0.42, y: 0.12, w: 0.16, h: 0.03 },

  // Action buttons (bottom of screen) — used to detect facingBet + bet size
  // "Call X.XX" text appears in the middle button when facing a bet;
  // "Check" appears there when not facing one.
  actionCall:  { x: 0.460, y: 0.905, w: 0.140, h: 0.040 },
} satisfies Record<string, Region>

// ── Dealer-button (D-chip) seat regions ──────────────────────────────────────
//
// The D chip is a silver/grey circle that moves each hand. Hero is always at
// the bottom-center visually. Seat indices are clockwise from hero (0 = hero).
//
// Two layouts supported — tried in parallel; the one with the stronger pixel
// signal wins. Coordinates are fractions of the captured thumbnail size.
//
// ⚠️  These are calibrated from a 9-max $0.02/$0.05 screenshot. If the table
//     geometry differs, set DEV_LOG_DEALER=true in the console to print the
//     per-region brightness scores and tune x/y.

// 6-max: 6 seats clockwise from hero
//   0 = hero (bottom)    3 = top-right
//   1 = right            4 = top-left
//   2 = upper-right      5 = left
const DEALER_CHIP_SEATS_6MAX: Region[] = [
  { x: 0.456, y: 0.748, w: 0.045, h: 0.032 },  // 0 hero
  { x: 0.705, y: 0.660, w: 0.045, h: 0.032 },  // 1 right
  { x: 0.785, y: 0.450, w: 0.045, h: 0.032 },  // 2 upper-right
  { x: 0.636, y: 0.305, w: 0.045, h: 0.032 },  // 3 top-right
  { x: 0.368, y: 0.305, w: 0.045, h: 0.032 },  // 4 top-left
  { x: 0.222, y: 0.450, w: 0.045, h: 0.032 },  // 5 left
  { x: 0.265, y: 0.660, w: 0.045, h: 0.032 },  // 6 lower-left (7-handed overflow)
]

// 9-max (full ring): 9 seats clockwise from hero
//   0 = hero (bottom-center)   5 = top-right
//   1 = bottom-left            6 = right
//   2 = left                   7 = lower-right
//   3 = upper-left             8 = bottom-right
//   4 = top-left
const DEALER_CHIP_SEATS_9MAX: Region[] = [
  { x: 0.440, y: 0.720, w: 0.055, h: 0.040 },  // 0 hero
  { x: 0.345, y: 0.620, w: 0.055, h: 0.040 },  // 1 bottom-left  (seat 7 area, both screenshots)
  { x: 0.180, y: 0.490, w: 0.055, h: 0.040 },  // 2 left
  { x: 0.165, y: 0.315, w: 0.055, h: 0.040 },  // 3 upper-left
  { x: 0.350, y: 0.235, w: 0.055, h: 0.040 },  // 4 top-left
  { x: 0.510, y: 0.235, w: 0.055, h: 0.040 },  // 5 top-right
  { x: 0.685, y: 0.315, w: 0.055, h: 0.040 },  // 6 right
  { x: 0.685, y: 0.490, w: 0.055, h: 0.040 },  // 7 lower-right
  { x: 0.540, y: 0.620, w: 0.055, h: 0.040 },  // 8 bottom-right
]

// Seat index → hero position (D is X seats clockwise from hero)
const SEAT_TO_POSITION_6MAX: Array<Position | null> = [
  'BTN', 'CO', 'HJ', 'LJ', 'BB', 'SB', null,
]
const SEAT_TO_POSITION_9MAX: Array<Position | null> = [
  'BTN', 'CO', 'HJ', 'LJ', 'UTG+2', 'UTG+1', 'UTG', 'BB', 'SB',
]

// Best-guess opener when hero is BB facing a raise
const SEAT_TO_OPENER_6MAX: Array<Position | null> = [
  null, 'BTN', 'CO', 'HJ', 'CO', 'BTN', null,
]
const SEAT_TO_OPENER_9MAX: Array<Position | null> = [
  null, 'BTN', 'CO', 'HJ', 'LJ', 'HJ', 'CO', 'BTN', null,
]

// ── Tesseract worker (singleton) ─────────────────────────────────────────────

let _worker: Awaited<ReturnType<typeof createWorker>> | null = null

async function getWorker() {
  if (!_worker) {
    _worker = await createWorker('eng', 1, {
      logger: () => {},  // suppress progress logs
    })
    await _worker.setParameters({
      tessedit_char_whitelist: '0123456789AKQJTakqjt♠♥♦♣shdc/$.',
      preserve_interword_spaces: '0',
    })
  }
  return _worker
}

// ── Canvas crop helper ───────────────────────────────────────────────────────

function cropRegion(
  img: HTMLImageElement,
  region: Region
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const cw = Math.round(img.naturalWidth * region.w)
  const ch = Math.round(img.naturalHeight * region.h)
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(
    img,
    Math.round(img.naturalWidth * region.x),
    Math.round(img.naturalHeight * region.y),
    cw, ch,
    0, 0, cw, ch
  )
  return canvas
}

async function ocrCanvas(canvas: HTMLCanvasElement): Promise<string> {
  const worker = await getWorker()
  const { data } = await worker.recognize(canvas)
  return data.text.trim()
}

// ── Card parsing ─────────────────────────────────────────────────────────────

const RANK_MAP: Record<string, Rank> = {
  A: 'A', K: 'K', Q: 'Q', J: 'J', T: 'T',
  '10': 'T', '9': '9', '8': '8', '7': '7',
  '6': '6', '5': '5', '4': '4', '3': '3', '2': '2',
}

// Unicode suit symbols that Tesseract may return
const SUIT_SYMBOL_MAP: Record<string, Suit> = {
  '♠': 's', 's': 's',
  '♥': 'h', 'h': 'h',
  '♦': 'd', 'd': 'd',
  '♣': 'c', 'c': 'c',
}

/**
 * Try to extract suit from OCR text. Ignition cards typically render as
 * e.g. "A♠" or "Ks" (when Tesseract recognises the letter form).
 * Returns null if no suit character found.
 */
function suitFromText(text: string): Suit | null {
  // Look for suit symbols or single-letter suit indicators at end of text
  const cleaned = text.trim()
  // Check each character, prioritise unicode symbols
  for (const ch of cleaned) {
    if (ch in SUIT_SYMBOL_MAP) return SUIT_SYMBOL_MAP[ch]
  }
  return null
}

/**
 * Detect suit from pixel colour sampling — supports 4-color decks.
 *
 * Ignition 4-color deck:
 *   Hearts   (♥) — red    (high R, low G, low B)
 *   Diamonds (♦) — blue   (high B, dominates R)
 *   Clubs    (♣) — green  (high G, dominates R and B)
 *   Spades   (♠) — dark   (all channels low — fallback)
 *
 * Samples the lower-left area of the card crop where the pip symbol sits.
 */
function suitFromPixels(canvas: HTMLCanvasElement): Suit {
  const ctx = canvas.getContext('2d')!
  const samples = [
    { x: 0.08, y: 0.48 }, { x: 0.13, y: 0.53 },
    { x: 0.08, y: 0.58 }, { x: 0.18, y: 0.48 },
    { x: 0.13, y: 0.63 }, { x: 0.20, y: 0.53 },
  ]

  let rSum = 0, gSum = 0, bSum = 0, n = 0
  for (const s of samples) {
    const px = ctx.getImageData(
      Math.round(canvas.width * s.x),
      Math.round(canvas.height * s.y),
      6, 6
    ).data
    for (let i = 0; i < px.length; i += 4) {
      rSum += px[i]; gSum += px[i + 1]; bSum += px[i + 2]; n++
    }
  }
  const r = rSum / n, g = gSum / n, b = bSum / n

  if (b > r * 1.2 && b > g * 0.9)          return 'd'  // blue  → diamonds
  if (g > r * 1.3 && g > b * 1.2)          return 'c'  // green → clubs
  if (r > 130 && r > g * 1.35 && r > b * 1.35) return 'h'  // red   → hearts
  return 's'                                             // dark  → spades
}

async function parseCard(
  img: HTMLImageElement,
  regionKey: keyof typeof REGIONS
): Promise<Card | null> {
  const canvas = cropRegion(img, REGIONS[regionKey])
  const text = await ocrCanvas(canvas)

  // Extract rank from OCR text (first 1–2 chars)
  const rankStr = text.replace(/[^AKQJTakqjt0-9]/g, '').slice(0, 2).toUpperCase()
  const rank = RANK_MAP[rankStr] ?? RANK_MAP[rankStr[0]]
  if (!rank) return null

  // 1. Try suit from OCR text (most reliable when Tesseract reads the symbol)
  const ocrSuit = suitFromText(text)
  if (ocrSuit) return { rank, suit: ocrSuit }

  // 2. Fall back to 4-color pixel detection
  return { rank, suit: suitFromPixels(canvas) }
}

function parseMoney(text: string): number {
  const cleaned = text.replace(/[$,\s]/g, '')
  return parseFloat(cleaned) || 0
}

// ── Main OCR entry point ─────────────────────────────────────────────────────

export async function extractGameState(dataUrl: string): Promise<GameState> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = async () => {
      try {
        const state = await _extractGameState(img)
        resolve(state)
      } catch {
        resolve({ ...EMPTY_GAME_STATE, confidence: 'low' })
      }
    }
    img.onerror = () => resolve({ ...EMPTY_GAME_STATE, confidence: 'low' })
    img.src = dataUrl
  })
}


// ── Dealer button (D chip) detection ────────────────────────────────────────

/**
 * Returns the index and pixel score of the seat with the dealer button,
 * or { seat: -1, score: 0 } if none found.
 *
 * Ignition's D chip is silver/grey against a dark teal table felt.
 * We score each region by the fraction of pixels that are significantly
 * brighter than the background (brightness sum > 420, R > 100).
 */
function findDealerChipSeat(
  img: HTMLImageElement,
  seats: Region[]
): { seat: number; score: number } {
  let bestSeat = -1
  let bestScore = 0
  const devLog = typeof window !== 'undefined' && (window as unknown as Record<string, unknown>)['DEV_LOG_DEALER']

  for (let i = 0; i < seats.length; i++) {
    const canvas = cropRegion(img, seats[i])
    const ctx = canvas.getContext('2d')!
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)

    let chipPixels = 0
    for (let p = 0; p < data.length; p += 4) {
      const r = data[p], g = data[p + 1], b = data[p + 2]
      const sum = r + g + b
      const spread = Math.max(r, g, b) - Math.min(r, g, b)
      // Gold chip: high R, moderate G, low B
      const isGold = r > 160 && g > r * 0.55 && b < r * 0.60
      // Silver/grey chip: moderate brightness (not white text), channels roughly equal.
      // Upper bound (sum < 660) rejects pure-white text like "FOLD" / "CHECK" banners.
      // spread < 50 rejects coloured seat-number chips.
      const isSilver = sum > 380 && sum < 660 && spread < 50 && r > 100
      if (isGold || isSilver) chipPixels++
    }

    const pixelCount = data.length / 4
    const score = chipPixels / pixelCount
    if (devLog) console.log(`[dealer] seat ${i} score=${score.toFixed(3)}`)

    // ≥12% bright pixels = chip present (relaxed from 15% to improve recall)
    if (score > 0.12 && score > bestScore) {
      bestScore = score
      bestSeat = i
    }
  }

  return { seat: bestSeat, score: bestScore }
}

/**
 * Infer hero's table position from which seat has the dealer button.
 * Tries both 6-max and 9-max (full ring) layouts and uses whichever
 * produces the stronger chip signal.
 */
function inferPositionFromDealer(img: HTMLImageElement): {
  heroPosition: Position | null
  openerPosition: Position | null
} {
  const r6 = findDealerChipSeat(img, DEALER_CHIP_SEATS_6MAX)
  const r9 = findDealerChipSeat(img, DEALER_CHIP_SEATS_9MAX)

  let seat: number
  let posMap: Array<Position | null>
  let openerMap: Array<Position | null>

  if (r9.score >= r6.score && r9.seat !== -1) {
    seat = r9.seat
    posMap = SEAT_TO_POSITION_9MAX
    openerMap = SEAT_TO_OPENER_9MAX
  } else if (r6.seat !== -1) {
    seat = r6.seat
    posMap = SEAT_TO_POSITION_6MAX
    openerMap = SEAT_TO_OPENER_6MAX
  } else {
    return { heroPosition: null, openerPosition: null }
  }

  const heroPosition = posMap[seat] ?? null
  const openerPosition = heroPosition === 'BB' ? (openerMap[seat] ?? null) : null

  return { heroPosition, openerPosition }
}

// ── Action-button region OCR (detect facing-bet + bet size) ──────────────────

/**
 * Reads the middle action button ("Call X.XX" / "Check").
 * Returns { facingBet, facingBetSizeBB }.
 */
async function detectActionState(img: HTMLImageElement): Promise<{
  facingBet: boolean
  facingBetSizeBB: number
}> {
  const text = await ocrCanvas(cropRegion(img, REGIONS.actionCall))
  const lower = text.toLowerCase()

  if (!lower.includes('call')) return { facingBet: false, facingBetSizeBB: 0 }

  // Extract the dollar/BB amount after "Call"
  const match = text.match(/call\s*\$?([\d.,]+)/i)
  const facingBetSizeBB = match ? parseMoney(match[1]) : 0
  return { facingBet: true, facingBetSizeBB }
}

// ── Main OCR entry point ─────────────────────────────────────────────────────

const devPerf = () =>
  typeof window !== 'undefined' &&
  !!(window as unknown as Record<string, unknown>)['DEV_LOG_PERF']

async function _extractGameState(img: HTMLImageElement): Promise<GameState> {
  const t0 = performance.now()
  const mark = (label: string) => {
    if (devPerf()) console.log(`[ocr perf] ${label}: ${(performance.now() - t0).toFixed(0)}ms`)
  }

  // Text OCR runs on a single Tesseract worker — despite Promise.all the
  // calls are serialized internally. Each recognize() call takes ~200–500 ms.
  const [potText, heroStackText, villStackText, actionState] = await Promise.all([
    ocrCanvas(cropRegion(img, REGIONS.pot)),
    ocrCanvas(cropRegion(img, REGIONS.heroStack)),
    ocrCanvas(cropRegion(img, REGIONS.villStack)),
    detectActionState(img),
  ])
  mark('text+action OCR')

  // Dealer chip is pure pixel math — fast
  const { heroPosition, openerPosition: detectedOpener } = inferPositionFromDealer(img)
  mark('dealer chip')

  const potBB = parseMoney(potText)
  const heroStack = parseMoney(heroStackText)
  const villStack = parseMoney(villStackText)

  // Hero cards (sequential — card2 depended on card1 previously; now independent)
  const [card1, card2] = await Promise.all([
    parseCard(img, 'heroCard1'),
    parseCard(img, 'heroCard2'),
  ])
  const holeCards: [Card, Card] | null = card1 && card2 ? [card1, card2] : null
  mark('hero cards')

  // Board cards
  const rawBoard = await Promise.all([
    parseCard(img, 'board1'),
    parseCard(img, 'board2'),
    parseCard(img, 'board3'),
    parseCard(img, 'board4'),
    parseCard(img, 'board5'),
  ])
  const board = rawBoard.filter((c): c is Card => c !== null)
  mark('board cards')

  const street: Street =
    board.length === 0 ? 'preflop' :
    board.length === 3 ? 'flop' :
    board.length === 4 ? 'turn' : 'river'

  const openerPosition =
    heroPosition === 'BB' && actionState.facingBet ? detectedOpener : null

  const confidence: 'high' | 'low' = holeCards && heroPosition ? 'high' : 'low'
  const elapsed = (performance.now() - t0).toFixed(0)

  const cardStr = (c: Card) => c.rank + c.suit
  console.log(
    `[ocr] ${elapsed}ms | pos=${heroPosition ?? '—'} ` +
    `cards=${holeCards?.map(cardStr).join(',') ?? '—'} ` +
    `board=${board.map(cardStr).join(',') || '—'} ` +
    `pot=${potBB} facing=${actionState.facingBet ? actionState.facingBetSizeBB : 'no'} ` +
    `conf=${confidence}`
  )

  return {
    street,
    holeCards,
    board,
    heroPosition,
    potBB,
    stacksBB: { hero: heroStack, villain: villStack },
    facingBet: actionState.facingBet,
    facingBetSizeBB: actionState.facingBetSizeBB,
    villainsActive: 1,
    openerPosition,
    confidence,
  }
}
