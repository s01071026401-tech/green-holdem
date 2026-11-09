/**
 * Estimated Texas Hold'em showdown equity versus random unknown hands.
 * Pure TypeScript; no network calls and no real-money advice.
 * Unknown opponents are sampled uniformly, not from a behavioral range.
 */
const RANKS = '23456789TJQKA';
const SUITS = 'shdc';
const DECK = [...SUITS].flatMap(s => [...RANKS].map(r => r + s));
const rank = (c: string) => RANKS.indexOf(c[0]) + 2;

function scoreFive(cards: string[]): number[] {
  const ranks = cards.map(rank).sort((a, b) => b - a);
  const flush = cards.every(c => c[1] === cards[0][1]);
  const unique = [...new Set(ranks)];
  if (unique.includes(14)) unique.push(1);
  let straight = 0;
  for (let i = 0; i <= unique.length - 5; i++) {
    if (unique[i] - unique[i + 4] === 4) { straight = unique[i]; break; }
  }
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  if (flush && straight) return [8, straight];
  if (groups[0][1] === 4) return [7, groups[0][0], groups[1][0]];
  if (groups[0][1] === 3 && groups[1][1] === 2) return [6, groups[0][0], groups[1][0]];
  if (flush) return [5, ...ranks];
  if (straight) return [4, straight];
  if (groups[0][1] === 3) return [3, groups[0][0], ...groups.slice(1).map(x => x[0]).sort((a, b) => b - a)];
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    return [2, Math.max(groups[0][0], groups[1][0]), Math.min(groups[0][0], groups[1][0]), groups[2][0]];
  }
  if (groups[0][1] === 2) {
    return [1, groups[0][0], ...groups.slice(1).map(x => x[0]).sort((a, b) => b - a)];
  }
  return [0, ...ranks];
}
function compare(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}
export function bestSeven(cards: string[]): number[] {
  let best: number[] = [];
  const n = cards.length;
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) {
            const score = scoreFive([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best.length || compare(score, best) > 0) best = score;
          }
  return best;
}
export type EquityResult = {win: number; tie: number; lose: number; equity: number; samples: number};

/** Returns estimated percentages with tied pots counted fractionally in equity. */
export function estimateEquity(hole: string[], board: string[], opponents: number, samples = 450): EquityResult | null {
  if (hole.length !== 2 || opponents < 1 || opponents > 5 || board.length > 5) return null;
  const seen = [...hole, ...board];
  if (new Set(seen).size !== seen.length || seen.some(c => !DECK.includes(c))) return null;
  const available = DECK.filter(c => !seen.includes(c));
  const drawCount = (5 - board.length) + opponents * 2;
  if (available.length < drawCount) return null;
  const trials = Math.max(1, Math.floor(samples));
  let wins = 0, ties = 0, losses = 0, equityTotal = 0;
  for (let t = 0; t < trials; t++) {
    // Partial Fisher-Yates shuffle, only for cards used in this simulation.
    const pool = available.slice();
    for (let i = 0; i < drawCount; i++) {
      const j = i + Math.floor(Math.random() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const completed = [...board, ...pool.slice(0, 5 - board.length)];
    const own = bestSeven([...hole, ...completed]);
    let sharedWinners = 1;
    let lost = false;
    const offset = 5 - board.length;
    for (let i = 0; i < opponents; i++) {
      const rival = bestSeven([pool[offset + 2 * i], pool[offset + 2 * i + 1], ...completed]);
      const cmp = compare(own, rival);
      if (cmp < 0) { lost = true; break; }
      if (cmp === 0) sharedWinners++;
    }
    if (lost) losses++;
    else if (sharedWinners > 1) { ties++; equityTotal += 1 / sharedWinners; }
    else { wins++; equityTotal++; }
  }
  const pct = (n: number) => Math.round(n / trials * 1000) / 10;
  return {win: pct(wins), tie: pct(ties), lose: pct(losses), equity: pct(equityTotal), samples: trials};
}
