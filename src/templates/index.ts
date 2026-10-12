import type { Engine } from "../engines/types";
import { chartTemplates } from "./charts";
import { graphvizTemplates } from "./graphviz";
import { mermaidTemplates } from "./mermaid";
import { plantumlTemplates } from "./plantuml";

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
  "Charts",
] as const;

/** What a new, empty diagram starts with in each language. */
export const BLANK_CODE: Record<Engine, string> = {
  plantuml: "@startuml\n\n@enduml\n",
  mermaid: "flowchart TD\n    A --> B\n",
  graphviz: "digraph G {\n    a -> b\n}\n",
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
];

export const TEMPLATES: Template[] = [...blank, ...plantumlTemplates, ...mermaidTemplates, ...graphvizTemplates, ...chartTemplates].sort(
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
