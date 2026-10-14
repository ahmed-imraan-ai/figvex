import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { snippetCompletion } from "@codemirror/autocomplete";
import { SERIES_TYPES } from "../engines/chart";
import { DEVICE_KINDS, KIND_LABEL } from "../engines/network/model";
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

const CHART_STARTERS: Completion[] = [
  snippetCompletion(
    '{\n  "title": { "text": "${Title}" },\n  "xAxis": { "type": "category" },\n  "yAxis": {},\n  "series": [{ "type": "${bar}" }]\n}\n---\n${name},value\nA,3\nB,5\n',
    { label: "{ bar chart", detail: "with CSV data", type: "keyword" },
  ),
  snippetCompletion('{\n  "series": [{ "type": "pie", "data": [\n    { "name": "${A}", "value": ${40} },\n    { "name": "${B}", "value": ${60} }\n  ] }]\n}\n', {
    label: "{ pie chart",
    type: "keyword",
  }),
];

const CHART_KEYS: Completion[] = [
  ["title", '"title": { "text": "${}" }'],
  ["legend", '"legend": {}'],
  ["xAxis", '"xAxis": { "type": "${category}" }'],
  ["yAxis", '"yAxis": { "type": "${value}" }'],
  ["series", '"series": [{ "type": "${bar}" }]'],
  ["dataset", '"dataset": { "source": [${}] }'],
  ["grid", '"grid": { "left": ${60}, "right": ${20} }'],
  ["visualMap", '"visualMap": { "min": ${0}, "max": ${10} }'],
  ["radar", '"radar": { "indicator": [${}] }'],
  ["width", '"width": ${720}'],
  ["height", '"height": ${440}'],
  ["name", '"name": "${}"'],
  ["data", '"data": [${}]'],
  ["encode", '"encode": { "x": "${}", "y": "${}" }'],
  ["label", '"label": { "show": true }'],
  ["stack", '"stack": "${total}"'],
  ["smooth", '"smooth": true'],
  ["markLine", '"markLine": { "data": [{ "type": "${average}" }] }'],
].map(([label, snippet]) => snippetCompletion(snippet, { label, type: "property" }));

function chartSource(ctx: CompletionContext): CompletionResult | null {
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, ctx.pos - line.from);
  const type = before.match(/"type"\s*:\s*"(\w*)$/);
  if (type) {
    return {
      from: ctx.pos - type[1].length,
      options: SERIES_TYPES.map((label) => ({ label, type: "constant" })),
      validFor: /^\w*$/,
    };
  }
  if (!ctx.state.doc.toString().trim()) {
    return ctx.explicit || ctx.matchBefore(/\{$/) ? { from: line.from, options: CHART_STARTERS } : null;
  }
  const word = ctx.matchBefore(/"?\w*/);
  if (!word || (word.from === word.to && !ctx.explicit)) return null;
  if (/(^|\n)\s*---\s*\n/.test(ctx.state.doc.sliceString(0, line.from))) return null; // in the CSV part
  return { from: word.from, options: CHART_KEYS, validFor: /^"?\w*$/ };
}

/** BPMN elements as [name, attributes and body]; "$P" is the file's namespace prefix. */
const BPMN_ELEMENTS: [string, string, string][] = [
  ["startEvent", 'startEvent id="${start}" name="${Start}" />', "start event"],
  ["endEvent", 'endEvent id="${end}" name="${Done}" />', "end event"],
  ["task", 'task id="${task}" name="${Do something}" />', "task"],
  ["userTask", 'userTask id="${task}" name="${Review}" />', "task done by a person"],
  ["serviceTask", 'serviceTask id="${task}" name="${Call API}" />', "automated task"],
  ["sendTask", 'sendTask id="${task}" name="${Send email}" />', "task"],
  ["receiveTask", 'receiveTask id="${task}" name="${Wait for reply}" />', "task"],
  ["exclusiveGateway", 'exclusiveGateway id="${gateway}" name="${Approved?}" />', "XOR gateway"],
  ["parallelGateway", 'parallelGateway id="${fork}" />', "AND gateway"],
  ["inclusiveGateway", 'inclusiveGateway id="${gateway}" />', "OR gateway"],
  ["eventBasedGateway", 'eventBasedGateway id="${gateway}" />', "gateway"],
  ["sequenceFlow", 'sequenceFlow id="${flow}" sourceRef="${from}" targetRef="${to}" />', "arrow between steps"],
  ["subProcess", 'subProcess id="${sub}" name="${Sub-process}">\n  ${}\n</$PsubProcess>', "sub-process"],
  ["boundaryEvent", 'boundaryEvent id="${timeout}" attachedToRef="${task}">\n  <$PtimerEventDefinition />\n</$PboundaryEvent>', "event on a task's edge"],
  ["intermediateCatchEvent", 'intermediateCatchEvent id="${wait}" name="${2 days}">\n  <$PtimerEventDefinition />\n</$PintermediateCatchEvent>', "wait for an event"],
  ["messageEventDefinition", "messageEventDefinition />", "makes an event a message event"],
  ["timerEventDefinition", "timerEventDefinition />", "makes an event a timer event"],
  ["errorEventDefinition", "errorEventDefinition />", "makes an event an error event"],
  ["process", 'process id="${process}" isExecutable="false">\n  ${}\n</$Pprocess>', "process"],
  ["laneSet", 'laneSet id="${lanes}">\n  <$Plane id="${lane}" name="${Role}">\n    <$PflowNodeRef>${task}</$PflowNodeRef>\n  </$Plane>\n</$PlaneSet>', "swimlanes"],
  ["lane", 'lane id="${lane}" name="${Role}">\n  <$PflowNodeRef>${task}</$PflowNodeRef>\n</$Plane>', "swimlane"],
  ["flowNodeRef", "flowNodeRef>${task}</$PflowNodeRef>", "puts a step in a lane"],
  ["collaboration", 'collaboration id="${collab}">\n  ${}\n</$Pcollaboration>', "pools and message flows"],
  ["participant", 'participant id="${pool}" name="${Customer}" processRef="${process}" />', "pool"],
  ["messageFlow", 'messageFlow id="${message}" sourceRef="${from}" targetRef="${to}" />', "message between pools"],
  ["dataObjectReference", 'dataObjectReference id="${doc}" name="${Invoice}" dataObjectRef="${docObject}" />', "document"],
  ["dataStoreReference", 'dataStoreReference id="${db}" name="${Database}" />', "database"],
  ["textAnnotation", 'textAnnotation id="${note}">\n  <$Ptext>${Note}</$Ptext>\n</$PtextAnnotation>', "note"],
  ["association", 'association id="${link}" sourceRef="${note}" targetRef="${task}" />', "links a note"],
];

function bpmnSource(ctx: CompletionContext): CompletionResult | null {
  const tag = ctx.matchBefore(/<\/?[\w:]*/);
  if (!tag || tag.text.startsWith("</")) return null;
  const prefix = ctx.state.doc.toString().match(/<(\w+:)definitions\b/)?.[1] ?? "";
  return {
    from: tag.from + 1,
    options: BPMN_ELEMENTS.map(([name, body, detail]) =>
      snippetCompletion(prefix + body.replaceAll("$P", prefix), { label: prefix + name, detail, type: "keyword" }),
    ),
    validFor: /^[\w:]*$/,
  };
}

const SKETCH_SNIPPETS: Completion[] = [
  snippetCompletion('box ${id} ${40} ${40} ${160} ${80} "${Label}"', { label: "box", detail: "id x y width height", type: "keyword" }),
  snippetCompletion('ellipse ${id} ${40} ${40} ${120} ${70} "${Label}"', { label: "ellipse", detail: "id x y width height", type: "keyword" }),
  snippetCompletion('diamond ${id} ${40} ${40} ${120} ${80} "${Label}"', { label: "diamond", detail: "id x y width height", type: "keyword" }),
  snippetCompletion('text ${id} ${40} ${40} "${Words}"', { label: "text", detail: "id x y", type: "keyword" }),
  snippetCompletion('arrow ${from} -> ${to} "${}"', { label: "arrow", detail: "from -> to", type: "keyword" }),
  snippetCompletion("line ${from} -> ${to}", { label: "line", detail: "from -> to", type: "keyword" }),
];

const SKETCH_OPTIONS = ["fill=", "stroke=", "width=", "size=", "dashed", "round", "bold", "both", "none"].map((label) => ({
  label,
  type: "property",
}));

function sketchSource(ctx: CompletionContext): CompletionResult | null {
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, ctx.pos - line.from);
  const word = ctx.matchBefore(/[\w=-]*/);
  if (!word || (word.from === word.to && !ctx.explicit)) return null;
  if (/^\s*[\w-]*$/.test(before)) return { from: word.from, options: SKETCH_SNIPPETS, validFor: /^\w*$/ };
  // After the first word: option names, or the ids of shapes for arrow ends.
  const ids = [...ctx.state.doc.toString().matchAll(/^\s*(?:box|ellipse|diamond|text)\s+([A-Za-z_][\w-]*)/gm)].map((m) => m[1]);
  const isLink = /^\s*(arrow|line)\b/.test(before);
  return {
    from: word.from,
    options: isLink ? [...ids.map((label) => ({ label, type: "variable" })), ...SKETCH_OPTIONS] : SKETCH_OPTIONS,
    validFor: /^[\w=-]*$/,
  };
}

const ORG_SETTINGS: Completion[] = [
  snippetCompletion('title "${Company}"', { label: "title", detail: "chart title", type: "keyword" }),
  snippetCompletion("direction ${right}", { label: "direction", detail: "down or right", type: "keyword" }),
  { label: "compact", detail: "stack the bottom level", type: "keyword" },
  { label: "counts", detail: "show team sizes", type: "keyword" },
];

function orgSource(ctx: CompletionContext): CompletionResult | null {
  const doc = ctx.state.doc.toString();
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, ctx.pos - line.from);
  // Departments already used, inside [ ].
  const dept = before.match(/\[([^\]]*)$/);
  if (dept) {
    const used = [...new Set([...doc.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim()))];
    return { from: ctx.pos - dept[1].length, options: used.map((label) => ({ label, type: "constant", apply: `${label}]` })), validFor: /^[^\]]*$/ };
  }
  // People's names and ids after "..".
  const dotted = before.match(/\.\.\s+([^"]*)$/);
  if (dotted) {
    const names = [...doc.matchAll(/^\s*\+?\s*([^:#[\n?]+?)\s*(?:#([A-Za-z_][\w-]*))?\s*(?::|$)/gm)]
      .filter((m) => !/^(orgchart|title|direction|compact|counts)\b/.test(m[1]) && !m[1].includes(".."))
      .map((m) => m[2] ?? m[1].trim());
    return { from: ctx.pos - dotted[1].length, options: [...new Set(names)].map((label) => ({ label, type: "variable" })) };
  }
  const word = ctx.matchBefore(/\w*/);
  if (!word || (word.from === word.to && !ctx.explicit)) return null;
  const beforePeople = !/^\s*\+?\s*[^\s:#].*:/m.test(doc.slice(0, line.from));
  if (/^\w*$/.test(before) && beforePeople) return { from: word.from, options: ORG_SETTINGS, validFor: /^\w*$/ };
  return null;
}

const NET_STARTERS: Completion[] = [
  ...DEVICE_KINDS.map((kind) =>
    kind === "internet" || kind === "cloud"
      ? { label: kind, detail: KIND_LABEL[kind], type: "class" }
      : snippetCompletion(`${kind} \${${kind}1} "\${${KIND_LABEL[kind]}}"`, { label: kind, detail: KIND_LABEL[kind], type: "class" }),
  ),
  snippetCompletion('zone ${lan} "${Office LAN}" ${192.168.1.0/24} vlan ${10}', { label: "zone", detail: "subnet, VLAN or site", type: "keyword" }),
];

const NET_SETTINGS: Completion[] = [
  snippetCompletion('title "${Network}"', { label: "title", detail: "diagram title", type: "keyword" }),
  snippetCompletion("direction ${right}", { label: "direction", detail: "down or right", type: "keyword" }),
  snippetCompletion("lines ${square}", { label: "lines", detail: "straight, curved or square", type: "keyword" }),
  snippetCompletion("checks ${off}", { label: "checks", detail: "address checks on or off", type: "keyword" }),
];

const NET_LINKS: Completion[] = [
  { label: "--", detail: "cable", type: "operator" },
  { label: "==", detail: "trunk or fibre", type: "operator" },
  { label: "..", detail: "VPN or tunnel", type: "operator" },
  { label: "~~", detail: "wireless", type: "operator" },
];

function networkSource(ctx: CompletionContext): CompletionResult | null {
  const doc = ctx.state.doc.toString();
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, ctx.pos - line.from);
  const kinds = DEVICE_KINDS.join("|");
  const ids = [...doc.matchAll(new RegExp(`^\\s*(?:${kinds})\\s+([A-Za-z_][\\w-]*)`, "gm"))].map((m) => m[1]);
  for (const k of ["internet", "cloud"]) if (new RegExp(`^\\s*${k}\\b(?!\\s+[A-Za-z_])`, "m").test(doc)) ids.push(k);
  const devices = [...new Set(ids)].map((label) => ({ label, type: "variable" }));

  // After a link operator or a comma: the devices to link to.
  if (/(--|==|\.\.|~~)\s*([\w-]+(:\S*)?\s*,\s*)*[\w-]*$/.test(before)) {
    const word = ctx.matchBefore(/[\w-]*/);
    return word ? { from: word.from, options: devices, validFor: /^[\w-]*$/ } : null;
  }
  // After a device name at the start of a line: the link types.
  const op = before.match(/^\s*[A-Za-z_][\w-]*(:\S*)?\s+([-=.~]*)$/);
  if (op && ids.includes(before.trim().split(/[\s:]/)[0])) {
    return { from: ctx.pos - op[2].length, options: NET_LINKS, validFor: /^[-=.~]*$/ };
  }
  const word = ctx.matchBefore(/\w*/);
  if (!word || (word.from === word.to && !ctx.explicit)) return null;
  if (/^\s*\w*$/.test(before)) {
    const top = /^\w*$/.test(before);
    return { from: word.from, options: [...NET_STARTERS, ...devices, ...(top ? NET_SETTINGS : [])], validFor: /^\w*$/ };
  }
  if (/^\s*(zone|[a-z]+\s+[\w-]+)\b/.test(before)) return { from: word.from, options: [snippetCompletion("vlan ${10}", { label: "vlan", type: "keyword" })], validFor: /^\w*$/ };
  return null;
}

const SQL_STARTERS: Completion[] = [
  snippetCompletion("CREATE TABLE ${name} (\n  id ${int} PRIMARY KEY,\n  ${}\n);", { label: "CREATE TABLE", detail: "table", type: "keyword" }),
  snippetCompletion("ALTER TABLE ${table} ADD FOREIGN KEY (${column}) REFERENCES ${other} (${id});", { label: "ALTER TABLE", detail: "add a foreign key", type: "keyword" }),
  snippetCompletion("-- title: ${Schema}", { label: "-- title:", detail: "diagram title", type: "keyword" }),
  snippetCompletion("-- group: ${Billing}", { label: "-- group:", detail: "tables below go in a box", type: "keyword" }),
  snippetCompletion("-- focus: ${table}", { label: "-- focus:", detail: "show a table and its neighbours", type: "keyword" }),
];

const SQL_COLUMN_WORDS: Completion[] = [
  ...["int", "bigint", "serial", "varchar(255)", "text", "boolean", "date", "timestamp", "numeric(10, 2)", "uuid", "jsonb"].map((label) => ({ label, type: "type" })),
  ...["PRIMARY KEY", "NOT NULL", "UNIQUE", "DEFAULT", "CHECK", "CONSTRAINT"].map((label) => ({ label, type: "keyword" })),
  snippetCompletion("REFERENCES ${table} (${id})", { label: "REFERENCES", detail: "foreign key", type: "keyword" }),
  snippetCompletion("FOREIGN KEY (${column}) REFERENCES ${table} (${id})", { label: "FOREIGN KEY", detail: "table constraint", type: "keyword" }),
];

function sqlSource(ctx: CompletionContext): CompletionResult | null {
  const doc = ctx.state.doc.toString();
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, ctx.pos - line.from);
  const tables = [...new Set([...doc.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([\w."`[\]]+)/gi)].map((m) => m[1].replace(/["`[\]]/g, "")))];
  // After REFERENCES: the tables.
  if (/references\s+[\w.]*$/i.test(before)) {
    const word = ctx.matchBefore(/[\w.]*/);
    return word ? { from: word.from, options: tables.map((label) => ({ label, type: "class" })), validFor: /^[\w.]*$/ } : null;
  }
  const word = ctx.matchBefore(/[-\w]*/);
  if (!word || (word.from === word.to && !ctx.explicit)) return null;
  if (/^\s*[-\w]*$/.test(before) && !/^\s+/.test(before)) return { from: word.from, options: SQL_STARTERS, validFor: /^[-\w]*$/ };
  return { from: word.from, options: SQL_COLUMN_WORDS, validFor: /^\w*$/ };
}

const LOGIC_LINES: Completion[] = [
  snippetCompletion("${F} = ${A·B + C}", { label: "F =", detail: "function from an expression", type: "function" }),
  snippetCompletion("${F}(${A}, ${B}, ${C}) = m(${1, 3, 5})", { label: "m(...)", detail: "function from minterms", type: "function" }),
  snippetCompletion('title "${Title}"', { label: "title", detail: "heading", type: "keyword" }),
  snippetCompletion("vars ${A B C}", { label: "vars", detail: "variables, in order", type: "keyword" }),
  snippetCompletion("show ${table kmap simplified circuit}", { label: "show", detail: "what to draw", type: "keyword" }),
  snippetCompletion("form ${both}", { label: "form", detail: "sop, pos or both", type: "keyword" }),
  snippetCompletion("gates ${iec}", { label: "gates", detail: "ansi or iec symbols", type: "keyword" }),
  snippetCompletion("circuit ${simplified}", { label: "circuit", detail: "written or simplified", type: "keyword" }),
  snippetCompletion("compare ${F} ${G}", { label: "compare", detail: "check two functions match", type: "keyword" }),
];

const LOGIC_SHOW = ["table", "kmap", "simplified", "circuit", "minterms", "all"].map((label) => ({ label, type: "constant" }));

function logicSource(ctx: CompletionContext): CompletionResult | null {
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, ctx.pos - line.from);
  const word = ctx.matchBefore(/\w*/);
  if (!word || (word.from === word.to && !ctx.explicit)) return null;
  if (/^\s*show\b/.test(before)) return { from: word.from, options: LOGIC_SHOW, validFor: /^\w*$/ };
  if (/^\s*\w*$/.test(before)) return { from: word.from, options: LOGIC_LINES, validFor: /^\w*$/ };
  if (/=/.test(before)) {
    const ops = ["and", "or", "not", "xor", "nand", "nor", "xnor"].map((label) => ({ label, type: "keyword" }));
    return { from: word.from, options: ops, validFor: /^\w*$/ };
  }
  return null;
}

const AUTOMATON_LINES: Completion[] = [
  snippetCompletion("${q0} -${a}-> ${q1}", { label: "->", detail: "transition", type: "function" }),
  snippetCompletion("start ${q0}", { label: "start", detail: "start state", type: "keyword" }),
  snippetCompletion("accept ${q1}", { label: "accept", detail: "accepting states", type: "keyword" }),
  snippetCompletion("input ${abba}", { label: "input", detail: "a string to run", type: "keyword" }),
  snippetCompletion('title "${Title}"', { label: "title", detail: "heading", type: "keyword" }),
  snippetCompletion("direction ${down}", { label: "direction", detail: "right or down", type: "keyword" }),
  snippetCompletion("blank ${_}", { label: "blank", detail: "Turing machine blank", type: "keyword" }),
];

function automatonSource(ctx: CompletionContext): CompletionResult | null {
  const doc = ctx.state.doc.toString();
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, ctx.pos - line.from);
  const states = [...new Set([...doc.matchAll(/^\s*(\S+)\s+-.*?->\s*(\S+)/gm)].flatMap((m) => [m[1], m[2]]))].map((label) => ({ label, type: "variable" }));
  const word = ctx.matchBefore(/[\w']*/);
  if (!word || (word.from === word.to && !ctx.explicit)) return null;
  // After -> or on start/accept lines: the states.
  if (/->\s*[\w']*$/.test(before) || /^\s*(start|accept|final)\b/.test(before)) return { from: word.from, options: states, validFor: /^[\w']*$/ };
  if (/^\s*[\w']*$/.test(before)) return { from: word.from, options: [...AUTOMATON_LINES, ...states], validFor: /^[\w']*$/ };
  return null;
}

const WAVE_SNIPPETS: Completion[] = [
  snippetCompletion("{ name: '${clk}', wave: '${p.......}' },", { label: "clock", detail: "clock signal", type: "function" }),
  snippetCompletion("{ name: '${data}', wave: '${x.345x}', data: ['${a}', '${b}', '${c}'] },", { label: "bus", detail: "data bus with labels", type: "function" }),
  snippetCompletion("{ name: '${req}', wave: '${0.1..0}' },", { label: "signal", detail: "a 0/1 signal", type: "function" }),
  snippetCompletion("{},", { label: "gap", detail: "empty row", type: "function" }),
  snippetCompletion("['${Group}',\n  ${}\n],", { label: "group", detail: "a named group of signals", type: "function" }),
  snippetCompletion("head: { text: '${Title}', tick: 0 },", { label: "head", detail: "title and tick numbers", type: "keyword" }),
  snippetCompletion("config: { hscale: ${2} },", { label: "config", detail: "horizontal scale", type: "keyword" }),
  snippetCompletion("edge: ['${a~>b} ${label}'],", { label: "edge", detail: "arrows between nodes", type: "keyword" }),
];

function waveSource(ctx: CompletionContext): CompletionResult | null {
  const word = ctx.matchBefore(/\w*/);
  if (!word || (word.from === word.to && !ctx.explicit)) return null;
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, ctx.pos - line.from);
  // Inside a string (a wave), don't complete.
  if ((before.match(/'/g) ?? []).length % 2 === 1) return null;
  return { from: word.from, options: WAVE_SNIPPETS, validFor: /^\w*$/ };
}

const STRUCTURE_LINES: Completion[] = [
  snippetCompletion("array ${A} = [${3, 1, 4, 1, 5}]", { label: "array", detail: "indexed cells", type: "class" }),
  snippetCompletion("matrix ${M} = [[${1, 0}], [${0, 1}]]", { label: "matrix", detail: "rows of cells", type: "class" }),
  snippetCompletion("stack ${S} = [${1, 2, 3}]", { label: "stack", detail: "last item on top", type: "class" }),
  snippetCompletion("queue ${Q} = [${a, b, c}]", { label: "queue", detail: "front and rear", type: "class" }),
  snippetCompletion("list ${L} = ${3 -> 1 -> 4}", { label: "list", detail: "linked list; <-> for doubly", type: "class" }),
  snippetCompletion("tree ${T} = ${8(3(1, 6), 10(, 14))}", { label: "tree", detail: "value(children)", type: "class" }),
  snippetCompletion("bst ${B} = ${8 3 10 1 6 14}", { label: "bst", detail: "binary search tree by insertion", type: "class" }),
  snippetCompletion("heap ${H} = [${9, 5, 8, 1, 3}]", { label: "heap", detail: "array and tree", type: "class" }),
  snippetCompletion("hash ${H} size ${7} = ${10, 22, 31, 4}", { label: "hash", detail: "hash table with chaining", type: "class" }),
  snippetCompletion("graph ${G} = ${A-B, B-C:4, C-A}", { label: "graph", detail: "undirected, optional weights", type: "class" }),
  snippetCompletion("digraph ${G} = ${A->B, B->C}", { label: "digraph", detail: "directed graph", type: "class" }),
  snippetCompletion('title "${Title}"', { label: "title", detail: "heading", type: "keyword" }),
];

const STRUCTURE_OPTIONS: Completion[] = [
  snippetCompletion("mark ${2}", { label: "mark", detail: "highlight items", type: "keyword" }),
  snippetCompletion("ptr ${i}=${0}", { label: "ptr", detail: "named pointers into an array", type: "keyword" }),
  { label: "circular", detail: "last node links to the first", type: "keyword" },
  snippetCompletion("probe ${linear}", { label: "probe", detail: "linear or quadratic probing", type: "keyword" }),
];

function structuresSource(ctx: CompletionContext): CompletionResult | null {
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, ctx.pos - line.from);
  const word = ctx.matchBefore(/\w*/);
  if (!word || (word.from === word.to && !ctx.explicit)) return null;
  if (/^\s*\w*$/.test(before)) return { from: word.from, options: STRUCTURE_LINES, validFor: /^\w*$/ };
  if (/=/.test(before) && /\s\w*$/.test(before)) return { from: word.from, options: STRUCTURE_OPTIONS, validFor: /^\w*$/ };
  return null;
}

const SOURCES = {
  plantuml: plantumlSource,
  mermaid: mermaidSource,
  graphviz: dotSource,
  echarts: chartSource,
  bpmn: bpmnSource,
  sketch: sketchSource,
  orgchart: orgSource,
  network: networkSource,
  sql: sqlSource,
  logic: logicSource,
  automaton: automatonSource,
  wavedrom: waveSource,
  structures: structuresSource,
} as const;

export function completionSource(engine: Engine) {
  return SOURCES[engine];
}
