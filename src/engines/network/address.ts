// IPv4 and IPv6 addresses and subnets, held as bigints so both families
// share the same arithmetic.

export interface Address {
  family: 4 | 6;
  value: bigint;
  /** Prefix length when written with one, as in 10.0.1.0/24. */
  prefix?: number;
  /** As written. */
  text: string;
}

const BITS = { 4: 32, 6: 128 } as const;

/** True for words that look like an address, valid or not. */
export function looksLikeAddress(word: string): boolean {
  return /^\d+(\.\d+)+(\/\d+)?$/.test(word) || (/^[0-9a-fA-F:.]+(\/\d+)?$/.test(word) && (word.match(/:/g)?.length ?? 0) >= 2);
}

/** Parses an address, returning an error message when it is malformed. */
export function parseAddress(text: string): Address | string {
  const [addr, prefixText, extra] = text.split("/");
  if (extra !== undefined) return `${text} has more than one "/".`;
  const family = addr.includes(":") ? 6 : 4;
  const value = family === 4 ? parseV4(addr) : parseV6(addr);
  if (typeof value === "string") return `${text} isn't a valid address: ${value}`;
  let prefix: number | undefined;
  if (prefixText !== undefined) {
    prefix = Number(prefixText);
    if (!/^\d+$/.test(prefixText) || prefix > BITS[family]) return `${text} has a prefix of /${prefixText}, but IPv${family} prefixes go from /0 to /${BITS[family]}.`;
  }
  return { family, value, prefix, text };
}

function parseV4(text: string): bigint | string {
  const parts = text.split(".");
  if (parts.length !== 4) return "an IPv4 address has four numbers separated by dots.";
  let value = 0n;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return `"${part}" isn't a number.`;
    const n = Number(part);
    if (n > 255) return `${n} is more than 255.`;
    value = (value << 8n) | BigInt(n);
  }
  return value;
}

function parseV6(text: string): bigint | string {
  const halves = text.split("::");
  if (halves.length > 2) return '"::" can appear only once.';
  const groups = (s: string): (string | bigint)[] => {
    if (!s) return [];
    const out: (string | bigint)[] = [];
    const words = s.split(":");
    words.forEach((w, i) => {
      if (i === words.length - 1 && w.includes(".")) {
        const v4 = parseV4(w);
        if (typeof v4 === "string") out.push(v4);
        else out.push(v4 >> 16n, v4 & 0xffffn);
      } else if (/^[0-9a-fA-F]{1,4}$/.test(w)) out.push(BigInt(`0x${w}`));
      else out.push(w ? `"${w}" isn't a group of one to four hex digits.` : "there's an empty group.");
    });
    return out;
  };
  const head = groups(halves[0]);
  const tail = halves.length === 2 ? groups(halves[1]) : [];
  const bad = [...head, ...tail].find((g) => typeof g === "string");
  if (bad) return bad as string;
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return "an IPv6 address has eight groups.";
  const all = [...head, ...Array<bigint>(halves.length === 2 ? missing : 0).fill(0n), ...tail] as bigint[];
  return all.reduce((v, g) => (v << 16n) | g, 0n);
}

/** Network value of an address within a prefix. */
export function networkOf(value: bigint, family: 4 | 6, prefix: number): bigint {
  const bits = BigInt(BITS[family]);
  const host = (1n << (bits - BigInt(prefix))) - 1n;
  return value & ~host & ((1n << bits) - 1n);
}

/** Last address of a subnet (the broadcast address for IPv4). */
export function lastOf(subnet: Address): bigint {
  const bits = BigInt(BITS[subnet.family]);
  return networkOf(subnet.value, subnet.family, subnet.prefix!) | ((1n << (bits - BigInt(subnet.prefix!))) - 1n);
}

export function contains(subnet: Address, addr: Address): boolean {
  if (subnet.family !== addr.family || subnet.prefix === undefined) return false;
  return networkOf(addr.value, addr.family, subnet.prefix) === networkOf(subnet.value, subnet.family, subnet.prefix);
}

/** Two subnets overlap when one contains the other's network address. */
export function overlaps(a: Address, b: Address): boolean {
  if (a.family !== b.family || a.prefix === undefined || b.prefix === undefined) return false;
  const p = Math.min(a.prefix, b.prefix);
  return networkOf(a.value, a.family, p) === networkOf(b.value, b.family, p);
}

export function formatAddress(value: bigint, family: 4 | 6): string {
  if (family === 4) return [24n, 16n, 8n, 0n].map((s) => String((value >> s) & 0xffn)).join(".");
  const groups = Array.from({ length: 8 }, (_, i) => Number((value >> BigInt(112 - i * 16)) & 0xffffn));
  // Shorten the longest run of two or more zero groups to "::".
  let best = { at: -1, len: 1 };
  for (let i = 0; i < 8; ) {
    if (groups[i] !== 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < 8 && groups[j] === 0) j++;
    if (j - i > best.len) best = { at: i, len: j - i };
    i = j;
  }
  const hex = groups.map((g) => g.toString(16));
  if (best.at < 0) return hex.join(":");
  return `${hex.slice(0, best.at).join(":")}::${hex.slice(best.at + best.len).join(":")}`;
}

/** The subnet an address with a prefix belongs to, written out. */
export function subnetText(a: Address): string {
  return `${formatAddress(networkOf(a.value, a.family, a.prefix!), a.family)}/${a.prefix}`;
}
