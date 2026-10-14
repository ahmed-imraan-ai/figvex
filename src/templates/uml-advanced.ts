import type { Template } from "./index";

// UML diagrams that PlantUML has no keyword for, drawn with the parts it
// does have, the way UML textbooks draw them.

export const advancedUmlTemplates: Template[] = [
  {
    id: "uml-communication",
    engine: "plantuml",
    category: "UML behaviour",
    title: "Communication diagram",
    summary: "Objects joined by links, with numbered messages showing the order of a library loan.",
    code: `@startuml
' A communication diagram shows the same messages as a sequence diagram,
' numbered, on the links between the objects that exchange them.
skinparam objectBorderThickness 1.2
left to right direction

object ":Member" as m
object ":LoanDesk" as d
object ":Catalogue" as c
object ":Loan" as l

m -- d : "1: borrow(isbn) →\\n4: ← dueDate"
d -- c : "2: find(isbn) →\\n2.1: ← copy"
d -- l : "3: <<create>> →"
@enduml
`,
  },
  {
    id: "uml-composite",
    engine: "plantuml",
    category: "UML structure",
    title: "Composite structure diagram",
    summary: "A car's parts, their roles and the ports and connectors between them inside the whole.",
    code: `@startuml
' A composite structure diagram shows the parts inside a class, with
' ports on its edge and connectors between parts.
skinparam componentStyle rectangle
left to right direction

component "Car" as car {
  portin "ignition" as ign
  component "e : Engine" as e
  component "t : Transmission" as t
  component "w : Wheel [4]" as w
  portout "speed" as spd
}

ign --> e
e --> t : torque
t --> w : drive
w --> spd
@enduml
`,
  },
  {
    id: "uml-interaction-overview",
    engine: "plantuml",
    category: "UML behaviour",
    title: "Interaction overview diagram",
    summary: "An activity flow whose steps are whole interactions (ref frames), for an online exam.",
    code: `@startuml
' An interaction overview diagram is an activity diagram whose nodes are
' interactions. Each "ref" box stands for a sequence diagram of its own.
start
:<b>ref</b>
Sign in;
if (Signed in?) then (yes)
  :<b>ref</b>
  Choose exam;
  fork
    :<b>ref</b>
    Answer questions;
  fork again
    :<b>ref</b>
    Autosave answers;
  end fork
  :<b>ref</b>
  Submit and mark;
else (no)
  :<b>ref</b>
  Reset password;
endif
stop
@enduml
`,
  },
];
