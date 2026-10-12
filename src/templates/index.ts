import type { Engine } from "../engines/types";
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

const blank: Template[] = [
  {
    id: "blank-plantuml",
    engine: "plantuml",
    category: "Start from scratch",
    title: "Blank PlantUML",
    summary: "An empty @startuml block.",
    code: "@startuml\n\n@enduml\n",
  },
  {
    id: "blank-mermaid",
    engine: "mermaid",
    category: "Start from scratch",
    title: "Blank Mermaid",
    summary: "An empty flowchart.",
    code: "flowchart TD\n    A --> B\n",
  },
];

export const TEMPLATES: Template[] = [...blank, ...plantumlTemplates, ...mermaidTemplates].sort(
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
