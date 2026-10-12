import type { Template } from "./index";

export const plantumlTemplates: Template[] = [
  {
    id: "puml-class",
    engine: "plantuml",
    category: "UML structure",
    title: "Class diagram",
    summary: "Library system with inheritance, composition, an enum and an interface.",
    code: `@startuml
title Library management system

abstract class Person {
  - name : String
  - email : String
  + getName() : String
}

class Member {
  - memberId : int
  - joined : Date
  + borrow(copy : BookCopy) : Loan
  + giveBack(loan : Loan) : void
}

class Librarian {
  - staffId : int
  + addBook(book : Book) : void
}

class Book {
  - isbn : String
  - title : String
  - author : String
}

class BookCopy {
  - barcode : String
  - status : CopyStatus
}

class Loan {
  - borrowedOn : Date
  - dueOn : Date
  + isOverdue() : boolean
}

enum CopyStatus {
  AVAILABLE
  ON_LOAN
  LOST
}

interface Searchable {
  + search(query : String) : List<Book>
}

class Catalogue

Person <|-- Member
Person <|-- Librarian
Book "1" *-- "1..*" BookCopy : has
Member "1" -- "0..*" Loan : takes out
Loan "0..*" --> "1" BookCopy : for
BookCopy ..> CopyStatus
Catalogue ..|> Searchable
Catalogue o-- "0..*" Book
@enduml
`,
  },
  {
    id: "puml-object",
    engine: "plantuml",
    category: "Algorithms & theory",
    title: "Object diagram",
    summary: "A singly linked list holding 3, 7 and 12, shown as objects.",
    code: `@startuml
title Singly linked list: 3 → 7 → 12

object list {
  head = node1
  size = 3
}
object node1 {
  value = 3
}
object node2 {
  value = 7
}
object node3 {
  value = 12
}
object "null" as nil

list --> node1 : head
node1 --> node2 : next
node2 --> node3 : next
node3 --> nil : next
@enduml
`,
  },
  {
    id: "puml-sequence",
    engine: "plantuml",
    category: "UML behaviour",
    title: "Sequence diagram",
    summary: "Logging in with a JSON Web Token, with an alt block for a wrong password.",
    code: `@startuml
title Logging in with a JSON Web Token
autonumber

actor Student
participant "Web app" as App
participant "Auth API" as Auth
database "Users" as DB

Student -> App : enter email + password
activate App
App -> Auth : POST /login
activate Auth
Auth -> DB : find user by email
DB --> Auth : user record

alt password matches
  Auth -> Auth : sign JWT (expires in 1 h)
  Auth --> App : 200 OK + token
  App --> Student : show dashboard
else wrong password
  Auth --> App : 401 Unauthorized
  App --> Student : "Email or password is incorrect"
end
deactivate Auth
deactivate App

note over App, Auth
  The token is sent in the
  Authorization header on
  every later request.
end note
@enduml
`,
  },
  {
    id: "puml-usecase",
    engine: "plantuml",
    category: "UML behaviour",
    title: "Use case diagram",
    summary: "Online course platform with actors, a system boundary, include and extend.",
    code: `@startuml
title Online course platform
left to right direction

actor Student
actor Instructor
actor "Payment provider" as Pay <<system>>

rectangle "Course platform" {
  usecase "Browse courses" as Browse
  usecase "Enroll in course" as Enroll
  usecase "Pay course fee" as PayFee
  usecase "Apply discount code" as Discount
  usecase "Submit assignment" as Submit
  usecase "Grade submission" as Grade
  usecase "Publish course" as Publish
}

Student --> Browse
Student --> Enroll
Student --> Submit
Enroll .> PayFee : <<include>>
Discount .> PayFee : <<extend>>
PayFee --> Pay
Instructor --> Grade
Instructor --> Publish
@enduml
`,
  },
  {
    id: "puml-activity",
    engine: "plantuml",
    category: "Algorithms & theory",
    title: "Activity diagram",
    summary: "Binary search over a sorted array, with a loop and three-way branch.",
    code: `@startuml
title Binary search

start
:low = 0
high = n - 1;
while (low <= high?) is (yes)
  :mid = (low + high) / 2;
  if (a[mid] == target?) then (yes)
    :return mid;
    stop
  elseif (a[mid] < target?) then (yes)
    :low = mid + 1;
  else (no)
    :high = mid - 1;
  endif
endwhile (no)
:return -1;
stop
@enduml
`,
  },
  {
    id: "puml-swimlanes",
    engine: "plantuml",
    category: "UML behaviour",
    title: "Activity with swimlanes",
    summary: "Pull request review split across author, CI and reviewer lanes.",
    code: `@startuml
title Pull request review

|Author|
start
:Push branch;
:Open pull request;
|CI|
:Run tests and linter;
if (Checks pass?) then (yes)
  |Reviewer|
  :Review changes;
  if (Changes requested?) then (yes)
    |Author|
    :Address comments;
    :Push fixes;
    detach
  else (no)
    :Approve;
  endif
else (no)
  |Author|
  :Fix failing checks;
  detach
endif
|Reviewer|
:Merge into main;
stop
@enduml
`,
  },
  {
    id: "puml-state",
    engine: "plantuml",
    category: "UML behaviour",
    title: "State machine",
    summary: "Simplified TCP connection lifecycle from CLOSED to ESTABLISHED and back.",
    code: `@startuml
title TCP connection (simplified)
hide empty description

[*] --> CLOSED
CLOSED --> LISTEN : passive open
CLOSED --> SYN_SENT : active open / send SYN
LISTEN --> SYN_RECEIVED : receive SYN / send SYN+ACK
SYN_SENT --> ESTABLISHED : receive SYN+ACK / send ACK
SYN_RECEIVED --> ESTABLISHED : receive ACK
ESTABLISHED --> FIN_WAIT_1 : close / send FIN
ESTABLISHED --> CLOSE_WAIT : receive FIN / send ACK
FIN_WAIT_1 --> FIN_WAIT_2 : receive ACK
FIN_WAIT_2 --> TIME_WAIT : receive FIN / send ACK
CLOSE_WAIT --> LAST_ACK : close / send FIN
LAST_ACK --> CLOSED : receive ACK
TIME_WAIT --> CLOSED : timeout (2 MSL)

state ESTABLISHED #E3F1E6
@enduml
`,
  },
  {
    id: "puml-timing",
    engine: "plantuml",
    category: "UML behaviour",
    title: "Timing diagram",
    summary: "Clock, enable line and data bus while a device sends one byte.",
    code: `@startuml
title Sending a byte over a serial bus
scale 10 as 50 pixels

clock "Clock" as clk with period 10
binary "Enable" as EN
concise "Data" as D
robust "Device" as DEV

@0
EN is low
D is Idle
DEV is Sleeping

@10
EN is high
DEV is Waking

@20
D is "0xA5"
DEV is Sending

@60
D is Idle
EN is low
DEV is Sleeping
@enduml
`,
  },
  {
    id: "puml-component",
    engine: "plantuml",
    category: "Architecture & networks",
    title: "Component diagram",
    summary: "Three-tier web application with an API, a job queue and a database.",
    code: `@startuml
title Three-tier web application

package "Browser" {
  [Single-page app] as SPA
}

node "Application server" {
  [REST API] as API
  [Auth service] as Auth
  [Job worker] as Worker
}

database "PostgreSQL" as DB
queue "Job queue" as Q
cloud "Email service" as Mail

SPA --> API : HTTPS / JSON
API --> Auth : verify token
API --> DB : SQL
API --> Q : enqueue
Q --> Worker
Worker --> Mail : send
Worker --> DB
@enduml
`,
  },
  {
    id: "puml-deployment",
    engine: "plantuml",
    category: "Architecture & networks",
    title: "Deployment diagram",
    summary: "Containers on a single server: nginx, an API and PostgreSQL.",
    code: `@startuml
title Deployment with Docker Compose

actor User

node "Developer laptop" as Laptop {
  artifact "docker-compose.yml"
}

node "VPS (Ubuntu 24.04)" as VPS {
  node "nginx container" as Nginx
  node "app container" as App {
    component "Node.js API"
  }
  node "db container" as Db {
    database "PostgreSQL 16"
  }
}

User --> Nginx : HTTPS :443
Nginx --> App : HTTP :3000
App --> Db : TCP :5432
Laptop ..> VPS : docker compose up
@enduml
`,
  },
  {
    id: "puml-c4",
    engine: "plantuml",
    category: "Architecture & networks",
    title: "C4 context diagram",
    summary: "System context for a campus app, using the C4 standard library.",
    code: `@startuml
!include <C4/C4_Context>

title System context: campus app

Person(student, "Student", "Checks timetable, grades and announcements")
Person(lecturer, "Lecturer", "Posts grades and announcements")
System(app, "Campus app", "Web and mobile app")
System_Ext(sis, "Student information system", "Source of enrolments and grades")
System_Ext(sso, "University SSO", "Single sign-on")
System_Ext(push, "Push notification service")

Rel(student, app, "Uses")
Rel(lecturer, app, "Uses")
Rel(app, sis, "Reads timetables and grades", "REST")
Rel(app, sso, "Signs users in", "OIDC")
Rel(app, push, "Sends notifications")

SHOW_LEGEND()
@enduml
`,
  },
  {
    id: "puml-er",
    engine: "plantuml",
    category: "Data & databases",
    title: "ER diagram",
    summary: "University database in crow's foot notation with keys and types.",
    code: `@startuml
title University database
hide circle
skinparam linetype ortho

entity Student {
  * student_id : INT <<PK>>
  --
  * name : VARCHAR(100)
  * email : VARCHAR(255)
  enrolled_on : DATE
}

entity Course {
  * course_code : CHAR(7) <<PK>>
  --
  * title : VARCHAR(200)
  * credits : SMALLINT
  department_id : INT <<FK>>
}

entity Enrollment {
  * student_id : INT <<FK>>
  * course_code : CHAR(7) <<FK>>
  --
  term : CHAR(6)
  grade : CHAR(2)
}

entity Department {
  * department_id : INT <<PK>>
  --
  * name : VARCHAR(100)
}

entity Instructor {
  * instructor_id : INT <<PK>>
  --
  * name : VARCHAR(100)
  department_id : INT <<FK>>
}

Student ||--o{ Enrollment
Course ||--o{ Enrollment
Department ||--|{ Course : offers
Department ||--o{ Instructor : employs
Instructor }o--o{ Course : teaches
@enduml
`,
  },
  {
    id: "puml-json",
    engine: "plantuml",
    category: "Data & databases",
    title: "JSON data",
    summary: "An API response drawn as nested tables, with one value highlighted.",
    code: `@startjson
#highlight "data" / "0" / "grade"
{
  "status": "ok",
  "data": [
    { "course": "CS101", "grade": "A", "credits": 4 },
    { "course": "MATH201", "grade": "B+", "credits": 3 }
  ],
  "gpa": 3.65,
  "honours": false,
  "advisor": null
}
@endjson
`,
  },
  {
    id: "puml-yaml",
    engine: "plantuml",
    category: "Data & databases",
    title: "YAML data",
    summary: "A GitHub Actions workflow file, drawn as a tree.",
    code: `@startyaml
name: tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test
@endyaml
`,
  },
  {
    id: "puml-ebnf",
    engine: "plantuml",
    category: "Algorithms & theory",
    title: "EBNF grammar",
    summary: "Railroad diagrams for an arithmetic expression grammar.",
    code: `@startebnf
title Arithmetic expressions
expression = term, { ("+" | "-"), term };
term = factor, { ("*" | "/"), factor };
factor = number | "(", expression, ")";
number = digit, { digit };
digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
@endebnf
`,
  },
  {
    id: "puml-regex",
    engine: "plantuml",
    category: "Algorithms & theory",
    title: "Regular expression",
    summary: "A student ID pattern such as S2026-04813, drawn as a railroad.",
    code: `@startregex
^S\\d{4}-\\d{5}$
@endregex
`,
  },
  {
    id: "puml-gantt",
    engine: "plantuml",
    category: "Planning",
    title: "Gantt chart",
    summary: "A semester-long capstone plan with dependencies and milestones.",
    code: `@startgantt
title Capstone project, spring semester
printscale weekly
Project starts 2026-01-12
saturday are closed
sunday are closed

-- Planning --
[Proposal] as [P] lasts 5 days
[Requirements] lasts 8 days
[Requirements] starts at [P]'s end

-- Build --
[Prototype] lasts 15 days
[Prototype] starts at [Requirements]'s end
[Testing] lasts 10 days
[Testing] starts at [Prototype]'s end
[Midterm demo] happens at [Prototype]'s end

-- Wrap-up --
[Report] lasts 8 days
[Report] starts at [Testing]'s end
[Final presentation] happens at [Report]'s end
@endgantt
`,
  },
  {
    id: "puml-mindmap",
    engine: "plantuml",
    category: "Planning",
    title: "Mind map",
    summary: "Data structures grouped by family, branching both ways.",
    code: `@startmindmap
* Data structures
** Linear
*** Array
*** Linked list
*** Stack
*** Queue
** Trees
*** Binary search tree
*** Heap
*** Trie
*** B-tree
left side
** Hashing
*** Hash table
*** Bloom filter
** Graphs
*** Adjacency list
*** Adjacency matrix
@endmindmap
`,
  },
  {
    id: "puml-wbs",
    engine: "plantuml",
    category: "Planning",
    title: "Work breakdown",
    summary: "A capstone project broken into phases and deliverables.",
    code: `@startwbs
* Mobile app capstone
** Research
*** User interviews
*** Competitor review
** Design
*** Wireframes
*** Database schema
** Development
*** Backend API
*** Mobile client
*** CI pipeline
** Delivery
*** Testing
*** Final report
*** Demo day
@endwbs
`,
  },
];
