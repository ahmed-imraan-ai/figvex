import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { snippetCompletion } from "@codemirror/autocomplete";
import { PLANTUML_THEMES } from "../engines/themes";
import type { Engine } from "../engines/types";

const THEME_NAMES = ["plain", "_none_", ...PLANTUML_THEMES];

const PLANTUML_INCLUDES = [
  "C4/C4_Context", "C4/C4_Container", "C4/C4_Component", "C4/C4_Dynamic", "C4/C4_Deployment", "C4/C4_Sequence",
  "archimate/Archimate", "kubernetes/k8s-sprites-unlabeled-25pct", "k8s/Common", "classy/core", "eip/EIP-PlantUML",
  "domainstory/domainStory", "awslib14/AWSCommon", "awslib14/AWSSimplified", "azure/AzureCommon", "gcp/GCPCommon",
  "tupadr3/common", "tupadr3/devicons2/python", "tupadr3/devicons2/java", "tupadr3/font-awesome/server",
  "elastic/common", "office/Servers/database_server",
];

const PLANTUML_DIAGRAMS: Completion[] = [
  snippetCompletion("@startuml\n${}\n@enduml", { label: "@startuml", detail: "UML diagram", type: "keyword" }),
  snippetCompletion("@startmindmap\n* ${Topic}\n** ${Idea}\n@endmindmap", { label: "@startmindmap", detail: "mind map", type: "keyword" }),
  snippetCompletion("@startgantt\n[${Task}] lasts ${5} days\n@endgantt", { label: "@startgantt", detail: "Gantt chart", type: "keyword" }),
  snippetCompletion("@startwbs\n* ${Project}\n** ${Phase}\n@endwbs", { label: "@startwbs", detail: "work breakdown", type: "keyword" }),
  snippetCompletion('@startjson\n{\n  "${key}": "${value}"\n}\n@endjson', { label: "@startjson", detail: "JSON data", type: "keyword" }),
  snippetCompletion("@startyaml\n${key: value}\n@endyaml", { label: "@startyaml", detail: "YAML data", type: "keyword" }),
  snippetCompletion("@startregex\n${/[a-z]+/}\n@endregex", { label: "@startregex", detail: "regular expression", type: "keyword" }),
  snippetCompletion("@startebnf\n${rule} = ${definition};\n@endebnf", { label: "@startebnf", detail: "EBNF grammar", type: "keyword" }),
];

const PLANTUML_SNIPPETS: Completion[] = [
  snippetCompletion("class ${Name} {\n  ${+field : Type}\n  ${+method() : void}\n}", { label: "class", detail: "block", type: "keyword" }),
  snippetCompletion("interface ${Name} {\n  ${+method() : void}\n}", { label: "interface", detail: "block", type: "keyword" }),
  snippetCompletion("enum ${Name} {\n  ${VALUE}\n}", { label: "enum", detail: "block", type: "keyword" }),
  snippetCompletion("alt ${condition}\n  ${}\nelse ${otherwise}\n  \nend", { label: "alt", detail: "alt / else / end", type: "keyword" }),
  snippetCompletion("loop ${condition}\n  ${}\nend", { label: "loop", detail: "block", type: "keyword" }),
  snippetCompletion("if (${condition}) then (yes)\n  :${action};\nelse (no)\n  :${other};\nendif", { label: "if", detail: "activity branch", type: "keyword" }),
  snippetCompletion("while (${condition})\n  :${action};\nendwhile", { label: "while", detail: "activity loop", type: "keyword" }),
  snippetCompletion("note ${right} of ${Element}\n  ${text}\nend note", { label: "note", detail: "block", type: "keyword" }),
  snippetCompletion("skinparam ${name} ${value}", { label: "skinparam", type: "keyword" }),
  snippetCompletion("!theme ${name}", { label: "!theme", type: "keyword" }),
  snippetCompletion("!include <${library}>", { label: "!include", type: "keyword" }),
  snippetCompletion("legend ${right}\n  ${text}\nendlegend", { label: "legend", detail: "block", type: "keyword" }),
];

const PLANTUML_WORDS = `actor participant boundary control entity database collections queue usecase abstract
annotation package namespace node component rectangle cloud frame folder artifact card storage state object
start stop end endif endwhile repeat fork again partition activate deactivate destroy create return
autonumber title header footer caption hide show scale left right top bottom direction together
`.trim().split(/\s+/).map((label) => ({ label, type: "keyword" }));

const MERMAID_DIAGRAMS: Completion[] = [
  snippetCompletion("flowchart ${TD}\n  ${A[Start]} --> ${B[End]}", { label: "flowchart", detail: "flowchart", type: "keyword" }),
  snippetCompletion("sequenceDiagram\n  ${Alice}->>${Bob}: ${Hello}", { label: "sequenceDiagram", type: "keyword" }),
  snippetCompletion("classDiagram\n  class ${Animal} {\n    +${name} : String\n  }", { label: "classDiagram", type: "keyword" }),
  snippetCompletion("stateDiagram-v2\n  [*] --> ${Idle}\n  ${Idle} --> [*]", { label: "stateDiagram-v2", type: "keyword" }),
  snippetCompletion("erDiagram\n  ${CUSTOMER} ||--o{ ${ORDER} : places", { label: "erDiagram", type: "keyword" }),
  snippetCompletion("gantt\n  title ${Plan}\n  dateFormat YYYY-MM-DD\n  section ${Phase}\n  ${Task} : ${t1}, 2026-01-01, 5d", { label: "gantt", type: "keyword" }),
  snippetCompletion("pie title ${Title}\n  \"${A}\" : ${40}\n  \"${B}\" : ${60}", { label: "pie", type: "keyword" }),
  snippetCompletion("gitGraph\n  commit\n  branch ${feature}\n  commit\n  checkout main\n  merge ${feature}", { label: "gitGraph", type: "keyword" }),
  snippetCompletion("mindmap\n  root((${Topic}))\n    ${Idea}", { label: "mindmap", type: "keyword" }),
  snippetCompletion("timeline\n  title ${Title}\n  ${2024} : ${Event}", { label: "timeline", type: "keyword" }),
];

const MERMAID_WORDS = `subgraph end direction participant actor loop alt else opt par and rect note activate
deactivate autonumber class classDef style linkStyle click state title section dateFormat axisFormat
excludes commit branch checkout merge`.trim().split(/\s+/).map((label) => ({ label, type: "keyword" }));

function plantumlSource(ctx: CompletionContext): CompletionResult | null {
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, ctx.pos - line.from);

  const theme = before.match(/^\s*!theme\s+([\w-]*)$/);
  if (theme) {
    return { from: ctx.pos - theme[1].length, options: THEME_NAMES.map((label) => ({ label, type: "constant" })) };
  }
  const include = before.match(/^\s*!include\s+<([\w/.-]*)$/);
  if (include) {
    return {
      from: ctx.pos - include[1].length,
      options: PLANTUML_INCLUDES.map((label) => ({ label, type: "namespace", apply: `${label}>` })),
    };
  }
  const word = ctx.matchBefore(/[@!]?[\w-]+/);
  if (!word || (word.from === word.to && !ctx.explicit)) return null;
  if (word.text.startsWith("@")) return { from: word.from, options: PLANTUML_DIAGRAMS };
  const atLineStart = /^\s*[@!]?[\w-]*$/.test(before);
  return {
    from: word.from,
    options: atLineStart ? [...PLANTUML_SNIPPETS, ...PLANTUML_WORDS] : PLANTUML_WORDS,
    validFor: /^[!\w-]*$/,
  };
}

function mermaidSource(ctx: CompletionContext): CompletionResult | null {
  const word = ctx.matchBefore(/[\w-]+/);
  if (!word || (word.from === word.to && !ctx.explicit)) return null;
  const firstLine = ctx.state.doc.lineAt(ctx.pos).number === 1 || !ctx.state.doc.toString().trim();
  return {
    from: word.from,
    options: firstLine ? [...MERMAID_DIAGRAMS, ...MERMAID_WORDS] : MERMAID_WORDS,
    validFor: /^[\w-]*$/,
  };
}

const DOT_GRAPHS: Completion[] = [
  snippetCompletion("digraph ${G} {\n  ${a} -> ${b}\n}", { label: "digraph", detail: "directed graph", type: "keyword" }),
  snippetCompletion("graph ${G} {\n  ${a} -- ${b}\n}", { label: "graph", detail: "undirected graph", type: "keyword" }),
];

const DOT_SNIPPETS: Completion[] = [
  snippetCompletion("subgraph cluster_${name} {\n  label=\"${Label}\"\n  ${}\n}", { label: "subgraph", detail: "cluster", type: "keyword" }),
  snippetCompletion("node [${shape=box}]", { label: "node", detail: "default node attributes", type: "keyword" }),
  snippetCompletion("edge [${color=gray}]", { label: "edge", detail: "default edge attributes", type: "keyword" }),
  snippetCompletion("rankdir=${LR}", { label: "rankdir", detail: "layout direction", type: "property" }),
  snippetCompletion("{ rank=same; ${a}; ${b} }", { label: "rank=same", detail: "same row", type: "keyword" }),
];

/** Common attributes and, where the set is small, their values. */
const DOT_ATTRIBUTES: Record<string, string[]> = {
  label: [], xlabel: [], color: [], fillcolor: [], fontcolor: [], fontname: [], fontsize: [], penwidth: [],
  width: [], height: [], fixedsize: ["true", "false", "shape"], group: [], tooltip: [], URL: [], weight: [],
  shape: `box ellipse circle doublecircle point plaintext plain none record Mrecord diamond square triangle
    invtriangle house invhouse hexagon octagon parallelogram trapezium cylinder note tab folder box3d component
    underline star`.split(/\s+/),
  style: "filled rounded dashed dotted bold solid invis striped wedged".split(" "),
  rankdir: ["TB", "LR", "BT", "RL"],
  rank: ["same", "min", "max", "source", "sink"],
  layout: ["dot", "neato", "fdp", "sfdp", "circo", "twopi", "osage", "patchwork"],
  splines: ["true", "false", "ortho", "polyline", "curved", "line", "none"],
  arrowhead: "normal inv dot odot none empty diamond ediamond open halfopen box obox crow tee vee".split(" "),
  arrowtail: "normal inv dot odot none empty diamond ediamond open halfopen box obox crow tee vee".split(" "),
  dir: ["forward", "back", "both", "none"],
  constraint: ["true", "false"],
  compound: ["true", "false"],
  concentrate: ["true", "false"],
  overlap: ["false", "true", "scale", "prism"],
  labelloc: ["t", "b", "c"],
  labeljust: ["l", "r", "c"],
  nodesep: [], ranksep: [], bgcolor: [], lhead: [], ltail: [], headlabel: [], taillabel: [],
};

const DOT_ATTRIBUTE_NAMES: Completion[] = Object.keys(DOT_ATTRIBUTES).map((label) => ({ label, type: "property" }));

function dotSource(ctx: CompletionContext): CompletionResult | null {
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, ctx.pos - line.from);

  const value = before.match(/\b(\w+)\s*=\s*"?([\w-]*)$/);
  if (value && DOT_ATTRIBUTES[value[1]]?.length) {
    return {
      from: ctx.pos - value[2].length,
      options: DOT_ATTRIBUTES[value[1]].map((label) => ({ label, type: "constant" })),
      validFor: /^[\w-]*$/,
    };
  }
  const word = ctx.matchBefore(/\w+/);
  if (!word || (word.from === word.to && !ctx.explicit)) return null;
  const inBrackets = before.lastIndexOf("[") > before.lastIndexOf("]");
  if (inBrackets) return { from: word.from, options: DOT_ATTRIBUTE_NAMES, validFor: /^\w*$/ };
  const text = ctx.state.doc.toString();
  const beforeGraph = !/^\s*(strict\s+)?(di)?graph\b/im.test(text.slice(0, line.from));
  return {
    from: word.from,
    options: beforeGraph ? DOT_GRAPHS : [...DOT_SNIPPETS, ...DOT_ATTRIBUTE_NAMES],
    validFor: /^\w*$/,
  };
}

const SOURCES = { plantuml: plantumlSource, mermaid: mermaidSource, graphviz: dotSource } as const;

export function completionSource(engine: Engine) {
  return SOURCES[engine];
}
