// Lightweight stream tokenizers for every diagram language. They only need to
// be good enough for colouring; the engines do the real parsing.

import { StreamLanguage, type StringStream } from "@codemirror/language";

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

const SKETCH_KINDS = /^(sketch|box|ellipse|diamond|text|arrow|line|pen)\b/;

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
