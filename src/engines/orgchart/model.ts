// The org chart format. Indentation shows who reports to whom.
//
//   orgchart
//   title "Acme Ltd"
//   Jane Smith: Chief Executive [Executive]
//     + Lee Park: Executive Assistant
//     Ravi Patel: CTO [Engineering]
//       Ana Lopez #ana: Engineering Manager [Engineering]
//         Tom Reed: Developer
//         ?: Developer
//     Mia Chen: CFO [Finance]
//   ana .. Mia Chen "budget"
//
// "+" marks an assistant, "?" a vacant post, "#id" a short name for
// dotted-line reporting ("a .. b"). Settings go before the first person:
// title, direction down|right, compact, counts.

export interface Person {
  /** Unique key: the #id if given, otherwise the name. */
  key: string;
  name: string;
  title: string;
  department?: string;
  vacant: boolean;
  assistant: boolean;
  /** 1-based source line. */
  line: number;
  children: Person[];
  /** Assistants shown beside this person. */
  assistants: Person[];
  parent?: Person;
}

export interface DottedLine {
  from: Person;
  to: Person;
  label: string;
  line: number;
}

export interface OrgChart {
  title?: string;
  direction: "down" | "right";
  /** Stack the bottom level of each branch in a column. */
  compact: boolean;
  /** Show how many people report to each manager, directly or not. */
  counts: boolean;
  roots: Person[];
  dotted: DottedLine[];
  /** Departments in order of first appearance. */
  departments: string[];
}

export class OrgError extends Error {
  constructor(
    message: string,
    readonly line?: number,
  ) {
    super(message);
  }
}

export const PERSON = /^(\+\s*)?(\?|[^:#[\]]+?)\s*(?:#([A-Za-z_][\w-]*))?\s*(?::\s*([^[\]]*?))?\s*(?:\[([^\]]*)\])?\s*$/;
export const DOTTED = /^(.+?)\s+\.\.\s+(.+?)(?:\s+"([^"]*)")?\s*$/;

/** Indent width of a line, with a tab counting as two spaces. */
function indentOf(raw: string): number {
  let n = 0;
  for (const c of raw) {
    if (c === " ") n++;
    else if (c === "\t") n += 2;
    else break;
  }
  return n;
}

export function parseOrgChart(code: string): OrgChart {
  const chart: OrgChart = { direction: "down", compact: false, counts: false, roots: [], dotted: [], departments: [] };
  const lines = code.split(/\r\n|\r|\n/);
  let header = false;
  let started = false;
  /** Open managers by indent: [indent, person]. */
  const stack: [number, Person][] = [];
  const byKey = new Map<string, Person>();
  const byName = new Map<string, Person[]>();
  const pendingDotted: { a: string; b: string; label: string; line: number }[] = [];

  lines.forEach((raw, index) => {
    const line = index + 1;
    const text = raw.replace(/\s+#\s.*$|^\s*#(?![A-Za-z_]).*$/, "").trim();
    if (!text) return;
    if (!header) {
      if (text !== "orgchart") throw new OrgError('An org chart starts with the word "orgchart" on its own line.', line);
      header = true;
      return;
    }
    // Settings: title "…", direction down|right, compact, counts. Anything
    // else starting with those words (a person called "Title Smith") is a person.
    const setting = text.match(/^(title)\s+(".*")$|^(direction)\s+(\S+)$|^(compact|counts)()$/);
    if (setting && indentOf(raw) === 0) {
      const key = setting[1] ?? setting[3] ?? setting[5];
      const value = setting[2] ?? setting[4] ?? "";
      if (started) throw new OrgError(`Put "${key}" before the first person.`, line);
      if (key === "title") chart.title = value.slice(1, -1);
      else if (key === "direction") {
        if (value !== "down" && value !== "right") throw new OrgError('direction is "down" or "right".', line);
        chart.direction = value;
      } else chart[key as "compact" | "counts"] = true;
      return;
    }
    const dotted = text.match(DOTTED);
    if (dotted && indentOf(raw) === 0) {
      pendingDotted.push({ a: dotted[1].trim(), b: dotted[2].trim(), label: dotted[3] ?? "", line });
      return;
    }
    const m = text.match(PERSON);
    if (!m) throw new OrgError('Write a person as "Name: Job title [Department]". Only the name is needed.', line);
    started = true;
    const [, plus, rawName, id, title = "", dept] = m;
    const vacant = rawName === "?";
    const name = vacant ? "Vacant" : rawName.trim();
    const key = id ?? (vacant ? `vacant-${line}` : name);
    if (byKey.has(key)) {
      throw new OrgError(
        id ? `The id #${id} is used twice.` : `There are two people called "${name}". Give one of them an id, like "${name} #${name.split(/\s+/)[0].toLowerCase()}2".`,
        line,
      );
    }
    const person: Person = {
      key,
      name,
      title: title.trim(),
      department: dept?.trim() || undefined,
      vacant,
      assistant: !!plus,
      line,
      children: [],
      assistants: [],
    };
    const indent = indentOf(raw);
    while (stack.length && stack[stack.length - 1][0] >= indent) stack.pop();
    const parent = stack[stack.length - 1]?.[1];
    if (!parent) {
      if (indent > 0 && chart.roots.length) throw new OrgError("This line is indented, but there's nobody above it to report to.", line);
      if (person.assistant) throw new OrgError("An assistant (+) needs a manager on the line above, with less indentation.", line);
      chart.roots.push(person);
    } else {
      person.parent = parent;
      (person.assistant ? parent.assistants : parent.children).push(person);
    }
    if (!person.assistant) stack.push([indent, person]);
    byKey.set(key, person);
    if (!vacant) byName.set(name, [...(byName.get(name) ?? []), person]);
    if (person.department) {
      // Inherit nothing, but remember the order departments appear in.
      if (!chart.departments.includes(person.department)) chart.departments.push(person.department);
    }
  });

  if (!header) throw new OrgError('An org chart starts with the word "orgchart" on its own line.', 1);
  if (!chart.roots.length) throw new OrgError("Add a person under the orgchart line, for example: Jane Smith: Chief Executive", lines.length);

  const find = (ref: string, line: number): Person => {
    const r = ref.replace(/^#/, "");
    const hit = byKey.get(r);
    if (hit) return hit;
    const named = byName.get(ref);
    if (named?.length === 1) return named[0];
    if (named && named.length > 1) throw new OrgError(`More than one person is called "${ref}". Use their #id instead.`, line);
    throw new OrgError(`There's nobody called "${ref}" in the chart.`, line);
  };
  for (const d of pendingDotted) {
    chart.dotted.push({ from: find(d.a, d.line), to: find(d.b, d.line), label: d.label, line: d.line });
  }
  return chart;
}

/** Everyone below a person, directly or not, not counting assistants. */
export function headcount(p: Person): number {
  return p.children.reduce((n, c) => n + 1 + headcount(c), 0);
}

/** Everyone in the chart, managers first. */
export function everyone(chart: OrgChart): Person[] {
  const out: Person[] = [];
  const walk = (p: Person) => {
    out.push(p, ...p.assistants);
    p.children.forEach(walk);
  };
  chart.roots.forEach(walk);
  return out;
}

/** "Jane Smith" -> "JS"; "Cher" -> "CH". */
export function initials(name: string): string {
  const words = name.match(/[\p{L}\p{N}]+/gu) ?? [];
  const [first = "?", second] = words;
  return (second ? first[0] + words[words.length - 1][0] : first.slice(0, 2)).toUpperCase();
}
