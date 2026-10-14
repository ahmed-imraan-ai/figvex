// Lightweight stream tokenizers for every diagram language. They only need to
// be good enough for colouring; the engines do the real parsing.

import { StreamLanguage, type StringStream } from "@codemirror/language";
import { DEVICE_KINDS } from "../engines/network/model";

const PLANTUML_KEYWORDS = new Set(
  `
  actor participant boundary control entity database collections queue usecase
  class interface abstract enum annotation struct exception metaclass stereotype protocol
  package namespace node component rectangle cloud frame folder artifact card file storage stack hexagon
  agent person label circle diamond port portin portout
  state object map json diamond
  start stop end kill detach if then else elseif endif while endwhile repeat backward
  fork again split merge switch case endswitch endfork endsplit partition
  note ref over of on left right top bottom as is
  alt opt loop par break critical group else end
  activate deactivate destroy create return autonumber autoactivate
  title header footer legend endlegend caption center
  skinparam hide show remove restore scale skin newpage box together allowmixing
  mainframe top bottom to direction
  project starts ends lasts requires happens at and day days week weeks
  robust concise clock binary highlight
  link links
  `.trim().split(/\s+/),
);

const MERMAID_KEYWORDS = new Set(
  `
  subgraph end direction TB TD BT RL LR
  participant actor as loop alt else opt par and rect note over left right of
  activate deactivate autonumber critical break box
  class classDef style linkStyle click callback call href namespace
  state title section dateFormat axisFormat tickInterval excludes includes todayMarker weekday
  commit branch checkout merge cherry-pick id tag type
  x-axis y-axis quadrant-1 quadrant-2 quadrant-3 quadrant-4 line bar
  accTitle accDescr root columns space
  `.trim().split(/\s+/),
);

const MERMAID_TYPES =
  /^(flowchart|graph|sequenceDiagram|classDiagram(-v2)?|stateDiagram(-v2)?|erDiagram|journey|gantt|pie|quadrantChart|requirementDiagram|gitGraph|C4\w+|mindmap|timeline|zenuml|sankey(-beta)?|xychart(-beta)?|block(-beta)?|packet(-beta)?|kanban|architecture(-beta)?|radar(-beta)?|treemap(-beta)?|venn(-beta)?|ishikawa(-beta)?|wardley(-beta)?|railroad|usecase|swimlanes|treeView|info)\b/;

interface State {
  blockComment: boolean;
  afterColon: boolean;
}

const startState = (): State => ({ blockComment: false, afterColon: false });

export const plantumlLanguage = StreamLanguage.define<State>({
  name: "plantuml",
  startState,
  token(stream: StringStream, state: State) {
    if (stream.sol()) state.afterColon = false;

    if (state.blockComment) {
      if (stream.skipTo("'/")) {
        stream.pos += 2;
        state.blockComment = false;
      } else {
        stream.skipToEnd();
      }
      return "comment";
    }
    if (stream.eatSpace()) return null;

    if (state.afterColon) {
      stream.skipToEnd();
      return "labelName";
    }
    if (stream.match("/'")) {
      state.blockComment = true;
      return "comment";
    }
    if (stream.peek() === "'") {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match(/^@(start|end)\w+/)) return "meta";
    if (stream.match(/^!\w+/)) return "macroName";
    if (stream.match(/^<<[^>]*>>/)) return "annotation";
    if (stream.match(/^<[\w/.\-]+>/)) return "string";
    if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) return "string";
    if (stream.match(/^#[0-9a-fA-F]{3,8}\b/) || stream.match(/^#[A-Za-z]+/)) return "color";
    if (stream.match(/^\[\*\]/)) return "atom";
    if (stream.match(/^(<\|?|<<|\*|o|\+|\\\\|\/\/|\}|\^)?[-.=~]+(\[[^\]]*\])?((up|down|left|right|u|d|l|r)[-.=~]*)?(\|?>|>>|\*|o|\+|\\\\|\/\/|\{|x|\^)?(?=[\s\w"(\[:]|$)/)) {
      return "operator";
    }
    if (stream.match(/^-?\d+(\.\d+)?/)) return "number";
    if (stream.match(/^\$?[A-Za-z_][\w]*/)) {
      const word = stream.current();
      return PLANTUML_KEYWORDS.has(word.toLowerCase()) ? "keyword" : null;
    }
    if (stream.eat(":")) {
      state.afterColon = true;
      return "punctuation";
    }
    if (stream.match(/^[{}()[\]]/)) return "bracket";
    stream.next();
    return null;
  },
  languageData: {
    commentTokens: { line: "'", block: { open: "/'", close: "'/" } },
  },
});

export const mermaidLanguage = StreamLanguage.define<State>({
  name: "mermaid",
  startState,
  token(stream: StringStream) {
    if (stream.eatSpace()) return null;
    if (stream.match(/^%%\{.*\}%%/)) return "meta";
    if (stream.match("%%")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.sol() && stream.match(/^---\s*$/)) return "meta";
    if (stream.match(MERMAID_TYPES)) return "meta";
    if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) return "string";
    if (stream.match(/^\|[^|]*\|/)) return "string";
    if (stream.match(/^:::\w+/)) return "annotation";
    if (stream.match(/^#[0-9a-fA-F]{3,8}\b/)) return "color";
    if (stream.match(/^\[\*\]/)) return "atom";
    if (stream.match(/^(<<|<|x|o)?(-{2,}|={2,}|\.{1,}-|-\.+-?|~{3})(>>|>|x|o|\))?/) ||
        stream.match(/^-[->x)]+/) || stream.match(/^[|}][|o]--[o|][|{]/) || stream.match(/^[|}][|o]\.\.[o|][|{]/)) {
      return "operator";
    }
    if (stream.match(/^-?\d+(\.\d+)?%?/)) return "number";
    if (stream.match(/^[A-Za-z_][\w-]*/)) {
      const word = stream.current();
      return MERMAID_KEYWORDS.has(word) ? "keyword" : null;
    }
    if (stream.match(/^[{}()[\]>]/)) return "bracket";
    stream.next();
    return null;
  },
  languageData: {
    commentTokens: { line: "%%" },
  },
});

const DOT_KEYWORDS = new Set(["strict", "graph", "digraph", "subgraph", "node", "edge"]);

interface DotState {
  blockComment: boolean;
  /** Nesting depth inside an HTML-like label, < ... >. */
  html: number;
  afterEquals: boolean;
}

export const dotLanguage = StreamLanguage.define<DotState>({
  name: "dot",
  startState: () => ({ blockComment: false, html: 0, afterEquals: false }),
  token(stream: StringStream, state: DotState) {
    if (state.blockComment) {
      if (stream.skipTo("*/")) {
        stream.pos += 2;
        state.blockComment = false;
      } else {
        stream.skipToEnd();
      }
      return "comment";
    }
    if (state.html) {
      while (!stream.eol() && state.html) {
        const c = stream.next();
        if (c === "<") state.html++;
        else if (c === ">") state.html--;
      }
      if (!state.html) state.afterEquals = false;
      return "string";
    }
    if (stream.eatSpace()) return null;

    if (stream.match("/*")) {
      state.blockComment = true;
      return "comment";
    }
    if (stream.match("//") || (stream.sol() && stream.peek() === "#")) {
      stream.skipToEnd();
      return "comment";
    }
    const value = state.afterEquals;
    state.afterEquals = false;
    if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) {
      return value && /^"#[0-9a-fA-F]{6,8}"$/.test(stream.current()) ? "color" : "string";
    }
    if (stream.eat("<")) {
      state.html = 1;
      return "string";
    }
    if (stream.match(/^(->|--)/)) return "operator";
    if (stream.match(/^-?(\.\d+|\d+(\.\d*)?)/)) return "number";
    if (stream.match(/^[A-Za-z_\u0080-\uffff][\w\u0080-\uffff]*/)) {
      const word = stream.current();
      if (value) return "atom";
      if (DOT_KEYWORDS.has(word.toLowerCase())) return "keyword";
      return stream.match(/^\s*=/, false) ? "macroName" : null;
    }
    if (stream.eat("=")) {
      state.afterEquals = true;
      return "punctuation";
    }
    if (stream.match(/^[{}[\]]/)) return "bracket";
    stream.next();
    return null;
  },
  languageData: {
    commentTokens: { line: "//", block: { open: "/*", close: "*/" } },
  },
});

interface ChartState {
  blockComment: boolean;
  /** Past the --- line: the rest is CSV. */
  csv: boolean;
}

/** JSON with comments for ECharts options, then CSV after a --- line. */
export const chartLanguage = StreamLanguage.define<ChartState>({
  name: "echarts",
  startState: () => ({ blockComment: false, csv: false }),
  token(stream: StringStream, state: ChartState) {
    if (state.csv) {
      if (stream.match(/^"(?:[^"]|"")*"?/)) return "string";
      if (stream.match(/^-?\d+(\.\d+)?([eE][-+]?\d+)?(?=\s*(,|\t|$))/)) return "number";
      if (stream.match(/^[,\t]/)) return "punctuation";
      stream.match(/^[^,\t"]+/) || stream.next();
      return null;
    }
    if (state.blockComment) {
      if (stream.skipTo("*/")) {
        stream.pos += 2;
        state.blockComment = false;
      } else {
        stream.skipToEnd();
      }
      return "comment";
    }
    if (stream.sol() && stream.match(/^\s*---\s*$/)) {
      state.csv = true;
      return "meta";
    }
    if (stream.eatSpace()) return null;
    if (stream.match("//")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match("/*")) {
      state.blockComment = true;
      return "comment";
    }
    if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) {
      if (stream.match(/^\s*:/, false)) return "macroName";
      return /^"#[0-9a-fA-F]{3,8}"$/.test(stream.current()) ? "color" : "string";
    }
    if (stream.match(/^-?\d+(\.\d+)?([eE][-+]?\d+)?/)) return "number";
    if (stream.match(/^(true|false|null)\b/)) return "atom";
    if (stream.match(/^[{}[\]]/)) return "bracket";
    stream.next();
    return null;
  },
  languageData: {
    commentTokens: { line: "//", block: { open: "/*", close: "*/" } },
  },
});

/** WaveJSON: JSON5 with bare keys and single-quoted strings. */
export const waveLanguage = StreamLanguage.define<{ blockComment: boolean }>({
  name: "wavedrom",
  startState: () => ({ blockComment: false }),
  token(stream: StringStream, state) {
    if (state.blockComment) {
      if (stream.skipTo("*/")) {
        stream.pos += 2;
        state.blockComment = false;
      } else stream.skipToEnd();
      return "comment";
    }
    if (stream.eatSpace()) return null;
    if (stream.match("//")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match("/*")) {
      state.blockComment = true;
      return "comment";
    }
    if (stream.match(/^(["'])(?:(?!\1)[^\\]|\\.)*\1?/)) return stream.match(/^\s*:/, false) ? "propertyName" : "string";
    if (stream.match(/^[A-Za-z_$][\w$]*(?=\s*:)/)) return "propertyName";
    if (stream.match(/^-?\d+(\.\d+)?/)) return "number";
    if (stream.match(/^(true|false|null)\b/)) return "atom";
    if (stream.match(/^[{}[\]]/)) return "bracket";
    stream.next();
    return null;
  },
  languageData: {
    commentTokens: { line: "//", block: { open: "/*", close: "*/" } },
  },
});

interface XmlState {
  comment: boolean;
  cdata: boolean;
  inTag: boolean;
}

/** XML, for BPMN files. BPMN element names are shown as keywords. */
export const xmlLanguage = StreamLanguage.define<XmlState>({
  name: "bpmn",
  startState: () => ({ comment: false, cdata: false, inTag: false }),
  token(stream: StringStream, state: XmlState) {
    if (state.comment) {
      if (stream.skipTo("-->")) {
        stream.pos += 3;
        state.comment = false;
      } else {
        stream.skipToEnd();
      }
      return "comment";
    }
    if (state.cdata) {
      if (stream.skipTo("]]>")) {
        stream.pos += 3;
        state.cdata = false;
      } else {
        stream.skipToEnd();
      }
      return "string";
    }
    if (stream.eatSpace()) return null;
    if (state.inTag) {
      if (stream.match(/^\/?>/) || stream.match("?>")) {
        state.inTag = false;
        return "bracket";
      }
      if (stream.match(/^"[^"]*"?/) || stream.match(/^'[^']*'?/)) return "string";
      if (stream.match(/^[\w:.-]+/)) return "macroName";
      stream.next();
      return null;
    }
    if (stream.match("<!--")) {
      state.comment = true;
      return "comment";
    }
    if (stream.match("<![CDATA[")) {
      state.cdata = true;
      return "string";
    }
    if (stream.match(/^<\?[\w:-]*/)) {
      state.inTag = true;
      return "meta";
    }
    if (stream.match(/^<\/?[\w:.-]*/)) {
      state.inTag = true;
      const name = stream.current().replace(/^<\/?/, "");
      return /^(bpmndi|dc|di|omgdc|omgdi):|^bpmndi?:BPMN/i.test(name) ? "comment" : "keyword";
    }
    if (stream.match(/^&\w+;/)) return "atom";
    stream.match(/^[^<&]+/) || stream.next();
    return null;
  },
  languageData: {
    commentTokens: { block: { open: "<!--", close: "-->" } },
  },
});

/** Org charts: settings, then "Name #id: Title [Department]" lines. */
export const orgLanguage = StreamLanguage.define<{ part: "name" | "title" | "done" }>({
  name: "orgchart",
  startState: () => ({ part: "name" }),
  token(stream: StringStream, state) {
    if (stream.sol()) {
      state.part = "name";
      if (stream.match(/^\s*#\s.*$/) || stream.match(/^\s*#$/)) return "comment";
      if (stream.match(/^(orgchart|title|direction|compact|counts)\b/)) {
        state.part = "done";
        return "keyword";
      }
    }
    if (stream.eatSpace()) return null;
    if (stream.match(/^"[^"]*"?/)) return "string";
    if (stream.match(/^\s#\s.*$/)) return "comment";
    if (stream.match(/^(down|right)\b/) && state.part === "done") return "atom";
    if (stream.match("..")) {
      state.part = "name";
      return "operator";
    }
    if (state.part === "name" && stream.match(/^\+/)) return "operator";
    if (state.part === "name" && stream.match(/^\?/)) return "atom";
    if (stream.match(/^#[A-Za-z_][\w-]*/)) return "macroName";
    if (stream.match(/^\[[^\]]*\]?/)) return "annotation";
    if (stream.eat(":")) {
      state.part = "title";
      return "punctuation";
    }
    if (state.part === "title") {
      stream.match(/^[^[#]+/) || stream.next();
      return "labelName";
    }
    stream.match(/^[^:[#.]+/) || stream.next();
    return state.part === "name" ? "keyword" : null;
  },
  languageData: {
    commentTokens: { line: "#" },
  },
});

const NET_KINDS = new RegExp(`^(${DEVICE_KINDS.join("|")})\\b`);

/** Network diagrams: device and zone lines, links, addresses and VLANs. */
export const networkLanguage = StreamLanguage.define<{ first: boolean }>({
  name: "network",
  startState: () => ({ first: true }),
  token(stream: StringStream, state) {
    if (stream.sol()) state.first = true;
    if (stream.eatSpace()) return null;
    if (stream.peek() === "#" && (stream.sol() || /\s/.test(stream.string.charAt(stream.pos - 1)))) {
      stream.skipToEnd();
      return "comment";
    }
    if (state.first) {
      state.first = false;
      if (stream.match(/^(network|title|direction|lines|checks|zone)\b/)) return "keyword";
      if (stream.match(NET_KINDS)) return "typeName";
    }
    if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) return "string";
    if (stream.match(/^(--|==|\.\.|~~)/)) return "operator";
    if (stream.match(/^\d+(\.\d+){3}(\/\d+)?/) || stream.match(/^[0-9a-fA-F]*:[0-9a-fA-F]*:[0-9a-fA-F:.]*(\/\d+)?/)) return "number";
    if (stream.match(/^vlan\b/)) {
      stream.eatSpace();
      stream.match(/^[\d,\s]+/);
      return "macroName";
    }
    if (stream.match(/^x\d+\b/)) return "number";
    if (stream.match(/^(down|right|straight|curved|square|on|off)\b/)) return "atom";
    if (stream.match(/^:[^\s,"]+/)) return "attributeName";
    if (stream.match(/^[A-Za-z_][\w-]*/)) return "labelName";
    stream.next();
    return null;
  },
  languageData: {
    commentTokens: { line: "#" },
  },
});

const SQL_KEYWORDS = new Set(
  `
  create table alter add drop column constraint primary foreign key references unique index on not null default check
  if exists temporary temp or replace only cascade restrict set delete update no action collate comment is as
  auto_increment autoincrement identity generated always by stored virtual without rowid clustered nonclustered
  schema database use view insert into values select from where and in go begin commit transaction with
  `.trim().split(/\s+/),
);

const SQL_TYPES =
  /^(big|small|tiny|medium)?(int|integer|serial)\d?\b|^(numeric|decimal|real|float|double|precision|money|bit|boolean|bool|n?(var)?char|character|varying|n?text|string|uuid|json|jsonb|xml|bytea|blob|binary|varbinary|date|time|timestamp|timestamptz|datetime2?|interval|year|enum|inet|cidr|array|number|varchar2|clob|unsigned)\b/i;

/** SQL DDL: keywords, types, strings, quoted names and "-- group:" style comments. */
export const sqlLanguage = StreamLanguage.define<{ inComment: boolean }>({
  name: "sql",
  startState: () => ({ inComment: false }),
  token(stream: StringStream, state) {
    if (state.inComment) {
      if (stream.skipTo("*/")) {
        stream.match("*/");
        state.inComment = false;
      } else stream.skipToEnd();
      return "comment";
    }
    if (stream.eatSpace()) return null;
    if (stream.match(/^--\s*(title|group|focus)\s*:/i)) {
      stream.skipToEnd();
      return "meta";
    }
    if (stream.match("--") || (stream.sol() && stream.peek() === "#")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match("/*")) {
      state.inComment = true;
      return "comment";
    }
    if (stream.match(/^'(?:[^']|'')*'?/)) return "string";
    if (stream.match(/^"[^"]*"?/) || stream.match(/^`[^`]*`?/) || stream.match(/^\[[^\]]*\]?/)) return "variableName";
    if (stream.match(/^\d+(\.\d+)?/)) return "number";
    if (stream.match(SQL_TYPES)) return "typeName";
    const word = stream.match(/^[A-Za-z_][\w$]*/) as RegExpMatchArray | null;
    if (word) return SQL_KEYWORDS.has(word[0].toLowerCase()) ? "keyword" : "variableName";
    stream.next();
    return null;
  },
  languageData: {
    commentTokens: { line: "--", block: { open: "/*", close: "*/" } },
  },
});

/** Logic files: settings, function names, operators, minterm lists. */
export const logicLanguage = StreamLanguage.define<{ first: boolean; setting: boolean }>({
  name: "logic",
  startState: () => ({ first: true, setting: false }),
  token(stream: StringStream, state) {
    if (stream.sol()) {
      state.first = true;
      state.setting = false;
    }
    if (stream.eatSpace()) return null;
    if (stream.match(/^(#|\/\/)/)) {
      stream.skipToEnd();
      return "comment";
    }
    if (state.first) {
      state.first = false;
      if (stream.match(/^(logic|title|vars|show|form|gates|circuit|compare)\b/)) {
        state.setting = true;
        return "keyword";
      }
      if (stream.match(/^[A-Za-z]\w*(?=\s*(\(|=))/)) return "def";
    }
    if (stream.match(/^"[^"]*"?/)) return "string";
    if (state.setting) {
      if (stream.match(/^(table|kmap|simplified|circuit|minterms|all|sop|pos|both|ansi|iec|written)\b/)) return "atom";
      stream.match(/^[^\s#]+/) || stream.next();
      return "variableName";
    }
    if (stream.match(/^(sum|prod|Σm|ΠM|Σ|Π|m|M|d|dc)(?=\s*\()/)) return "macroName";
    if (stream.match(/^(and|or|not|xor|xnor|nand|nor)\b/i)) return "operator";
    if (stream.match(/^(&&|\|\||[·.*&∧⋅+|∨^⊕⊙↑↓!~¬'’=])/)) return "operator";
    if (stream.match(/^\d+/)) return "number";
    if (stream.match(/^[A-Za-z]\w*/)) return "variableName";
    stream.next();
    return null;
  },
  languageData: {
    commentTokens: { line: "#" },
  },
});

/** Automata: settings, state names and transition labels. */
export const automatonLanguage = StreamLanguage.define<{ first: boolean; label: boolean }>({
  name: "automaton",
  startState: () => ({ first: true, label: false }),
  token(stream: StringStream, state) {
    if (stream.sol()) {
      state.first = true;
      state.label = false;
    }
    if (stream.eatSpace()) return null;
    if ((stream.sol() || /\s/.test(stream.string.charAt(stream.pos - 1))) && stream.match(/^(#|\/\/)/)) {
      stream.skipToEnd();
      return "comment";
    }
    if (state.first) {
      state.first = false;
      if (stream.match(/^(automaton|dfa|nfa|tm|turing|title|start|accept|final|input|direction|blank|states?)\b(?!\s*-)/)) return "keyword";
    }
    if (state.label) {
      if (stream.match("->")) {
        state.label = false;
        return "operator";
      }
      if (stream.match(/^(ε|eps|epsilon|λ)\b/)) return "atom";
      if (stream.match(/^[,;/]/)) return "punctuation";
      if (stream.match(/^[LRSN](?=\s*(;|->))/)) return "keyword";
      stream.next();
      return "string";
    }
    if (stream.match(/^"[^"]*"?/)) return "string";
    if (stream.match(/^-(?!>)/)) {
      state.label = true;
      return "operator";
    }
    if (stream.match(/^(->|:)/)) return "operator";
    if (stream.match(/^\S+/)) return "variableName";
    stream.next();
    return null;
  },
  languageData: {
    commentTokens: { line: "#" },
  },
});

/** Data structures: the kind, the name, values and options. */
export const structuresLanguage = StreamLanguage.define<{ first: boolean }>({
  name: "structures",
  startState: () => ({ first: true }),
  token(stream: StringStream, state) {
    if (stream.sol()) state.first = true;
    if (stream.eatSpace()) return null;
    if ((stream.sol() || /\s/.test(stream.string.charAt(stream.pos - 1))) && stream.match(/^(#|\/\/)/)) {
      stream.skipToEnd();
      return "comment";
    }
    if (state.first) {
      state.first = false;
      if (stream.match(/^(structures|title|array|matrix|stack|queue|list|tree|bst|heap|hash|graph|digraph)\b/)) return "keyword";
    }
    if (stream.match(/^(mark|ptr|circular|probe|size|linear|quadratic|chain|null)\b/)) return "atom";
    if (stream.match(/^"[^"]*"?/) || stream.match(/^'[^']*'?/)) return "string";
    if (stream.match(/^(<->|->|--|=)/)) return "operator";
    if (stream.match(/^-?\d+(\.\d+)?/)) return "number";
    if (stream.match(/^[[\](),:]/)) return "bracket";
    if (stream.match(/^[\w.]+/)) return "variableName";
    stream.next();
    return null;
  },
  languageData: {
    commentTokens: { line: "#" },
  },
});

const SKETCH_KINDS =/^(sketch|box|ellipse|diamond|text|arrow|line|pen)\b/;

/** The sketch format: element kind, id, numbers, "labels" and options. */
export const sketchLanguage = StreamLanguage.define<{ first: boolean }>({
  name: "sketch",
  startState: () => ({ first: true }),
  token(stream: StringStream, state) {
    if (stream.sol()) state.first = true;
    if (stream.eatSpace()) return null;
    if (stream.sol() && stream.peek() === "#") {
      stream.skipToEnd();
      return "comment";
    }
    if (state.first) {
      state.first = false;
      if (stream.match(SKETCH_KINDS)) return "keyword";
    }
    if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) return "string";
    if (stream.match("->")) return "operator";
    if (stream.match(/^(fill|stroke|width|size)=/)) {
      stream.match(/^#[0-9a-fA-F]{3,8}\b/) || stream.match(/^[\w.]+/);
      return "macroName";
    }
    if (stream.match(/^(dashed|round|bold|both|none)\b/)) return "atom";
    if (stream.match(/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?)?/)) return "number";
    if (stream.match(/^[A-Za-z_][\w-]*/)) return "labelName";
    stream.next();
    return null;
  },
  languageData: {
    commentTokens: { line: "#" },
  },
});
