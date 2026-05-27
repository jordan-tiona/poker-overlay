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

/** Detect suit from pixel colour sampling in the card region */
function detectSuit(canvas: HTMLCanvasElement): Suit {
  const ctx = canvas.getContext('2d')!
  // Sample center-left area of card where suit symbol typically is
  const x = Math.round(canvas.width * 0.15)
  const y = Math.round(canvas.height * 0.55)
  const px = ctx.getImageData(x, y, 8, 8).data

  let rSum = 0, gSum = 0, bSum = 0
  for (let i = 0; i < px.length; i += 4) {
    rSum += px[i]; gSum += px[i + 1]; bSum += px[i + 2]
  }
  const n = px.length / 4
  const r = rSum / n, g = gSum / n, b = bSum / n

  // Red suits (hearts/diamonds) have high R, low B
  if (r > 150 && r > g * 1.5 && r > b * 1.5) {
    // Hearts vs diamonds: hearts are darker/rounder, but hard to tell purely by colour
    // For MVP treat red cards as unknown-red; caller picks h/d alternating
    return 'h'
  }
  // Black suits
  if (r < 80 && g < 80 && b < 80) return 's'
  return 's'  // default
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

  const suit = hintSuit ?? detectSuit(canvas)
  return { rank, suit }
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
  const card1 = await parseCard(img, 'heroCard1')
  const card2 = await parseCard(img, 'heroCard2', card1?.suit === 'h' ? 'd' : 'h')
  const holeCards: [Card, Card] | null = card1 && card2 ? [card1, card2] : null

  // Parse board
  const boardCards = await Promise.all([
    parseCard(img, 'board1'),
    parseCard(img, 'board2'),
    parseCard(img, 'board3'),
    parseCard(img, 'board4'),
    parseCard(img, 'board5'),
  ])
  const board = boardCards.filter((c): c is Card => c !== null)

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
    confidence: holeCards ? 'high' : 'low',
  }
}
