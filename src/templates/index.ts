import type { Engine } from "../engines/types";
import { bpmnTemplates } from "./bpmn";
import { chartTemplates } from "./charts";
import { graphvizTemplates } from "./graphviz";
import { mermaidTemplates } from "./mermaid";
import { orgchartTemplates } from "./orgchart";
import { plantumlTemplates } from "./plantuml";
import { sketchTemplates } from "./sketch";

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
];

export const TEMPLATES: Template[] = [...blank, ...plantumlTemplates, ...mermaidTemplates, ...graphvizTemplates, ...chartTemplates, ...bpmnTemplates, ...sketchTemplates, ...orgchartTemplates].sort(
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
