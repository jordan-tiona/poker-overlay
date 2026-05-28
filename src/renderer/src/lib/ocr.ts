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

// ── Dealer-button (D-chip) seat regions (1920×1080 reference) ────────────────
//
// Ignition's 6-max oval table has 6 seat positions. Hero is always at the
// bottom-center (seat index 0). Seats are numbered clockwise:
//   0 = hero (bottom)     3 = top-right
//   1 = right             4 = top-left
//   2 = upper-right       5 = left
//
// The D chip is a small gold/yellow circle (~30 px) that moves between these
// positions. We sample a ~40×30 px patch at each location and look for the
// distinctive gold colour (high R+G, low B).
//
// ⚠️  These coordinates are approximate — run with DEV_LOG_DEALER=true in the
//     console to print RGB samples from each region and tune x/y if needed.
//
const DEALER_CHIP_SEATS: Region[] = [
  { x: 0.456, y: 0.748, w: 0.040, h: 0.028 },  // 0 hero
  { x: 0.705, y: 0.660, w: 0.040, h: 0.028 },  // 1 right
  { x: 0.785, y: 0.450, w: 0.040, h: 0.028 },  // 2 upper-right
  { x: 0.636, y: 0.305, w: 0.040, h: 0.028 },  // 3 top-right
  { x: 0.368, y: 0.305, w: 0.040, h: 0.028 },  // 4 top-left
  { x: 0.222, y: 0.450, w: 0.040, h: 0.028 },  // 5 left
  { x: 0.265, y: 0.660, w: 0.040, h: 0.028 },  // 6 lower-left (7-handed overflow)
]

// Seat index → hero's position for a 6-max table.
// Clockwise seat layout means:
//   D at seat 0 (hero)         → hero is BTN
//   D at seat 1 (right)        → hero is CO   (BTN is one seat to the right)
//   D at seat 2 (upper-right)  → hero is HJ
//   D at seat 3 (top-right)    → hero is LJ
//   D at seat 4 (top-left)     → hero is BB
//   D at seat 5 (left)         → hero is SB
const SEAT_TO_POSITION_6MAX: Array<Position | null> = [
  'BTN', 'CO', 'HJ', 'LJ', 'BB', 'SB', null,
]

// Seat positions that opened preflop (for BB defend chart), indexed same as above
// If D is at seat X, the BTN is that seat, opener could be any of LJ/HJ/CO/BTN/SB
// We default to guessing the BTN opened (most common single-raise spot)
const SEAT_TO_OPENER_6MAX: Array<Position | null> = [
  null, 'BTN', 'CO', 'HJ', 'CO', 'BTN', null,
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
 * Detect suit from pixel colour sampling in the card region.
 * Samples multiple rows to get a more reliable colour read.
 *
 * Ignition card colours (approximate):
 *   Hearts   — red   (#cc0000 area)
 *   Diamonds — red   (#cc0000 area)  ← same hue, different shape
 *   Spades   — dark grey / black
 *   Clubs    — dark grey / black (sometimes with slight green tint)
 *
 * We can reliably distinguish red vs black. Hearts vs diamonds and
 * spades vs clubs require shape analysis which is not implemented here;
 * instead we use a consistent tie-breaking rule: first red card = 'h',
 * second red card = 'd' (caller passes hintSuit for this).
 */
function suitFromPixels(canvas: HTMLCanvasElement): 'red' | 'black' {
  const ctx = canvas.getContext('2d')!
  // Sample a wider strip where the suit pip is likely to appear
  const samples = [
    { x: 0.10, y: 0.50 },
    { x: 0.15, y: 0.55 },
    { x: 0.20, y: 0.60 },
    { x: 0.10, y: 0.65 },
  ]

  let redScore = 0
  for (const s of samples) {
    const px = ctx.getImageData(
      Math.round(canvas.width * s.x),
      Math.round(canvas.height * s.y),
      6, 6
    ).data
    let rSum = 0, gSum = 0, bSum = 0
    for (let i = 0; i < px.length; i += 4) {
      rSum += px[i]; gSum += px[i + 1]; bSum += px[i + 2]
    }
    const n = px.length / 4
    const r = rSum / n, g = gSum / n, b = bSum / n
    if (r > 140 && r > g * 1.4 && r > b * 1.4) redScore++
  }

  return redScore >= 2 ? 'red' : 'black'
}

async function parseCard(
  img: HTMLImageElement,
  regionKey: keyof typeof REGIONS,
  hintSuit?: Suit
): Promise<Card | null> {
  const canvas = cropRegion(img, REGIONS[regionKey])
  const text = await ocrCanvas(canvas)

  // Extract rank from OCR text (first 1–2 chars)
  const rankStr = text.replace(/[^AKQJTakqjt0-9]/g, '').slice(0, 2).toUpperCase()
  const rank = RANK_MAP[rankStr] ?? RANK_MAP[rankStr[0]]
  if (!rank) return null

  // 1. Try to get suit directly from OCR text
  const ocrSuit = suitFromText(text)
  if (ocrSuit) return { rank, suit: ocrSuit }

  // 2. If caller provided a hint (e.g. "this should be the other red suit"), use it
  if (hintSuit) return { rank, suit: hintSuit }

  // 3. Fall back to pixel colour — can distinguish red vs black
  const colour = suitFromPixels(canvas)
  return { rank, suit: colour === 'red' ? 'h' : 's' }
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

/** True if the card's suit was identified via OCR text (not just pixel colour) */
function suitKnownFromOCR(card: Card | null): boolean {
  // We can't track this perfectly without returning metadata from parseCard,
  // so we use a heuristic: if both h and d are possible, we don't know.
  // This function is used to decide whether to pass a hint to the sibling card.
  // Conservative: treat all suits as unknown unless we're sure.
  return false  // TODO: thread OCR confidence through parseCard return value
}

/**
 * For a list of board cards where some may have guessed suits (h/s for red/black),
 * spread red suits across h and d to avoid all red cards being 'h'.
 * Black suits alternate between s and c similarly.
 * Cards whose suit came from OCR text are left unchanged.
 */
function alternateRedSuits(cards: Card[]): Card[] {
  let redCount = 0
  let blackCount = 0
  return cards.map(card => {
    if (card.suit === 'h' || card.suit === 'd') {
      const suit: Suit = redCount % 2 === 0 ? 'h' : 'd'
      redCount++
      return { ...card, suit }
    } else {
      const suit: Suit = blackCount % 2 === 0 ? 's' : 'c'
      blackCount++
      return { ...card, suit }
    }
  })
}

// ── Dealer button (D chip) detection ────────────────────────────────────────

/**
 * Returns the index into DEALER_CHIP_SEATS of the seat that currently has the
 * dealer button, or -1 if none found.
 *
 * Detection heuristic: the D chip in Ignition is gold/yellow — high red,
 * high green (≥ red × 0.65), low blue (< red × 0.55).  We sample several
 * pixels in each region and count how many match.
 */
function findDealerChipSeat(img: HTMLImageElement): number {
  let bestSeat = -1
  let bestScore = 0

  for (let i = 0; i < DEALER_CHIP_SEATS.length; i++) {
    const canvas = cropRegion(img, DEALER_CHIP_SEATS[i])
    const ctx = canvas.getContext('2d')!
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)

    let goldPixels = 0
    for (let p = 0; p < data.length; p += 4) {
      const r = data[p], g = data[p + 1], b = data[p + 2]
      if (r > 160 && g > r * 0.60 && b < r * 0.55 && r > 100) goldPixels++
    }

    // Need ≥15% of pixels to be gold to count as a chip
    const pixelCount = data.length / 4
    const score = goldPixels / pixelCount
    if (score > 0.15 && score > bestScore) {
      bestScore = score
      bestSeat = i
    }
  }

  return bestSeat
}

/**
 * Infer hero's table position from which seat has the dealer button.
 * Also returns a best-guess openerPosition for BB-defend situations.
 */
function inferPositionFromDealer(img: HTMLImageElement): {
  heroPosition: Position | null
  openerPosition: Position | null
} {
  const seat = findDealerChipSeat(img)
  if (seat === -1) return { heroPosition: null, openerPosition: null }

  const heroPosition = SEAT_TO_POSITION_6MAX[seat] ?? null
  const openerPosition = heroPosition === 'BB'
    ? (SEAT_TO_OPENER_6MAX[seat] ?? null)
    : null

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

// ── Main OCR entry point (updated) ───────────────────────────────────────────

async function _extractGameState(img: HTMLImageElement): Promise<GameState> {
  // Run OCR on text regions + action state + position in parallel
  const [potText, heroStackText, villStackText, actionState] = await Promise.all([
    ocrCanvas(cropRegion(img, REGIONS.pot)),
    ocrCanvas(cropRegion(img, REGIONS.heroStack)),
    ocrCanvas(cropRegion(img, REGIONS.villStack)),
    detectActionState(img),
  ])

  // Dealer-chip detection is pixel-only (sync-enough inside the same tick)
  const { heroPosition, openerPosition: detectedOpener } = inferPositionFromDealer(img)

  const potBB = parseMoney(potText)
  const heroStack = parseMoney(heroStackText)
  const villStack = parseMoney(villStackText)

  // Parse hole cards
  const card1 = await parseCard(img, 'heroCard1')
  const card1IsRed = card1?.suit === 'h' || card1?.suit === 'd'
  const card2Hint: Suit | undefined = card1IsRed && !suitKnownFromOCR(card1) ? 'd' : undefined
  const card2 = await parseCard(img, 'heroCard2', card2Hint)
  const holeCards: [Card, Card] | null = card1 && card2 ? [card1, card2] : null

  // Parse board cards
  const rawBoard = await Promise.all([
    parseCard(img, 'board1'),
    parseCard(img, 'board2'),
    parseCard(img, 'board3'),
    parseCard(img, 'board4'),
    parseCard(img, 'board5'),
  ])
  const board = alternateRedSuits(rawBoard.filter((c): c is Card => c !== null))

  const street: Street =
    board.length === 0 ? 'preflop' :
    board.length === 3 ? 'flop' :
    board.length === 4 ? 'turn' : 'river'

  // For BB facing a bet, prefer the detected opener; otherwise null
  const openerPosition =
    heroPosition === 'BB' && actionState.facingBet ? detectedOpener : null

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
    confidence: holeCards && heroPosition ? 'high' : holeCards ? 'low' : 'low',
  }
}
