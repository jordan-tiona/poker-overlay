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

/** Hands that are always-open (frequency = 1) or mixed from each position */
export const RFI: Record<string, Record<HandKey, PreflopSpot>> = {
  BTN: buildRFI_BTN(),
  CO: buildRFI_CO(),
  HJ: buildRFI_HJ(),
  SB: buildRFI_SB(),
  UTG: buildRFI_UTG(),
}

// ── vs 3-bet (facing a 3-bet after you opened) ───────────────────────────────
export const VS_3BET: Record<string, Record<HandKey, PreflopSpot>> = {
  BTN: buildVs3Bet_BTN(),
}

// ────────────────────────────────────────────────────────────────────────────
// Chart builders
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
function fold(): PreflopSpot {
  return { primary: { action: 'fold', frequency: 1 } }
}
function call(freq = 1): PreflopSpot {
  return { primary: { action: 'call', frequency: freq } }
}

function buildRFI_BTN(): Record<HandKey, PreflopSpot> {
  return {
    // Premium
    AA: always(), KK: always(), QQ: always(), JJ: always(), TT: always(),
    AKs: always(), AQs: always(), AJs: always(), ATs: always(),
    AKo: always(), AQo: always(),
    KQs: always(), KJs: always(), KTs: always(),
    QJs: always(), QTs: always(),
    JTs: always(), T9s: always(),

    // Strong — always open from BTN
    '99': always(), '88': always(), '77': always(), '66': always(),
    A9s: always(), A8s: always(), A7s: always(), A6s: always(), A5s: always(), A4s: always(), A3s: always(), A2s: always(),
    AJo: always(), ATo: always(),
    KQo: always(), KJo: always(), KTo: always(),
    QJo: always(), QTo: always(),
    JTo: always(),
    K9s: always(), K8s: always(), K7s: always(), K6s: always(), K5s: always(),
    Q9s: always(), Q8s: always(), Q7s: always(),
    J9s: always(), J8s: always(),
    T8s: always(), T7s: always(),
    '98s': always(), '97s': always(), '87s': always(), '86s': always(), '76s': always(), '75s': always(), '65s': always(), '64s': always(), '54s': always(),

    // Mixed or marginal
    '55': always(), '44': mixed(0.7), '33': mixed(0.5), '22': mixed(0.5),
    A9o: mixed(0.8), A8o: mixed(0.6), A7o: mixed(0.4), A6o: mixed(0.3),
    K9o: mixed(0.6), K8o: mixed(0.3),
    Q9o: mixed(0.5), J9o: mixed(0.4), T9o: mixed(0.4),
    '98o': mixed(0.3),

    // Fold
    '72o': fold(), '82o': fold(), '92o': fold(),
  }
}

function buildRFI_CO(): Record<HandKey, PreflopSpot> {
  return {
    AA: always(), KK: always(), QQ: always(), JJ: always(), TT: always(), '99': always(), '88': always(),
    AKs: always(), AQs: always(), AJs: always(), ATs: always(), A9s: always(), A8s: always(),
    AKo: always(), AQo: always(), AJo: always(), ATo: always(),
    KQs: always(), KJs: always(), KTs: always(), K9s: always(),
    KQo: always(), KJo: always(),
    QJs: always(), QTs: always(), Q9s: always(),
    JTs: always(), J9s: always(),
    T9s: always(), T8s: always(),
    '98s': always(), '97s': always(), '87s': always(), '76s': always(), '65s': always(), '54s': always(),
    '77': always(), '66': always(), '55': mixed(0.8), '44': mixed(0.5), '33': mixed(0.3),
    A7s: always(), A6s: always(), A5s: always(), A4s: always(), A3s: always(), A2s: always(),
    QJo: mixed(0.8), QTo: mixed(0.5),
    KTo: mixed(0.7), K8s: mixed(0.5),
    JTo: mixed(0.6),
    A9o: mixed(0.6), A8o: mixed(0.4),
  }
}

function buildRFI_HJ(): Record<HandKey, PreflopSpot> {
  return {
    AA: always(), KK: always(), QQ: always(), JJ: always(), TT: always(), '99': always(), '88': always(), '77': mixed(0.9),
    AKs: always(), AQs: always(), AJs: always(), ATs: always(), A9s: always(),
    AKo: always(), AQo: always(), AJo: always(), ATo: mixed(0.9),
    KQs: always(), KJs: always(), KTs: always(),
    KQo: always(), KJo: mixed(0.8),
    QJs: always(), QTs: always(),
    JTs: always(), T9s: always(), '98s': always(), '87s': always(), '76s': always(), '65s': always(),
    A8s: always(), A7s: mixed(0.8), A5s: always(), A4s: mixed(0.8), A3s: mixed(0.7), A2s: mixed(0.6),
    '66': mixed(0.7), '55': mixed(0.5),
  }
}

function buildRFI_SB(): Record<HandKey, PreflopSpot> {
  // SB opens ~40% vs BB, sizing 3x typically
  return {
    AA: always(3), KK: always(3), QQ: always(3), JJ: always(3), TT: always(3),
    AKs: always(3), AQs: always(3), AJs: always(3), ATs: always(3),
    AKo: always(3), AQo: always(3), AJo: always(3),
    KQs: always(3), KJs: always(3), QJs: always(3), JTs: always(3),
    '99': always(3), '88': always(3), '77': always(3), '66': mixed(0.8, 3),
    A9s: always(3), A8s: always(3), A7s: mixed(0.8, 3), A5s: always(3), A4s: mixed(0.7, 3),
    KTs: mixed(0.9, 3), K9s: mixed(0.7, 3),
    QTs: mixed(0.8, 3), Q9s: mixed(0.6, 3),
    T9s: mixed(0.7, 3), '98s': mixed(0.6, 3),
    ATo: mixed(0.8, 3), A9o: mixed(0.5, 3),
    KQo: always(3), KJo: mixed(0.7, 3), KTo: mixed(0.5, 3),
  }
}

function buildRFI_UTG(): Record<HandKey, PreflopSpot> {
  return {
    AA: always(), KK: always(), QQ: always(), JJ: always(), TT: always(), '99': always(),
    AKs: always(), AQs: always(), AJs: always(), ATs: always(),
    AKo: always(), AQo: always(),
    KQs: always(), KJs: always(), KTs: mixed(0.8),
    QJs: always(), QTs: mixed(0.8),
    JTs: always(),
    '88': mixed(0.9), '77': mixed(0.7),
    A9s: mixed(0.8), A8s: mixed(0.5), A5s: mixed(0.7),
    AJo: mixed(0.9), ATo: mixed(0.5),
    KQo: mixed(0.9),
    T9s: mixed(0.6), '98s': mixed(0.5),
  }
}

function buildVs3Bet_BTN(): Record<HandKey, PreflopSpot> {
  // Facing a 3-bet from BB when we opened BTN
  const shove = (f = 1): PreflopSpot => ({ primary: { action: 'raise', frequency: f, sizingBB: 999 } })
  const c = (f = 1): PreflopSpot => call(f)
  return {
    // 4-bet shove
    AA: shove(), KK: shove(), QQ: shove(0.7), AKs: shove(),
    AKo: shove(0.9),
    // Call
    JJ: c(), TT: c(), '99': c(), AQs: c(), AJs: c(), KQs: c(), QJs: c(), JTs: c(),
    AQo: c(0.7),
    // Mixed 4-bet bluff / call
    A5s: { primary: { action: 'raise', frequency: 0.5, sizingBB: 999 }, secondary: { action: 'fold', frequency: 0.5 } },
    A4s: { primary: { action: 'raise', frequency: 0.4, sizingBB: 999 }, secondary: { action: 'fold', frequency: 0.6 } },
    // Fold rest (simplified)
  }
}
