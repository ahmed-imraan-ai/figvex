import type { Engine } from "../engines/types";
import { bpmnTemplates } from "./bpmn";
import { chartTemplates } from "./charts";
import { graphvizTemplates } from "./graphviz";
import { mermaidTemplates } from "./mermaid";
import { networkTemplates } from "./network";
import { orgchartTemplates } from "./orgchart";
import { plantumlTemplates } from "./plantuml";
import { sketchTemplates } from "./sketch";
import { sqlTemplates } from "./sql";
import { logicTemplates } from "./logic";
import { cloudTemplates } from "./cloud";
import { advancedUmlTemplates } from "./uml-advanced";
import { automatonTemplates } from "./automaton";
import { wavedromTemplates } from "./wavedrom";
import { structuresTemplates } from "./structures";
import { wireframeTemplates } from "./wireframe";

export interface Template {
  id: string;
  engine: Engine;
  category: string;
  title: string;
  summary: string;
  code: string;
}

export const CATEGORIES = [
  "Start from scratch",
  "UML structure",
  "UML behaviour",
  "Algorithms & theory",
  "Data & databases",
  "Architecture & networks",
  "Planning",
  "Business processes",
  "Organisations",
  "Charts",
] as const;

/** What a new, empty diagram starts with in each language. */
export const BLANK_CODE: Record<Engine, string> = {
  plantuml: "@startuml\n\n@enduml\n",
  mermaid: "flowchart TD\n    A --> B\n",
  graphviz: "digraph G {\n    a -> b\n}\n",
  bpmn: `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="defs" targetNamespace="https://figvex.sudo520.com/bpmn">
  <process id="process" isExecutable="false">
    <startEvent id="start" name="Start" />
    <task id="task" name="Do something" />
    <endEvent id="end" name="Done" />
    <sequenceFlow id="f1" sourceRef="start" targetRef="task" />
    <sequenceFlow id="f2" sourceRef="task" targetRef="end" />
  </process>
</definitions>
`,
  sketch: "sketch\n",
  orgchart: "orgchart\nJane Smith: Chief Executive\n  Ravi Patel: Head of Engineering\n  Mia Chen: Head of Finance\n",
  network: `network
internet
router r1 "Router" 192.168.1.1
zone lan "Office LAN" 192.168.1.0/24
  switch sw1 "Switch" 192.168.1.2
  pc pc1 "PC" 192.168.1.10
internet -- r1
r1 -- sw1
sw1 -- pc1
`,
  sql: "CREATE TABLE customers (\n  id int PRIMARY KEY,\n  name text NOT NULL\n);\n\nCREATE TABLE orders (\n  id int PRIMARY KEY,\n  customer_id int NOT NULL REFERENCES customers (id),\n  placed_at timestamp NOT NULL\n);\n",
  logic: "logic\nF = A·B + C\nshow table kmap simplified\n",
  automaton: "automaton\nstart q0\naccept q1\nq0 -a-> q1\nq1 -b-> q0\ninput aba\n",
  wavedrom: "{ signal: [\n  { name: 'clk', wave: 'p.....' },\n  { name: 'data', wave: 'x.34.x', data: ['a', 'b'] }\n]}\n",
  structures: "structures\narray A = [3, 1, 4, 1, 5]\nlist L = 3 -> 1 -> 4\nbst B = 8 3 10 1 6 14\n",
  wireframe: "wireframe\nscreen home \"Home\" phone\n  header \"My app\"\n  field \"Name\" \"Your name\"\n  button \"Save\" primary\n",
  echarts: '{\n  "xAxis": { "type": "category" },\n  "yAxis": {},\n  "series": [{ "type": "bar" }]\n}\n---\nname,value\nA,3\nB,5\nC,4\n',
};

const blank: Template[] = [
  {
    id: "blank-plantuml",
    engine: "plantuml",
    category: "Start from scratch",
    title: "Blank PlantUML",
    summary: "An empty @startuml block.",
    code: BLANK_CODE.plantuml,
  },
  {
    id: "blank-mermaid",
    engine: "mermaid",
    category: "Start from scratch",
    title: "Blank Mermaid",
    summary: "An empty flowchart.",
    code: BLANK_CODE.mermaid,
  },
  {
    id: "blank-graphviz",
    engine: "graphviz",
    category: "Start from scratch",
    title: "Blank Graphviz",
    summary: "A directed graph with one edge.",
    code: BLANK_CODE.graphviz,
  },
  {
    id: "blank-echarts",
    engine: "echarts",
    category: "Start from scratch",
    title: "Blank chart",
    summary: "A bar chart drawn from three rows of CSV.",
    code: BLANK_CODE.echarts,
  },
  {
    id: "blank-bpmn",
    engine: "bpmn",
    category: "Start from scratch",
    title: "Blank BPMN",
    summary: "A start event, one task and an end event, laid out automatically.",
    code: BLANK_CODE.bpmn,
  },
  {
    id: "blank-sketch",
    engine: "sketch",
    category: "Start from scratch",
    title: "Blank sketch",
    summary: "An empty canvas. Draw with the tools above the diagram.",
    code: BLANK_CODE.sketch,
  },
  {
    id: "blank-orgchart",
    engine: "orgchart",
    category: "Start from scratch",
    title: "Blank org chart",
    summary: "A manager and two reports. Indent a line to put someone under the line above.",
    code: BLANK_CODE.orgchart,
  },
  {
    id: "blank-network",
    engine: "network",
    category: "Start from scratch",
    title: "Blank network",
    summary: "A router, a switch and a PC on one subnet. Indent devices under a zone to put them in it.",
    code: BLANK_CODE.network,
  },
  {
    id: "blank-sql",
    engine: "sql",
    category: "Start from scratch",
    title: "Blank SQL schema",
    summary: "Two tables and a foreign key. Paste your own CREATE TABLE statements to draw them.",
    code: BLANK_CODE.sql,
  },
  {
    id: "blank-logic",
    engine: "logic",
    category: "Start from scratch",
    title: "Blank logic",
    summary: "One boolean function with its truth table, Karnaugh map and simplest form.",
    code: BLANK_CODE.logic,
  },
  {
    id: "blank-automaton",
    engine: "automaton",
    category: "Start from scratch",
    title: "Blank automaton",
    summary: "Two states, two transitions and an input to step through.",
    code: BLANK_CODE.automaton,
  },
  {
    id: "blank-wavedrom",
    engine: "wavedrom",
    category: "Start from scratch",
    title: "Blank timing diagram",
    summary: "A clock and a data bus in WaveJSON.",
    code: BLANK_CODE.wavedrom,
  },
  {
    id: "blank-structures",
    engine: "structures",
    category: "Start from scratch",
    title: "Blank data structures",
    summary: "An array, a linked list and a binary search tree, one per line.",
    code: BLANK_CODE.structures,
  },
  {
    id: "blank-wireframe",
    engine: "wireframe",
    category: "Start from scratch",
    title: "Blank wireframe",
    summary: "One phone screen with a header, a field and a button.",
    code: BLANK_CODE.wireframe,
  },
];

export const TEMPLATES: Template[] = [...blank, ...plantumlTemplates, ...mermaidTemplates, ...graphvizTemplates, ...chartTemplates, ...bpmnTemplates, ...sketchTemplates, ...orgchartTemplates, ...networkTemplates, ...sqlTemplates, ...logicTemplates, ...automatonTemplates, ...wavedromTemplates, ...structuresTemplates, ...cloudTemplates, ...wireframeTemplates, ...advancedUmlTemplates].sort(
  (a, b) => CATEGORIES.indexOf(a.category as never) - CATEGORIES.indexOf(b.category as never),
);

export const WELCOME_CODE = `@startuml
' Welcome to Figvex. Edit this text and the diagram redraws as you type.
' Lines starting with an apostrophe are comments.
' Templates has a worked example of every diagram type.

title Submitting an assignment

actor Student
participant "Course portal" as Portal
database "Grades" as DB

Student -> Portal : upload solution.zip
activate Portal
Portal -> Portal : run autograder
Portal -> DB : store score
DB --> Portal : saved
Portal --> Student : 87 / 100
deactivate Portal
@enduml
`;
