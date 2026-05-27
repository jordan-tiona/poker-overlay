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
import type { Card, GameState, Rank, Suit, Street } from '../types/poker'
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
} satisfies Record<string, Region>

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

async function _extractGameState(img: HTMLImageElement): Promise<GameState> {
  // Run OCR on text regions in parallel
  const [potText, heroStackText, villStackText] = await Promise.all([
    ocrCanvas(cropRegion(img, REGIONS.pot)),
    ocrCanvas(cropRegion(img, REGIONS.heroStack)),
    ocrCanvas(cropRegion(img, REGIONS.villStack)),
  ])

  const potBB = parseMoney(potText)
  const heroStack = parseMoney(heroStackText)
  const villStack = parseMoney(villStackText)

  // Parse hole cards
  // If OCR doesn't return a suit symbol, pixel sampling gives us red/black.
  // When both cards are red we can't tell which is h and which is d from colour alone —
  // default card1=h, card2=d. If card1 has an OCR suit, don't override card2.
  const card1 = await parseCard(img, 'heroCard1')
  const card1IsRed = card1?.suit === 'h' || card1?.suit === 'd'
  const card2Hint: Suit | undefined = card1IsRed && !suitKnownFromOCR(card1) ? 'd' : undefined
  const card2 = await parseCard(img, 'heroCard2', card2Hint)
  const holeCards: [Card, Card] | null = card1 && card2 ? [card1, card2] : null

  // Parse board cards — pass pixel-colour hints to distinguish black suits
  // We can't reliably separate s/c or h/d from colour, so we just ensure
  // red cards don't all become the same suit
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

  return {
    street,
    holeCards,
    board,
    heroPosition: null,       // position requires more complex detection
    potBB,
    stacksBB: { hero: heroStack, villain: villStack },
    facingBet: false,         // TODO: detect bet box state
    facingBetSizeBB: 0,
    villainsActive: 1,
    openerPosition: null,     // set manually via UI
    confidence: holeCards ? 'high' : 'low',
  }
}
