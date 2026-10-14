// Checks PlantUML class, sequence and state diagrams for common modelling
// mistakes. PlantUML draws these diagrams anyway, so they are warnings in
// the editor margin, not errors. Each check only fires when it's sure.

export interface LintWarning {
  message: string;
  line: number;
}

const IDENT = String.raw`("[^"]+"|[\w.]+)`;
const unquote = (s: string) => s.replace(/^"(.*)"$/, "$1");

/** Edit distance, counting two swapped letters as one edit, for spotting typos of a declared name. */
export function distance(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  const d: number[][] = [...Array(x.length + 1)].map((_, i) => [...Array(y.length + 1)].map((_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= x.length; i++)
    for (let j = 1; j <= y.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && x[i - 1] === y[j - 2] && x[i - 2] === y[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[x.length][y.length];
}

/** A declared name close enough to be what was meant. */
function closest(name: string, declared: Iterable<string>): string | undefined {
  if (name.length < 4) return undefined;
  let best: string | undefined;
  let bestD = 3;
  for (const d of declared) {
    if (d === name) return undefined;
    const dist = distance(name, d);
    if (dist < bestD && dist <= Math.max(1, Math.floor(d.length / 4))) {
      best = d;
      bestD = dist;
    }
  }
  return best;
}

/** The diagram's lines between @startuml and @enduml, with comments blanked. */
function body(code: string): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = [];
  let inside = false;
  let inComment = false;
  code.split(/\r?\n/).forEach((raw, k) => {
    let text = raw;
    if (inComment) {
      const end = text.indexOf("'/");
      if (end < 0) return;
      text = text.slice(end + 2);
      inComment = false;
    }
    const start = text.indexOf("/'");
    if (start >= 0) {
      const end = text.indexOf("'/", start + 2);
      if (end < 0) {
        inComment = true;
        text = text.slice(0, start);
      } else text = text.slice(0, start) + text.slice(end + 2);
    }
    text = text.trim();
    if (/^@start/.test(text)) {
      inside = true;
      return;
    }
    if (/^@end/.test(text)) {
      inside = false;
      return;
    }
    if (!inside || !text || text.startsWith("'")) return;
    out.push({ text, line: k + 1 });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Class diagrams
// ---------------------------------------------------------------------------

const DECLARE = new RegExp(String.raw`^(?:abstract\s+class|abstract|class|interface|enum|annotation|entity|struct|exception|record)\s+${IDENT}`);
const MULTIPLICITY = /^(\*|\d+|\d+\.\.(\d+|\*))$/;

function lintClasses(lines: { text: string; line: number }[]): LintWarning[] {
  const warnings: LintWarning[] = [];
  const declared = new Map<string, number>();
  const parents = new Map<string, { parent: string; line: number }[]>();
  let interfaceBlock: string | undefined;
  let depth = 0;
  const addParent = (child: string, parent: string, line: number) => {
    if (!parents.has(child)) parents.set(child, []);
    parents.get(child)!.push({ parent, line });
  };
  const used: { name: string; line: number }[] = [];

  for (const { text, line } of lines) {
    const decl = text.match(DECLARE);
    if (decl) {
      const name = unquote(decl[1]);
      const isInterface = /^interface\b/.test(text);
      if (declared.has(name)) warnings.push({ message: `${name} is declared twice (first on line ${declared.get(name)}).`, line });
      else declared.set(name, line);
      const ext = text.match(new RegExp(String.raw`\bextends\s+${IDENT}`));
      if (ext) for (const p of ext[1].split(/\s*,\s*/)) addParent(name, unquote(p), line);
      const impl = text.match(new RegExp(String.raw`\bimplements\s+(.+?)(?:\{|$)`));
      if (impl) for (const p of impl[1].split(/\s*,\s*/)) if (p.trim()) addParent(name, unquote(p.trim()), line);
      if (text.endsWith("{")) {
        interfaceBlock = isInterface ? name : undefined;
        depth = 1;
      }
      continue;
    }
    if (depth > 0) {
      if (text.startsWith("}")) {
        depth = 0;
        interfaceBlock = undefined;
        continue;
      }
      // An attribute in an interface: no brackets, not a constant.
      if (interfaceBlock && !text.includes("(") && !/\{static\}|\{classifier\}/.test(text) && !/^[-+#~]?\s*[A-Z][A-Z0-9_]+\b/.test(text) && /\w/.test(text) && !/^(--|==|\.\.)/.test(text)) {
        warnings.push({ message: `${interfaceBlock} is an interface, so it shouldn't hold attributes like this one. Use a method, or a constant written in capitals.`, line });
      }
      continue;
    }
    // Relations: A "1" --> "0..*" B : label
    const rel = text.match(new RegExp(String.raw`^${IDENT}\s*(?:"([^"]*)"\s*)?([<>*o|+#.\-\\/^]*[-.]+[<>*o|+#.\-\\/^]*)\s*(?:"([^"]*)"\s*)?${IDENT}`));
    if (!rel) continue;
    const [, a, multA, arrow, multB, b] = rel;
    if (!/[-.]/.test(arrow)) continue;
    const left = unquote(a);
    const right = unquote(b);
    used.push({ name: left, line }, { name: right, line });
    for (const m of [multA, multB]) {
      if (m === undefined || !/^[\d*. ]+$/.test(m)) continue;
      const mm = m.replace(/\s/g, "");
      const bounds = mm.match(/^(\d+)\.\.(\d+)$/);
      if (!MULTIPLICITY.test(mm)) warnings.push({ message: `"${m}" isn't a multiplicity. Use forms like 1, 0..1, 1..* or *.`, line });
      else if (bounds && Number(bounds[1]) > Number(bounds[2])) warnings.push({ message: `In "${m}" the lower bound is bigger than the upper one.`, line });
    }
    // Generalisation and realisation: the arrowhead points at the parent.
    if (/^<\|/.test(arrow)) addParent(right, left, line);
    else if (/\|>$/.test(arrow)) addParent(left, right, line);
  }

  // Inheritance that goes round in a circle.
  const reported = new Set<string>();
  for (const start of parents.keys()) {
    const path: string[] = [];
    const walk = (node: string): { line: number; loop: string[] } | null => {
      const at = path.indexOf(node);
      if (at >= 0) return { line: 0, loop: path.slice(at) };
      path.push(node);
      for (const p of parents.get(node) ?? []) {
        const found = walk(p.parent);
        if (found) return found.line ? found : { line: p.line, loop: found.loop };
      }
      path.pop();
      return null;
    };
    const cycle = walk(start);
    if (cycle) {
      const key = [...cycle.loop].sort().join(",");
      if (reported.has(key)) continue;
      reported.add(key);
      warnings.push({ message: `Inheritance goes round in a circle: ${[...cycle.loop, cycle.loop[0]].join(" → ")}. A class can't be its own ancestor.`, line: cycle.line });
    }
  }

  // Names in relations that look like typos of declared classes.
  if (declared.size) {
    const seen = new Set<string>();
    for (const u of used) {
      if (declared.has(u.name) || seen.has(u.name)) continue;
      const guess = closest(u.name, declared.keys());
      if (guess) {
        seen.add(u.name);
        warnings.push({ message: `${u.name} isn't declared, so PlantUML adds a new class for it. Did you mean ${guess}?`, line: u.line });
      }
    }
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Sequence diagrams
// ---------------------------------------------------------------------------

const PARTICIPANT = new RegExp(String.raw`^(?:participant|actor|boundary|control|entity|database|collections|queue)\s+${IDENT}(?:\s+as\s+([\w.]+))?`);

function lintSequence(lines: { text: string; line: number }[]): LintWarning[] {
  const warnings: LintWarning[] = [];
  const declared = new Set<string>();
  const active = new Map<string, number[]>();
  const typos = new Set<string>();
  for (const { text, line } of lines) {
    const p = text.match(PARTICIPANT);
    if (p) {
      declared.add(p[2] ?? unquote(p[1]));
      continue;
    }
    const msg = text.match(new RegExp(String.raw`^${IDENT}\s*([-<>ox\\/]*-{1,2}[-<>ox\\/]*(?:\[[^\]]*\])?)\s*${IDENT}\s*(\+\+|--|\*\*|!!)?\s*(?::|$)`));
    if (msg && /-/.test(msg[2])) {
      for (const raw of [msg[1], msg[3]]) {
        const name = unquote(raw);
        if (declared.size && !declared.has(name) && !typos.has(name)) {
          const guess = closest(name, declared);
          if (guess) {
            typos.add(name);
            warnings.push({ message: `${name} isn't declared, so PlantUML adds a new participant. Did you mean ${guess}?`, line });
          }
        }
      }
      // ++ activates the receiver; -- deactivates the sender.
      if (msg[4] === "++") active.set(unquote(msg[3]), [...(active.get(unquote(msg[3])) ?? []), line]);
      if (msg[4] === "--") active.get(unquote(msg[1]))?.pop();
      continue;
    }
    const act = text.match(new RegExp(String.raw`^(activate|deactivate|destroy)\s+${IDENT}`));
    if (act) {
      const name = unquote(act[2]);
      if (act[1] === "activate") active.set(name, [...(active.get(name) ?? []), line]);
      else if (act[1] === "deactivate") {
        const stack = active.get(name);
        if (!stack?.length) warnings.push({ message: `${name} is deactivated here but wasn't active.`, line });
        else stack.pop();
      } else active.delete(name);
    }
  }
  for (const [name, stack] of active)
    for (const line of stack) warnings.push({ message: `${name} is activated here and never deactivated. Add "deactivate ${name}" where its work ends.`, line });
  return warnings;
}

// ---------------------------------------------------------------------------
// State diagrams
// ---------------------------------------------------------------------------

function lintStates(lines: { text: string; line: number }[]): LintWarning[] {
  // Only flat diagrams: nested states and concurrent regions need more care.
  if (lines.some((l) => /\{\s*$/.test(l.text) || /^--$|^\|\|$/.test(l.text))) return [];
  const edges: { a: string; b: string; line: number }[] = [];
  const firstSeen = new Map<string, number>();
  const note = (name: string, line: number) => !firstSeen.has(name) && firstSeen.set(name, line);
  for (const { text, line } of lines) {
    const t = text.match(/^(\[\*\]|[\w.]+)\s*-+[a-z]*-*>\s*(\[\*\]|[\w.]+)/);
    if (t) {
      edges.push({ a: t[1], b: t[2], line });
      if (t[1] !== "[*]") note(t[1], line);
      if (t[2] !== "[*]") note(t[2], line);
      continue;
    }
    const s = text.match(/^state\s+("?[^"]+"?\s+as\s+)?([\w.]+)/);
    if (s) note(s[2], line);
  }
  if (!edges.some((e) => e.a === "[*]")) return [];
  const reach = new Set(["[*]"]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const e of edges) if (reach.has(e.a) && !reach.has(e.b)) {
      reach.add(e.b);
      grew = true;
    }
  }
  const warnings: LintWarning[] = [];
  for (const [name, line] of firstSeen) if (!reach.has(name)) warnings.push({ message: `${name} can't be reached from the start state.`, line });
  return warnings;
}

/** All the checks that apply to this diagram. */
export function lintPlantUml(code: string): LintWarning[] {
  const head = code.match(/^\s*@start(\w+)/m)?.[1];
  if (head && head !== "uml") return [];
  const lines = body(code);
  const text = lines.map((l) => l.text).join("\n");
  const isSequence = /^(participant|actor|boundary|control|entity|database|collections|queue)\s/m.test(text) || /^\S+\s*-+>>?\s*\S+\s*:/m.test(text) && !/^(class|interface|state)\s/m.test(text);
  const isState = /^\[\*\]\s*-+>|^state\s/m.test(text);
  const isClass = /^(abstract\s+class|abstract|class|interface|enum)\s/m.test(text) || /<\|--|--\|>|\.\.\|>/.test(text);
  if (isState) return lintStates(lines);
  if (isClass) return lintClasses(lines);
  if (isSequence) return lintSequence(lines);
  return [];
}
