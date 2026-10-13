// Reads the tables, keys and foreign keys out of SQL DDL. It is lenient on
// purpose: statements it doesn't need (INSERT, CREATE FUNCTION, SET ...)
// are skipped, so a whole pg_dump or mysqldump file can be pasted.
//
// Comments starting "-- title:", "-- group:" and "-- focus:" control the
// drawing and stay valid SQL.

export interface Column {
  name: string;
  type: string;
  line: number;
  notNull: boolean;
  pk: boolean;
  fk: boolean;
  unique: boolean;
  comment?: string;
}

export interface Table {
  name: string;
  schema?: string;
  line: number;
  columns: Column[];
  /** Lower-case names of the primary key columns. */
  pk: string[];
  /** Lower-case column sets with a unique constraint or index. */
  uniques: string[][];
  group?: string;
  comment?: string;
}

export interface Relation {
  /** The table holding the foreign key. */
  from: Table;
  fromCols: Column[];
  /** The table it points at. */
  to: Table;
  toCols: Column[];
  line: number;
  /** A row may have no parent: some foreign key column allows NULL. */
  optional: boolean;
  /** At most one row per parent: the foreign key is also unique. */
  single: boolean;
}

export interface SqlWarning {
  message: string;
  line: number;
}

export interface SqlSchema {
  title?: string;
  tables: Table[];
  relations: Relation[];
  /** Tables named in "-- focus:"; empty shows everything. */
  focus: Table[];
  warnings: SqlWarning[];
}

export class SqlError extends Error {
  constructor(
    message: string,
    readonly line?: number,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

interface Tok {
  /** id: bare word, qid: quoted identifier, str: string, num, p: punctuation, dir: a "-- name:" comment. */
  t: "id" | "qid" | "str" | "num" | "p" | "dir";
  v: string;
  line: number;
}

const DIRECTIVE = /^--\s*(title|group|focus)\s*:(.*)$/i;

export function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  let line = 1;
  const n = src.length;
  const lineText = (at: number) => {
    const start = src.lastIndexOf("\n", at - 1) + 1;
    const end = src.indexOf("\n", at);
    return src.slice(start, end < 0 ? n : end);
  };
  while (i < n) {
    const c = src[i];
    if (c === "\n") {
      line++;
      i++;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r" || c === "\f") {
      i++;
      continue;
    }
    // SQL Server batches end with GO on a line of its own.
    if ((c === "G" || c === "g") && /^\s*go\s*$/i.test(lineText(i))) {
      out.push({ t: "p", v: ";", line });
      i += 2;
      continue;
    }
    if (c === "-" && src[i + 1] === "-") {
      const end = src.indexOf("\n", i);
      const text = src.slice(i, end < 0 ? n : end).trimEnd();
      const d = text.match(DIRECTIVE);
      if (d) out.push({ t: "dir", v: `${d[1].toLowerCase()}:${d[2].trim()}`, line });
      i = end < 0 ? n : end;
      continue;
    }
    if (c === "#" && !lineText(i).slice(0, i - (src.lastIndexOf("\n", i - 1) + 1)).trim()) {
      const end = src.indexOf("\n", i);
      i = end < 0 ? n : end;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end < 0 ? n : end + 2;
      for (let k = i; k < stop; k++) if (src[k] === "\n") line++;
      i = stop;
      continue;
    }
    if (c === "'") {
      const start = line;
      let v = "";
      i++;
      while (i < n) {
        if (src[i] === "'" && src[i + 1] === "'") {
          v += "'";
          i += 2;
        } else if (src[i] === "'") {
          i++;
          break;
        } else {
          if (src[i] === "\\" && i + 1 < n) v += src[i++];
          if (src[i] === "\n") line++;
          v += src[i++];
        }
      }
      out.push({ t: "str", v, line: start });
      continue;
    }
    if (c === '"' || c === "`" || c === "[") {
      const close = c === "[" ? "]" : c;
      const start = line;
      let v = "";
      i++;
      while (i < n) {
        if (src[i] === close && src[i + 1] === close && close !== "]") {
          v += close;
          i += 2;
        } else if (src[i] === close) {
          i++;
          break;
        } else {
          if (src[i] === "\n") line++;
          v += src[i++];
        }
      }
      out.push({ t: "qid", v, line: start });
      continue;
    }
    if (c === "$") {
      // PostgreSQL dollar quoting: $$ ... $$ or $tag$ ... $tag$.
      const tag = src.slice(i).match(/^\$(\w*)\$/);
      if (tag) {
        const end = src.indexOf(tag[0], i + tag[0].length);
        const stop = end < 0 ? n : end + tag[0].length;
        const start = line;
        for (let k = i; k < stop; k++) if (src[k] === "\n") line++;
        out.push({ t: "str", v: src.slice(i + tag[0].length, end < 0 ? n : end), line: start });
        i = stop;
        continue;
      }
    }
    const word = src.slice(i).match(/^[A-Za-z_À-￿][\w$#@À-￿]*/);
    if (word) {
      out.push({ t: "id", v: word[0], line });
      i += word[0].length;
      continue;
    }
    const num = src.slice(i).match(/^\d+(\.\d+)?/);
    if (num) {
      out.push({ t: "num", v: num[0], line });
      i += num[0].length;
      continue;
    }
    out.push({ t: "p", v: c, line });
    i++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

const upper = (tok: Tok | undefined) => (tok?.t === "id" ? tok.v.toUpperCase() : "");
const isName = (tok: Tok | undefined) => tok?.t === "id" || tok?.t === "qid";
const key = (name: string) => name.toLowerCase();

class Cursor {
  i = 0;
  constructor(readonly toks: Tok[]) {}
  peek(k = 0) {
    return this.toks[this.i + k];
  }
  next() {
    return this.toks[this.i++];
  }
  done() {
    return this.i >= this.toks.length;
  }
  /** Moves past the words if they come next, in order. */
  accept(...words: string[]) {
    if (!words.every((w, k) => upper(this.peek(k)) === w)) return false;
    this.i += words.length;
    return true;
  }
  isP(v: string, k = 0) {
    const tok = this.peek(k);
    return tok?.t === "p" && tok.v === v;
  }
  /** Skips one token, or a whole bracketed group. */
  skip() {
    if (!this.isP("(")) return void this.i++;
    let depth = 0;
    do {
      const tok = this.next();
      if (tok?.t === "p" && tok.v === "(") depth++;
      else if (tok?.t === "p" && tok.v === ")") depth--;
    } while (depth > 0 && !this.done());
  }
  /** A possibly qualified name: schema.table. */
  name(): { name: string; schema?: string } | null {
    if (!isName(this.peek())) return null;
    const parts = [this.next().v];
    while (this.isP(".") && isName(this.peek(1))) {
      this.i++;
      parts.push(this.next().v);
    }
    return { name: parts[parts.length - 1], schema: parts.length > 1 ? parts[parts.length - 2] : undefined };
  }
  /** The tokens inside the brackets that come next, split at top-level commas. */
  group(): Tok[][] | null {
    if (!this.isP("(")) return null;
    const open = this.next();
    const items: Tok[][] = [[]];
    let depth = 1;
    while (!this.done()) {
      const tok = this.next();
      if (tok.t === "p" && tok.v === "(") depth++;
      else if (tok.t === "p" && tok.v === ")" && --depth === 0) return items;
      if (depth === 1 && tok.t === "p" && tok.v === ",") items.push([]);
      else items[items.length - 1].push(tok);
    }
    throw new SqlError("A bracket isn't closed. Check for a missing ).", open.line);
  }
  /** Column names in brackets, e.g. (a, b DESC, c(10)). */
  names(): string[] {
    return (this.group() ?? []).map((item) => item.find(isName)?.v ?? "").filter(Boolean);
  }
}

interface ForeignKey {
  table: Table;
  cols: string[];
  ref: { name: string; schema?: string };
  refCols: string[];
  line: number;
}

/** Words that end a column's type. */
const TYPE_END = new Set([
  "NOT", "NULL", "PRIMARY", "UNIQUE", "REFERENCES", "DEFAULT", "CHECK", "CONSTRAINT", "COLLATE", "AUTO_INCREMENT",
  "AUTOINCREMENT", "IDENTITY", "GENERATED", "COMMENT", "ON", "AS", "ENCODE", "CHARSET", "SERIAL", "VISIBLE", "INVISIBLE",
]);

/** ALTER TABLE actions other than ADD. */
const ALTER_VERBS = new Set(["DROP", "ALTER", "MODIFY", "CHANGE", "RENAME", "SET", "RESET", "ENABLE", "DISABLE", "VALIDATE", "OWNER", "ATTACH", "DETACH", "NOCHECK", "WITH", "CLUSTER", "INHERIT", "NO", "REPLICA", "FORCE", "ALGORITHM", "LOCK"]);

function typeText(toks: Tok[]): string {
  let s = "";
  for (const tok of toks) {
    const text = tok.t === "str" ? `'${tok.v}'` : tok.t === "qid" ? `"${tok.v}"` : tok.v;
    if (s && !/[([.]$/.test(s) && !/^[)\],([.]/.test(text)) s += " ";
    s += text;
  }
  return s;
}

class Reader {
  tables: Table[] = [];
  private byKey = new Map<string, Table>();
  fks: ForeignKey[] = [];
  warnings: SqlWarning[] = [];
  title?: string;
  focus: { names: string[]; line: number }[] = [];
  private group?: string;

  read(toks: Tok[]) {
    let stmt: Tok[] = [];
    let depth = 0;
    const flush = () => {
      if (stmt.length) this.statement(new Cursor(stmt));
      stmt = [];
    };
    for (const tok of toks) {
      if (tok.t === "dir") {
        const [name, ...rest] = tok.v.split(":");
        const value = rest.join(":").trim();
        if (name === "title") this.title = value || undefined;
        else if (name === "group") this.group = value || undefined;
        else this.focus.push({ names: value.split(/[\s,]+/).filter(Boolean), line: tok.line });
        continue;
      }
      if (tok.t === "p" && tok.v === "(") depth++;
      if (tok.t === "p" && tok.v === ")") depth = Math.max(0, depth - 1);
      if (tok.t === "p" && tok.v === ";" && depth === 0) flush();
      else stmt.push(tok);
    }
    flush();
  }

  find(ref: { name: string; schema?: string }, near?: Table): Table | undefined {
    if (ref.schema) return this.byKey.get(`${key(ref.schema)}.${key(ref.name)}`);
    if (near?.schema) {
      const same = this.byKey.get(`${key(near.schema)}.${key(ref.name)}`);
      if (same) return same;
    }
    const exact = this.byKey.get(key(ref.name));
    if (exact) return exact;
    const any = this.tables.filter((t) => key(t.name) === key(ref.name));
    return any.length === 1 ? any[0] : undefined;
  }

  private statement(c: Cursor) {
    const first = c.peek();
    if (upper(first) === "CREATE") {
      c.next();
      c.accept("OR", "REPLACE");
      while (["TEMPORARY", "TEMP", "GLOBAL", "LOCAL", "UNLOGGED", "TRANSIENT"].includes(upper(c.peek()))) c.next();
      if (c.accept("TABLE")) return this.createTable(c, first.line);
      const unique = c.accept("UNIQUE");
      c.accept("CLUSTERED") || c.accept("NONCLUSTERED");
      if (c.accept("INDEX")) return this.createIndex(c, unique);
      return;
    }
    if (c.accept("ALTER", "TABLE")) return this.alterTable(c);
    if (c.accept("COMMENT", "ON")) return this.comment(c);
  }

  private createTable(c: Cursor, line: number) {
    c.accept("IF", "NOT", "EXISTS");
    const name = c.name();
    if (!name) return;
    if (!c.isP("(")) return; // CREATE TABLE ... AS SELECT, LIKE, USING
    const existing = this.find(name);
    if (existing && key(existing.schema ?? "") === key(name.schema ?? "")) {
      this.warnings.push({ message: `${name.name} is already defined on line ${existing.line}. Only the first one is drawn.`, line });
      return;
    }
    const table: Table = { ...name, line, columns: [], pk: [], uniques: [], group: this.group };
    let items: Tok[][];
    try {
      items = c.group()!;
    } catch {
      throw new SqlError(`The column list of ${name.name} isn't closed. Check for a missing ).`, line);
    }
    this.tables.push(table);
    this.byKey.set(name.schema ? `${key(name.schema)}.${key(name.name)}` : key(name.name), table);
    if (!this.byKey.has(key(name.name))) this.byKey.set(key(name.name), table);
    for (const item of items) if (item.length) this.element(table, new Cursor(item));
  }

  /** A column or a table constraint inside CREATE TABLE ( ... ), or after ALTER TABLE ... ADD. */
  private element(table: Table, c: Cursor) {
    const word = upper(c.peek());
    const constraint =
      word === "CONSTRAINT" ||
      (word === "PRIMARY" && upper(c.peek(1)) === "KEY") ||
      (word === "FOREIGN" && upper(c.peek(1)) === "KEY") ||
      (word === "UNIQUE" && (c.isP("(", 1) || ["KEY", "INDEX"].includes(upper(c.peek(1))) || (isName(c.peek(1)) && c.isP("(", 2)))) ||
      (word === "CHECK" && c.isP("(", 1)) ||
      ["EXCLUDE", "FULLTEXT", "SPATIAL", "LIKE", "PERIOD"].includes(word) ||
      // MySQL indexes: KEY name (cols). A column called key has a type instead.
      ((word === "KEY" || word === "INDEX") && (c.isP("(", 1) || (isName(c.peek(1)) && c.isP("(", 2) && isName(c.peek(3)))));
    if (constraint) this.tableConstraint(table, c);
    else this.column(table, c);
  }

  private column(table: Table, c: Cursor) {
    const nameTok = c.next();
    if (!isName(nameTok)) return;
    const col: Column = { name: nameTok.v, type: "", line: nameTok.line, notNull: false, pk: false, fk: false, unique: false };
    const typeToks: Tok[] = [];
    while (!c.done()) {
      const w = upper(c.peek());
      if (TYPE_END.has(w) || (w === "CHARACTER" && upper(c.peek(1)) === "SET")) break;
      if (c.isP("(")) {
        const start = c.i;
        c.skip();
        typeToks.push(...c.toks.slice(start, c.i));
      } else typeToks.push(c.next());
    }
    col.type = typeText(typeToks);
    if (/^(big|small)?serial\d?$/i.test(col.type)) col.notNull = true;
    table.columns.push(col);

    while (!c.done()) {
      const tok = c.peek();
      if (c.accept("NOT", "NULL")) col.notNull = true;
      else if (c.accept("PRIMARY", "KEY")) {
        col.pk = col.notNull = true;
        table.pk = [key(col.name)];
      } else if (c.accept("UNIQUE")) {
        c.accept("KEY");
        col.unique = true;
        table.uniques.push([key(col.name)]);
      } else if (c.accept("REFERENCES")) {
        const ref = c.name();
        if (ref) this.fks.push({ table, cols: [col.name], ref, refCols: c.names(), line: tok.line });
      } else if (c.accept("DEFAULT")) {
        // The default runs until the next constraint word.
        while (!c.done() && !["NOT", "NULL", "PRIMARY", "UNIQUE", "REFERENCES", "CHECK", "CONSTRAINT", "COLLATE", "COMMENT", "ON", "GENERATED"].includes(upper(c.peek()))) c.skip();
      } else if (c.accept("COMMENT")) {
        if (c.peek()?.t === "str") col.comment = c.next().v;
      } else if (c.accept("CONSTRAINT") || c.accept("COLLATE")) {
        c.skip();
      } else c.skip();
    }
  }

  private tableConstraint(table: Table, c: Cursor) {
    if (c.accept("CONSTRAINT")) c.skip();
    const line = c.peek()?.line ?? table.line;
    if (c.accept("PRIMARY", "KEY")) {
      c.accept("CLUSTERED") || c.accept("NONCLUSTERED");
      table.pk = c.names().map(key);
      this.check(table, table.pk, line);
    } else if (c.accept("UNIQUE")) {
      c.accept("KEY") || c.accept("INDEX");
      c.accept("CLUSTERED") || c.accept("NONCLUSTERED");
      if (isName(c.peek())) c.next();
      const cols = c.names().map(key);
      table.uniques.push(cols);
      this.check(table, cols, line);
    } else if (c.accept("FOREIGN", "KEY")) {
      if (isName(c.peek())) c.next();
      const cols = c.names();
      if (!c.accept("REFERENCES")) return;
      const ref = c.name();
      if (ref) this.fks.push({ table, cols, ref, refCols: c.names(), line });
    }
  }

  /** Warns about key columns the table doesn't have. */
  private check(table: Table, cols: string[], line: number) {
    for (const col of cols)
      if (!table.columns.some((x) => key(x.name) === col)) this.warnings.push({ message: `${table.name} has no column called ${col}.`, line });
  }

  private alterTable(c: Cursor) {
    c.accept("IF", "EXISTS");
    c.accept("ONLY");
    const nameTok = c.peek();
    const name = c.name();
    if (!name) return;
    const table = this.find(name);
    if (!table) {
      this.warnings.push({ message: `ALTER TABLE ${name.name}: there's no CREATE TABLE ${name.name} before it, so this is skipped.`, line: nameTok.line });
      return;
    }
    c.accept("WITH", "CHECK") || c.accept("WITH", "NOCHECK");
    // Several actions can follow, separated by commas.
    const actions: Tok[][] = [[]];
    let depth = 0;
    for (const tok of c.toks.slice(c.i)) {
      if (tok.t === "p" && tok.v === "(") depth++;
      if (tok.t === "p" && tok.v === ")") depth--;
      if (depth === 0 && tok.t === "p" && tok.v === ",") actions.push([]);
      else actions[actions.length - 1].push(tok);
    }
    // SQL Server writes ADD once for a list: ADD CONSTRAINT a ..., CONSTRAINT b ...
    let adding = false;
    for (const action of actions) {
      const a = new Cursor(action);
      if (a.accept("ADD")) adding = true;
      else if (ALTER_VERBS.has(upper(a.peek()))) adding = false;
      if (!adding || a.done()) continue;
      if (a.accept("COLUMN")) a.accept("IF", "NOT", "EXISTS");
      this.element(table, a);
    }
  }

  private createIndex(c: Cursor, unique: boolean) {
    c.accept("CONCURRENTLY");
    c.accept("IF", "NOT", "EXISTS");
    if (upper(c.peek()) !== "ON") c.name();
    if (!c.accept("ON")) return;
    c.accept("ONLY");
    const name = c.name();
    const table = name && this.find(name);
    if (!table || !unique) return;
    while (!c.done() && !c.isP("(")) c.next();
    const cols = c.names().map(key);
    if (cols.length) table.uniques.push(cols);
  }

  private comment(c: Cursor) {
    const what = upper(c.next());
    const name = c.name();
    if (!name || !c.accept("IS") || c.peek()?.t !== "str") return;
    const text = c.next().v;
    if (what === "TABLE") {
      const table = this.find(name);
      if (table) table.comment = text;
    } else if (what === "COLUMN" && name.schema) {
      // COMMENT ON COLUMN [schema.]table.column: name() kept the last two parts.
      const table = this.find({ name: name.schema });
      const col = table?.columns.find((x) => key(x.name) === key(name.name));
      if (col) col.comment = text;
    }
  }
}

export function parseSql(src: string): SqlSchema {
  const r = new Reader();
  r.read(tokenize(src));
  if (!r.tables.length) throw new SqlError("No tables found. Write CREATE TABLE statements, for example: CREATE TABLE users (id int PRIMARY KEY);");
  const warnings = r.warnings;

  for (const t of r.tables) {
    for (const col of t.columns) if (t.pk.includes(key(col.name))) col.pk = col.notNull = true;
    if (!t.pk.length) warnings.push({ message: `${t.name} has no primary key.`, line: t.line });
  }

  const relations: Relation[] = [];
  for (const fk of r.fks) {
    const to = r.find(fk.ref, fk.table);
    if (!to) {
      warnings.push({ message: `${fk.ref.name} isn't defined here, so this link isn't drawn.`, line: fk.line });
      continue;
    }
    const colOf = (t: Table, name: string) => t.columns.find((x) => key(x.name) === key(name));
    const fromCols = fk.cols.map((name) => colOf(fk.table, name));
    const refNames = fk.refCols.length ? fk.refCols : to.pk;
    if (!refNames.length) {
      warnings.push({ message: `${to.name} has no primary key, so name the column this refers to: REFERENCES ${to.name} (column).`, line: fk.line });
      continue;
    }
    const toCols = refNames.map((name) => colOf(to, name));
    const missing = [...fk.cols.filter((_, k) => !fromCols[k]).map((x) => `${fk.table.name}.${x}`), ...refNames.filter((_, k) => !toCols[k]).map((x) => `${to.name}.${x}`)];
    if (missing.length) {
      warnings.push({ message: `There's no column ${missing.join(" or ")}, so this link isn't drawn.`, line: fk.line });
      continue;
    }
    if (fromCols.length !== toCols.length) {
      warnings.push({ message: `This foreign key has ${fromCols.length} column${fromCols.length === 1 ? "" : "s"} but refers to ${toCols.length}.`, line: fk.line });
      continue;
    }
    for (const col of fromCols) col!.fk = true;
    const set = fromCols.map((x) => key(x!.name)).sort().join(",");
    const sameSet = (cols: string[]) => cols.length > 0 && [...cols].sort().join(",") === set;
    relations.push({
      from: fk.table,
      fromCols: fromCols as Column[],
      to,
      toCols: toCols as Column[],
      line: fk.line,
      optional: fromCols.some((x) => !x!.notNull),
      single: sameSet(fk.table.pk) || fk.table.uniques.some(sameSet),
    });
  }
  for (const t of r.tables) for (const u of t.uniques) if (u.length === 1) {
    const col = t.columns.find((x) => key(x.name) === u[0]);
    if (col) col.unique = true;
  }

  const focus: Table[] = [];
  for (const f of r.focus)
    for (const name of f.names) {
      const [a, b] = name.split(".");
      const t = r.find(b ? { schema: a, name: b } : { name: a });
      if (t) focus.push(t);
      else warnings.push({ message: `There's no table called ${name} to focus on.`, line: f.line });
    }

  warnings.sort((a, b) => a.line - b.line);
  return { title: r.title, tables: r.tables, relations, focus, warnings };
}

/** The tables to draw: everything, or the focus tables and their neighbours. */
export function visibleTables(s: SqlSchema): Set<Table> {
  if (!s.focus.length) return new Set(s.tables);
  const shown = new Set(s.focus);
  for (const r of s.relations) {
    if (s.focus.includes(r.from)) shown.add(r.to);
    if (s.focus.includes(r.to)) shown.add(r.from);
  }
  return shown;
}
