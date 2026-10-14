// Minimal sum of products by the Quine–McCluskey method: find every prime
// implicant, keep the essential ones, then pick the cheapest cover for
// what's left (Petrick's method, or a greedy cover when that would be too
// big to expand).

import type { Node } from "./expr";

/** A product term: bits where mask is 0 are fixed to the bits in value. */
export interface Implicant {
  value: number;
  mask: number;
}

const bitCount = (x: number) => {
  let c = 0;
  for (; x; x &= x - 1) c++;
  return c;
};

/** Every minterm an implicant covers. */
export function covers(imp: Implicant, n: number): number[] {
  const out: number[] = [];
  for (let m = 0; m < 1 << n; m++) if ((m & ~imp.mask) === imp.value) out.push(m);
  return out;
}

export function primeImplicants(terms: number[]): Implicant[] {
  let current = new Map<string, Implicant>(terms.map((m) => [`${m}/0`, { value: m, mask: 0 }]));
  const primes: Implicant[] = [];
  while (current.size) {
    const next = new Map<string, Implicant>();
    const used = new Set<string>();
    const list = [...current.entries()];
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const [ka, a] = list[i];
        const [kb, b] = list[j];
        if (a.mask !== b.mask) continue;
        const diff = a.value ^ b.value;
        if (bitCount(diff) !== 1) continue;
        const merged = { value: a.value & ~diff, mask: a.mask | diff };
        next.set(`${merged.value}/${merged.mask}`, merged);
        used.add(ka);
        used.add(kb);
      }
    for (const [k, imp] of current) if (!used.has(k)) primes.push(imp);
    current = next;
  }
  // Largest groups first, then in minterm order, for stable output.
  return primes.sort((a, b) => bitCount(b.mask) - bitCount(a.mask) || a.value - b.value);
}

/** Literals in a term: the fewer, the cheaper. */
const literals = (imp: Implicant, n: number) => n - bitCount(imp.mask);

/** The smallest set of implicants that covers every 1 (don't cares are optional). */
export function minimalCover(n: number, ones: number[], dontCares: number[] = []): Implicant[] {
  if (!ones.length) return [];
  const primes = primeImplicants([...new Set([...ones, ...dontCares])].sort((a, b) => a - b));
  const coverOf = primes.map((p) => new Set(covers(p, n).filter((m) => ones.includes(m))));
  const chosen = new Set<number>();
  let left = new Set(ones);
  // Essential prime implicants: the only one covering some minterm.
  for (const m of ones) {
    const who = primes.map((_, i) => i).filter((i) => coverOf[i].has(m));
    if (who.length === 1) chosen.add(who[0]);
  }
  for (const i of chosen) for (const m of coverOf[i]) left.delete(m);
  if (!left.size) return [...chosen].map((i) => primes[i]).sort(order);

  const candidates = primes.map((_, i) => i).filter((i) => !chosen.has(i) && [...coverOf[i]].some((m) => left.has(m)));
  const cost = (set: number[]) => set.length * 1000 + set.reduce((s, i) => s + literals(primes[i], n), 0);

  if (candidates.length <= 18) {
    // Petrick: every way of covering what's left, keeping only minimal sets.
    let products: number[][] = [[]];
    for (const m of left) {
      const options = candidates.filter((i) => coverOf[i].has(m));
      const next: number[][] = [];
      for (const p of products)
        for (const o of options) {
          const merged = p.includes(o) ? p : [...p, o].sort((a, b) => a - b);
          next.push(merged);
        }
      // Drop sets that contain another set (absorption), and duplicates.
      const keys = new Map(next.map((s) => [s.join(","), s]));
      const unique = [...keys.values()].sort((a, b) => a.length - b.length);
      products = unique.filter((s, k) => !unique.slice(0, k).some((t) => t.length < s.length && t.every((x) => s.includes(x))));
      if (products.length > 4000) products = products.sort((a, b) => cost(a) - cost(b)).slice(0, 4000);
    }
    const best = products.sort((a, b) => cost(a) - cost(b))[0];
    for (const i of best) chosen.add(i);
  } else {
    // Greedy: the implicant covering most of what's left, fewest literals first.
    while (left.size) {
      const best = candidates
        .filter((i) => !chosen.has(i))
        .sort((a, b) => [...coverOf[b]].filter((m) => left.has(m)).length - [...coverOf[a]].filter((m) => left.has(m)).length || literals(primes[a], n) - literals(primes[b], n))[0];
      chosen.add(best);
      left = new Set([...left].filter((m) => !coverOf[best].has(m)));
    }
  }
  return [...chosen].map((i) => primes[i]).sort(order);
}

const order = (a: Implicant, b: Implicant) => bitCount(b.mask) - bitCount(a.mask) || a.value - b.value;

/** Variable i (0 = first) is the most significant bit of a minterm number. */
const bit = (n: number, i: number) => 1 << (n - 1 - i);

/** A product term as an expression: AND of the fixed variables. */
export function productTerm(imp: Implicant, vars: string[]): Node {
  const n = vars.length;
  const lits: Node[] = [];
  vars.forEach((name, i) => {
    if (imp.mask & bit(n, i)) return;
    lits.push(imp.value & bit(n, i) ? { k: "var", name } : { k: "not", a: { k: "var", name } });
  });
  if (!lits.length) return { k: "const", v: true };
  return lits.length === 1 ? lits[0] : { k: "and", args: lits };
}

/** A sum term for product of sums: from an implicant of the zeros. */
export function sumTerm(imp: Implicant, vars: string[]): Node {
  const n = vars.length;
  const lits: Node[] = [];
  vars.forEach((name, i) => {
    if (imp.mask & bit(n, i)) return;
    lits.push(imp.value & bit(n, i) ? { k: "not", a: { k: "var", name } } : { k: "var", name });
  });
  if (!lits.length) return { k: "const", v: false };
  return lits.length === 1 ? lits[0] : { k: "or", args: lits };
}

export function sumOfProducts(cover: Implicant[], vars: string[]): Node {
  if (!cover.length) return { k: "const", v: false };
  const terms = cover.map((c) => productTerm(c, vars));
  return terms.length === 1 ? terms[0] : { k: "or", args: terms };
}

export function productOfSums(cover: Implicant[], vars: string[]): Node {
  if (!cover.length) return { k: "const", v: true };
  const terms = cover.map((c) => sumTerm(c, vars));
  return terms.length === 1 ? terms[0] : { k: "and", args: terms };
}
