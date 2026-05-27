/**
 * Preflop GTO lookup tables.
 *
 * Hand notation: two-char string, e.g. "AKs" (suited), "AKo" (offsuit), "AA" (pair).
 * Frequency: 0–1 (1 = always, 0.5 = mix 50% of the time).
 *
 * Sources: simplified from standard GTO solutions (GTO Wizard, PioSolver outputs).
 * This is an MVP approximation — replace with full solver exports for production.
 */

export type HandKey = string  // e.g. "AKs", "77", "QJo"

export interface PreflopAction {
  action: 'raise' | 'call' | 'fold'
  frequency: number
  sizingBB?: number  // standard open size
}

export interface PreflopSpot {
  primary: PreflopAction
  /** Optional secondary action in a mixed strategy */
  secondary?: PreflopAction
}

// ── RFI (Raise First In) charts by position ──────────────────────────────────

export const RFI: Record<string, Record<HandKey, PreflopSpot>> = {
  BTN:    buildRFI_BTN(),
  CO:     buildRFI_CO(),
  HJ:     buildRFI_HJ(),
  LJ:     buildRFI_LJ(),
  'UTG+2': buildRFI_UTGp2(),
  'UTG+1': buildRFI_UTGp1(),
  UTG:    buildRFI_UTG(),
  SB:     buildRFI_SB(),
  // BB never RFIs — BB defend is handled separately in lookup.ts
}

// ── vs 3-bet (facing a 3-bet after you opened) ───────────────────────────────
export const VS_3BET: Record<string, Record<HandKey, PreflopSpot>> = {
  BTN: buildVs3Bet_BTN(),
  CO:  buildVs3Bet_CO(),
  HJ:  buildVs3Bet_HJ(),
  SB:  buildVs3Bet_SB(),
  UTG: buildVs3Bet_UTG(),
}

// ── BB defend (facing an open raise) ─────────────────────────────────────────
// Keyed by opener position, then hand key → fold / call / 3-bet
export const BB_DEFEND: Record<string, Record<HandKey, PreflopSpot>> = {
  BTN: buildBBDefend_vsBTN(),
  CO:  buildBBDefend_vsCO(),
  HJ:  buildBBDefend_vsHJ(),
  SB:  buildBBDefend_vsSB(),
  UTG: buildBBDefend_vsUTG(),
}

// ────────────────────────────────────────────────────────────────────────────
// Helper constructors
// ────────────────────────────────────────────────────────────────────────────

function always(sizingBB = 2.5): PreflopSpot {
  return { primary: { action: 'raise', frequency: 1, sizingBB } }
}
function mixed(freq: number, sizingBB = 2.5): PreflopSpot {
  return {
    primary: { action: 'raise', frequency: freq, sizingBB },
    secondary: { action: 'fold', frequency: 1 - freq },
  }
}
function call(freq = 1): PreflopSpot {
  return { primary: { action: 'call', frequency: freq } }
}
function callOrFold(freq: number): PreflopSpot {
  return {
    primary: { action: 'call', frequency: freq },
    secondary: { action: 'fold', frequency: 1 - freq },
  }
}
function threebet(freq = 1, sizingBB = 9): PreflopSpot {
  return { primary: { action: 'raise', frequency: freq, sizingBB } }
}
function threebetOrCall(tbFreq: number, sizingBB = 9): PreflopSpot {
  return {
    primary: { action: 'raise', frequency: tbFreq, sizingBB },
    secondary: { action: 'call', frequency: 1 - tbFreq },
  }
}
function shove(freq = 1): PreflopSpot {
  return { primary: { action: 'raise', frequency: freq, sizingBB: 999 } }
}

// ────────────────────────────────────────────────────────────────────────────
// RFI charts
// ────────────────────────────────────────────────────────────────────────────

function buildRFI_BTN(): Record<HandKey, PreflopSpot> {
  return {
    // Pairs
    AA: always(), KK: always(), QQ: always(), JJ: always(), TT: always(),
    '99': always(), '88': always(), '77': always(), '66': always(),
    '55': always(), '44': mixed(0.7), '33': mixed(0.5), '22': mixed(0.5),
    // Suited aces
    AKs: always(), AQs: always(), AJs: always(), ATs: always(),
    A9s: always(), A8s: always(), A7s: always(), A6s: always(),
    A5s: always(), A4s: always(), A3s: always(), A2s: always(),
    // Offsuit aces
    AKo: always(), AQo: always(), AJo: always(), ATo: always(),
    A9o: mixed(0.8), A8o: mixed(0.6), A7o: mixed(0.4), A6o: mixed(0.3),
    // Suited kings
    KQs: always(), KJs: always(), KTs: always(),
    K9s: always(), K8s: always(), K7s: always(), K6s: always(), K5s: always(),
    // Offsuit kings
    KQo: always(), KJo: always(), KTo: always(),
    K9o: mixed(0.6), K8o: mixed(0.3),
    // Suited queens
    QJs: always(), QTs: always(), Q9s: always(), Q8s: always(), Q7s: always(),
    // Offsuit queens
    QJo: always(), QTo: always(), Q9o: mixed(0.5),
    // Suited jacks
    JTs: always(), J9s: always(), J8s: always(),
    // Offsuit jacks
    JTo: always(), J9o: mixed(0.4),
    // Suited tens
    T9s: always(), T8s: always(), T7s: always(),
    // Offsuit tens
    T9o: mixed(0.4),
    // Suited connectors / one-gappers
    '98s': always(), '97s': always(), '87s': always(), '86s': always(),
    '76s': always(), '75s': always(), '65s': always(), '64s': always(),
    '54s': always(), '53s': mixed(0.6), '43s': mixed(0.4),
    // Offsuit connectors
    '98o': mixed(0.3),
  }
}

function buildRFI_CO(): Record<HandKey, PreflopSpot> {
  return {
    AA: always(), KK: always(), QQ: always(), JJ: always(), TT: always(),
    '99': always(), '88': always(), '77': always(), '66': always(),
    '55': mixed(0.8), '44': mixed(0.5), '33': mixed(0.3), '22': mixed(0.2),
    AKs: always(), AQs: always(), AJs: always(), ATs: always(),
    A9s: always(), A8s: always(), A7s: always(), A6s: always(),
    A5s: always(), A4s: always(), A3s: always(), A2s: always(),
    AKo: always(), AQo: always(), AJo: always(), ATo: always(),
    A9o: mixed(0.6), A8o: mixed(0.4),
    KQs: always(), KJs: always(), KTs: always(), K9s: always(), K8s: mixed(0.5),
    KQo: always(), KJo: always(), KTo: mixed(0.7),
    QJs: always(), QTs: always(), Q9s: always(), Q8s: mixed(0.5),
    QJo: mixed(0.8), QTo: mixed(0.5),
    JTs: always(), J9s: always(), J8s: mixed(0.5),
    JTo: mixed(0.6),
    T9s: always(), T8s: always(), T7s: mixed(0.5),
    '98s': always(), '97s': always(), '87s': always(), '76s': always(),
    '65s': always(), '54s': always(), '43s': mixed(0.4),
  }
}

function buildRFI_HJ(): Record<HandKey, PreflopSpot> {
  return {
    AA: always(), KK: always(), QQ: always(), JJ: always(), TT: always(),
    '99': always(), '88': always(), '77': mixed(0.9), '66': mixed(0.7),
    '55': mixed(0.5), '44': mixed(0.3),
    AKs: always(), AQs: always(), AJs: always(), ATs: always(), A9s: always(),
    A8s: always(), A7s: mixed(0.8), A6s: mixed(0.6), A5s: always(), A4s: mixed(0.8),
    A3s: mixed(0.7), A2s: mixed(0.6),
    AKo: always(), AQo: always(), AJo: always(), ATo: mixed(0.9),
    KQs: always(), KJs: always(), KTs: always(), K9s: mixed(0.7),
    KQo: always(), KJo: mixed(0.8),
    QJs: always(), QTs: always(), Q9s: mixed(0.6),
    JTs: always(), J9s: mixed(0.7),
    T9s: always(), '98s': always(), '87s': always(), '76s': always(), '65s': always(),
    '54s': mixed(0.6),
  }
}

function buildRFI_LJ(): Record<HandKey, PreflopSpot> {
  // LJ (lojack) = UTG+2 in a 9-max game — slightly tighter than HJ
  return {
    AA: always(), KK: always(), QQ: always(), JJ: always(), TT: always(),
    '99': always(), '88': mixed(0.9), '77': mixed(0.7), '66': mixed(0.5),
    AKs: always(), AQs: always(), AJs: always(), ATs: always(), A9s: mixed(0.9),
    A8s: mixed(0.7), A5s: mixed(0.8), A4s: mixed(0.6), A3s: mixed(0.5), A2s: mixed(0.4),
    AKo: always(), AQo: always(), AJo: mixed(0.9),
    KQs: always(), KJs: always(), KTs: mixed(0.9),
    KQo: always(), KJo: mixed(0.6),
    QJs: always(), QTs: mixed(0.9),
    JTs: always(), T9s: mixed(0.8), '98s': mixed(0.7), '87s': mixed(0.6), '76s': mixed(0.5),
  }
}

function buildRFI_UTGp2(): Record<HandKey, PreflopSpot> {
  return {
    AA: always(), KK: always(), QQ: always(), JJ: always(), TT: always(),
    '99': always(), '88': mixed(0.8), '77': mixed(0.6),
    AKs: always(), AQs: always(), AJs: always(), ATs: always(), A9s: mixed(0.8),
    A8s: mixed(0.6), A5s: mixed(0.7),
    AKo: always(), AQo: always(), AJo: mixed(0.8),
    KQs: always(), KJs: always(), KTs: mixed(0.8),
    KQo: always(),
    QJs: always(), QTs: mixed(0.8),
    JTs: always(), T9s: mixed(0.7), '98s': mixed(0.6),
  }
}

function buildRFI_UTGp1(): Record<HandKey, PreflopSpot> {
  return {
    AA: always(), KK: always(), QQ: always(), JJ: always(), TT: always(),
    '99': always(), '88': mixed(0.7),
    AKs: always(), AQs: always(), AJs: always(), ATs: always(), A9s: mixed(0.7),
    A5s: mixed(0.6),
    AKo: always(), AQo: always(), AJo: mixed(0.7),
    KQs: always(), KJs: always(), KTs: mixed(0.7),
    KQo: always(),
    QJs: always(), QTs: mixed(0.7),
    JTs: always(), T9s: mixed(0.6),
  }
}

function buildRFI_UTG(): Record<HandKey, PreflopSpot> {
  return {
    AA: always(), KK: always(), QQ: always(), JJ: always(), TT: always(), '99': always(),
    AKs: always(), AQs: always(), AJs: always(), ATs: always(),
    AKo: always(), AQo: always(),
    KQs: always(), KJs: always(), KTs: mixed(0.8),
    KQo: mixed(0.9),
    QJs: always(), QTs: mixed(0.8),
    JTs: always(),
    '88': mixed(0.9), '77': mixed(0.7),
    A9s: mixed(0.8), A8s: mixed(0.5), A5s: mixed(0.7),
    AJo: mixed(0.9), ATo: mixed(0.5),
    T9s: mixed(0.6), '98s': mixed(0.5),
  }
}

function buildRFI_SB(): Record<HandKey, PreflopSpot> {
  // SB opens ~40% vs BB, sizing 3x typically
  return {
    AA: always(3), KK: always(3), QQ: always(3), JJ: always(3), TT: always(3),
    '99': always(3), '88': always(3), '77': always(3), '66': mixed(0.8, 3),
    '55': mixed(0.6, 3), '44': mixed(0.4, 3), '33': mixed(0.3, 3),
    AKs: always(3), AQs: always(3), AJs: always(3), ATs: always(3),
    A9s: always(3), A8s: always(3), A7s: mixed(0.8, 3), A6s: mixed(0.7, 3),
    A5s: always(3), A4s: mixed(0.7, 3), A3s: mixed(0.6, 3), A2s: mixed(0.5, 3),
    AKo: always(3), AQo: always(3), AJo: always(3), ATo: mixed(0.8, 3),
    A9o: mixed(0.5, 3), A8o: mixed(0.4, 3),
    KQs: always(3), KJs: always(3), KTs: mixed(0.9, 3), K9s: mixed(0.7, 3),
    K8s: mixed(0.5, 3), K7s: mixed(0.4, 3),
    KQo: always(3), KJo: mixed(0.7, 3), KTo: mixed(0.5, 3),
    QJs: always(3), QTs: mixed(0.8, 3), Q9s: mixed(0.6, 3),
    QJo: mixed(0.6, 3), QTo: mixed(0.4, 3),
    JTs: always(3), J9s: mixed(0.6, 3),
    T9s: mixed(0.7, 3), T8s: mixed(0.5, 3),
    '98s': mixed(0.6, 3), '87s': mixed(0.5, 3), '76s': mixed(0.4, 3),
  }
}

// ────────────────────────────────────────────────────────────────────────────
// VS 3-bet charts
// ────────────────────────────────────────────────────────────────────────────

function buildVs3Bet_BTN(): Record<HandKey, PreflopSpot> {
  return {
    AA: shove(), KK: shove(), QQ: shove(0.7), AKs: shove(), AKo: shove(0.9),
    JJ: call(), TT: call(), '99': call(),
    AQs: call(), AJs: call(), KQs: call(), QJs: call(), JTs: call(),
    AQo: callOrFold(0.7),
    // 4-bet bluffs
    A5s: { primary: { action: 'raise', frequency: 0.5, sizingBB: 999 }, secondary: { action: 'fold', frequency: 0.5 } },
    A4s: { primary: { action: 'raise', frequency: 0.4, sizingBB: 999 }, secondary: { action: 'fold', frequency: 0.6 } },
  }
}

function buildVs3Bet_CO(): Record<HandKey, PreflopSpot> {
  return {
    AA: shove(), KK: shove(), QQ: shove(0.6), AKs: shove(), AKo: shove(0.8),
    JJ: call(), TT: call(), '99': callOrFold(0.7),
    AQs: call(), AJs: callOrFold(0.8), KQs: callOrFold(0.7),
    AQo: callOrFold(0.5),
    A5s: { primary: { action: 'raise', frequency: 0.4, sizingBB: 999 }, secondary: { action: 'fold', frequency: 0.6 } },
    A4s: { primary: { action: 'raise', frequency: 0.3, sizingBB: 999 }, secondary: { action: 'fold', frequency: 0.7 } },
  }
}

function buildVs3Bet_HJ(): Record<HandKey, PreflopSpot> {
  return {
    AA: shove(), KK: shove(), QQ: shove(0.5), AKs: shove(0.9), AKo: shove(0.7),
    JJ: call(), TT: callOrFold(0.8), '99': callOrFold(0.5),
    AQs: callOrFold(0.9), AJs: callOrFold(0.5), KQs: callOrFold(0.5),
    A5s: { primary: { action: 'raise', frequency: 0.3, sizingBB: 999 }, secondary: { action: 'fold', frequency: 0.7 } },
  }
}

function buildVs3Bet_SB(): Record<HandKey, PreflopSpot> {
  // SB opened, faces a 3-bet from BB
  return {
    AA: shove(), KK: shove(), QQ: shove(0.6), AKs: shove(), AKo: shove(0.8),
    JJ: call(), TT: call(), '99': callOrFold(0.7),
    AQs: call(), AJs: callOrFold(0.8), KQs: callOrFold(0.7),
    AQo: callOrFold(0.5), KQo: callOrFold(0.4),
    // 4-bet bluffs with blockers
    A5s: { primary: { action: 'raise', frequency: 0.5, sizingBB: 999 }, secondary: { action: 'fold', frequency: 0.5 } },
    A4s: { primary: { action: 'raise', frequency: 0.4, sizingBB: 999 }, secondary: { action: 'fold', frequency: 0.6 } },
    A3s: { primary: { action: 'raise', frequency: 0.3, sizingBB: 999 }, secondary: { action: 'fold', frequency: 0.7 } },
  }
}

function buildVs3Bet_UTG(): Record<HandKey, PreflopSpot> {
  // UTG opened, faces a 3-bet — tight range, mostly value 4-bets or folds
  return {
    AA: shove(), KK: shove(), QQ: shove(0.4), AKs: shove(0.8), AKo: shove(0.6),
    JJ: callOrFold(0.9), TT: callOrFold(0.6),
    AQs: callOrFold(0.7), AQo: callOrFold(0.4),
    // 4-bet bluffs — very rare from UTG
    A5s: { primary: { action: 'raise', frequency: 0.25, sizingBB: 999 }, secondary: { action: 'fold', frequency: 0.75 } },
  }
}

// ────────────────────────────────────────────────────────────────────────────
// BB defend charts (BB faces an open from listed position)
// ────────────────────────────────────────────────────────────────────────────

function buildBBDefend_vsBTN(): Record<HandKey, PreflopSpot> {
  // BB gets best pot odds vs BTN — wide defend range
  return {
    // 3-bet value
    AA: threebet(), KK: threebet(), QQ: threebet(), JJ: threebet(0.8),
    AKs: threebet(), AQs: threebet(0.8), AKo: threebet(),
    // 3-bet bluffs
    A5s: threebetOrCall(0.5), A4s: threebetOrCall(0.4), A3s: threebetOrCall(0.3),
    '54s': threebetOrCall(0.3), '76s': threebetOrCall(0.3),
    // Call wide
    TT: call(), '99': call(), '88': call(), '77': call(), '66': call(),
    '55': call(), '44': call(), '33': call(), '22': call(),
    AJs: call(), ATs: call(), A9s: call(), A8s: call(), A7s: call(), A6s: call(), A2s: call(),
    AQo: call(), AJo: call(), ATo: call(), A9o: call(), A8o: callOrFold(0.8), A7o: callOrFold(0.6),
    KQs: call(), KJs: call(), KTs: call(), K9s: call(), K8s: call(), K7s: callOrFold(0.7),
    K6s: callOrFold(0.6), K5s: callOrFold(0.5),
    KQo: call(), KJo: call(), KTo: call(), K9o: callOrFold(0.7), K8o: callOrFold(0.5),
    QJs: call(), QTs: call(), Q9s: call(), Q8s: callOrFold(0.8), Q7s: callOrFold(0.6),
    QJo: call(), QTo: call(), Q9o: callOrFold(0.7),
    JTs: call(), J9s: call(), J8s: callOrFold(0.8), J7s: callOrFold(0.5),
    JTo: call(), J9o: callOrFold(0.7),
    T9s: call(), T8s: call(), T7s: callOrFold(0.7),
    T9o: callOrFold(0.7), T8o: callOrFold(0.5),
    '98s': call(), '97s': call(), '96s': callOrFold(0.6),
    '87s': call(), '86s': callOrFold(0.7), '85s': callOrFold(0.5),
    '75s': callOrFold(0.7),
    '65s': call(), '64s': callOrFold(0.6),
    '53s': callOrFold(0.6),
    '43s': callOrFold(0.5),
  }
}

function buildBBDefend_vsCO(): Record<HandKey, PreflopSpot> {
  // Slightly tighter than vs BTN
  return {
    AA: threebet(), KK: threebet(), QQ: threebet(), JJ: threebetOrCall(0.7),
    AKs: threebet(), AQs: threebet(0.7), AKo: threebet(),
    A5s: threebetOrCall(0.4), A4s: threebetOrCall(0.3),
    TT: call(), '99': call(), '88': call(), '77': call(), '66': call(), '55': callOrFold(0.8),
    '44': callOrFold(0.6), '33': callOrFold(0.5), '22': callOrFold(0.4),
    AJs: call(), ATs: call(), A9s: call(), A8s: call(), A7s: callOrFold(0.8), A6s: callOrFold(0.7),
    AQo: call(), AJo: call(), ATo: call(), A9o: callOrFold(0.8), A8o: callOrFold(0.5),
    KQs: call(), KJs: call(), KTs: call(), K9s: call(), K8s: callOrFold(0.7),
    KQo: call(), KJo: call(), KTo: callOrFold(0.7), K9o: callOrFold(0.5),
    QJs: call(), QTs: call(), Q9s: callOrFold(0.8), Q8s: callOrFold(0.6),
    QJo: call(), QTo: callOrFold(0.7),
    JTs: call(), J9s: call(), J8s: callOrFold(0.6),
    JTo: callOrFold(0.7), J9o: callOrFold(0.5),
    T9s: call(), T8s: callOrFold(0.8), T7s: callOrFold(0.5),
    '98s': call(), '97s': callOrFold(0.7), '87s': call(), '76s': call(), '65s': callOrFold(0.8),
  }
}

function buildBBDefend_vsHJ(): Record<HandKey, PreflopSpot> {
  return {
    AA: threebet(), KK: threebet(), QQ: threebet(), JJ: threebetOrCall(0.6),
    AKs: threebet(), AQs: threebet(0.6), AKo: threebet(),
    A5s: threebetOrCall(0.3), A4s: threebetOrCall(0.3),
    TT: call(), '99': call(), '88': call(), '77': call(), '66': callOrFold(0.8),
    '55': callOrFold(0.6), '44': callOrFold(0.4), '33': callOrFold(0.3), '22': callOrFold(0.3),
    AJs: call(), ATs: call(), A9s: call(), A8s: callOrFold(0.9), A7s: callOrFold(0.7),
    AQo: call(), AJo: call(), ATo: callOrFold(0.8), A9o: callOrFold(0.6),
    KQs: call(), KJs: call(), KTs: call(), K9s: callOrFold(0.8),
    KQo: call(), KJo: call(), KTo: callOrFold(0.6),
    QJs: call(), QTs: call(), Q9s: callOrFold(0.7),
    QJo: callOrFold(0.8), QTo: callOrFold(0.5),
    JTs: call(), J9s: callOrFold(0.8),
    T9s: call(), T8s: callOrFold(0.7),
    '98s': call(), '87s': callOrFold(0.8), '76s': callOrFold(0.7), '65s': callOrFold(0.6),
  }
}

function buildBBDefend_vsSB(): Record<HandKey, PreflopSpot> {
  // SB opens 3x — BB getting worse odds, but SB range is wide
  return {
    AA: threebet(), KK: threebet(), QQ: threebet(), JJ: threebet(0.7),
    AKs: threebet(), AQs: threebet(0.6), AKo: threebet(), AQo: threebetOrCall(0.6),
    A5s: threebetOrCall(0.5), A4s: threebetOrCall(0.4), A3s: threebetOrCall(0.3),
    '54s': threebetOrCall(0.4), '65s': threebetOrCall(0.3),
    TT: call(), '99': call(), '88': call(), '77': call(), '66': call(),
    '55': callOrFold(0.7), '44': callOrFold(0.5), '33': callOrFold(0.4), '22': callOrFold(0.3),
    AJs: call(), ATs: call(), A9s: call(), A8s: call(), A7s: callOrFold(0.8),
    AJo: call(), ATo: call(), A9o: callOrFold(0.7),
    KQs: call(), KJs: call(), KTs: call(), K9s: call(), K8s: callOrFold(0.7),
    KQo: call(), KJo: call(), KTo: callOrFold(0.7),
    QJs: call(), QTs: call(), Q9s: callOrFold(0.8),
    QJo: call(), QTo: callOrFold(0.6),
    JTs: call(), J9s: call(),
    T9s: call(), T8s: callOrFold(0.7),
    '98s': call(), '87s': callOrFold(0.8), '76s': callOrFold(0.7),
  }
}

function buildBBDefend_vsUTG(): Record<HandKey, PreflopSpot> {
  // UTG has tightest range — BB defends tighter too
  return {
    AA: threebet(), KK: threebet(), QQ: threebet(0.7), JJ: threebetOrCall(0.4),
    AKs: threebet(), AQs: threebetOrCall(0.5), AKo: threebet(0.9),
    A5s: threebetOrCall(0.3),
    TT: call(), '99': call(), '88': callOrFold(0.8), '77': callOrFold(0.6),
    '66': callOrFold(0.4), '55': callOrFold(0.3), '44': callOrFold(0.2),
    AJs: call(), ATs: call(), A9s: callOrFold(0.7), A8s: callOrFold(0.5),
    AQo: call(), AJo: callOrFold(0.7), ATo: callOrFold(0.5),
    KQs: call(), KJs: callOrFold(0.8), KTs: callOrFold(0.6),
    KQo: callOrFold(0.8), KJo: callOrFold(0.5),
    QJs: callOrFold(0.8), QTs: callOrFold(0.6),
    JTs: callOrFold(0.7),
    T9s: callOrFold(0.5),
  }
}
