import type { Template } from "./index";

export const mermaidTemplates: Template[] = [
  {
    id: "mmd-flowchart",
    engine: "mermaid",
    category: "Algorithms & theory",
    title: "Flowchart",
    summary: "Primality test by trial division, with decisions and a loop.",
    code: `---
title: Is n prime?
---
flowchart TD
    start([Start]) --> input[/Read n/]
    input --> small{"n < 2?"}
    small -- yes --> notPrime[[Not prime]]
    small -- no --> init[i = 2]
    init --> check{"i × i ≤ n?"}
    check -- no --> prime[[Prime]]
    check -- yes --> divides{"n mod i = 0?"}
    divides -- yes --> notPrime
    divides -- no --> next[i = i + 1]
    next --> check
    prime --> stop([End])
    notPrime --> stop
`,
  },
  {
    id: "mmd-dfa",
    engine: "mermaid",
    category: "Algorithms & theory",
    title: "Finite automaton",
    summary: "DFA that accepts binary numbers divisible by 3.",
    code: `---
title: Binary numbers divisible by 3
---
stateDiagram-v2
    direction LR
    [*] --> q0
    q0 --> q0 : 0
    q0 --> q1 : 1
    q1 --> q2 : 0
    q1 --> q0 : 1
    q2 --> q1 : 0
    q2 --> q2 : 1
    q0 --> [*] : accept

    note right of q0
        Each state is the
        remainder mod 3
    end note
`,
  },
  {
    id: "mmd-bst",
    engine: "mermaid",
    category: "Algorithms & theory",
    title: "Binary search tree",
    summary: "A BST with the search path for 60 highlighted.",
    code: `---
title: Searching for 60
---
flowchart TB
    n50((50)) --> n30((30))
    n50 --> n70((70))
    n30 --> n20((20))
    n30 --> n40((40))
    n70 --> n60((60))
    n70 --> n80((80))
    n20 --> n10((10))

    classDef path fill:#fde7d9,stroke:#c2410c,stroke-width:2px
    class n50,n70,n60 path
`,
  },
  {
    id: "mmd-dijkstra",
    engine: "mermaid",
    category: "Algorithms & theory",
    title: "Weighted graph",
    summary: "Shortest path from A to F (Dijkstra), with the path's edges highlighted.",
    code: `---
title: Shortest path from A to F
---
flowchart LR
    A((A)) -- 4 --> B((B))
    A -- 2 --> C((C))
    C -- 1 --> B
    B -- 5 --> D((D))
    C -- 8 --> D
    C -- 10 --> E((E))
    D -- 2 --> E
    D -- 6 --> F((F))
    E -- 2 --> F

    linkStyle 1,2,3,6,8 stroke:#c2410c,stroke-width:3px
`,
  },
  {
    id: "mmd-sequence",
    engine: "mermaid",
    category: "Architecture & networks",
    title: "Sequence diagram",
    summary: "TCP three-way handshake, a request, and the four-step teardown.",
    code: `sequenceDiagram
    autonumber
    participant C as Client
    participant S as Server
    Note over C,S: Connection setup
    C->>S: SYN (seq = x)
    S->>C: SYN-ACK (seq = y, ack = x + 1)
    C->>S: ACK (ack = y + 1)
    Note over C,S: Data transfer
    C->>S: GET /index.html
    S-->>C: 200 OK
    Note over C,S: Teardown
    C->>S: FIN
    S-->>C: ACK
    S->>C: FIN
    C-->>S: ACK
`,
  },
  {
    id: "mmd-packet",
    engine: "mermaid",
    category: "Architecture & networks",
    title: "Packet layout",
    summary: "The TCP header from RFC 793, bit by bit.",
    code: `packet-beta
title TCP header (RFC 793)
0-15: "Source port"
16-31: "Destination port"
32-63: "Sequence number"
64-95: "Acknowledgment number"
96-99: "Offset"
100-105: "Reserved"
106-111: "Flags"
112-127: "Window"
128-143: "Checksum"
144-159: "Urgent pointer"
160-191: "Options"
`,
  },
  {
    id: "mmd-class",
    engine: "mermaid",
    category: "UML structure",
    title: "Class diagram",
    summary: "The observer pattern with interfaces and a generic list.",
    code: `---
title: Observer pattern
---
classDiagram
    direction LR
    class Subject {
        <<interface>>
        +attach(o: Observer)
        +detach(o: Observer)
        +notify()
    }
    class Observer {
        <<interface>>
        +update(temp: float)
    }
    class WeatherStation {
        -observers: List~Observer~
        -temperature: float
        +setTemperature(t: float)
    }
    class PhoneDisplay {
        +update(temp: float)
    }
    class WebDashboard {
        +update(temp: float)
    }
    Subject <|.. WeatherStation
    Observer <|.. PhoneDisplay
    Observer <|.. WebDashboard
    WeatherStation o--> "many" Observer : notifies
`,
  },
  {
    id: "mmd-er",
    engine: "mermaid",
    category: "Data & databases",
    title: "ER diagram",
    summary: "An online shop: customers, orders, order lines and products.",
    code: `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ ORDER_LINE : contains
    PRODUCT ||--o{ ORDER_LINE : "appears in"
    CATEGORY ||--o{ PRODUCT : groups
    CUSTOMER {
        int id PK
        string email UK
        string name
    }
    ORDER {
        int id PK
        int customer_id FK
        date placed_on
        string status
    }
    ORDER_LINE {
        int order_id FK
        int product_id FK
        int quantity
        decimal unit_price
    }
    PRODUCT {
        int id PK
        string name
        decimal price
        int category_id FK
    }
    CATEGORY {
        int id PK
        string name
    }
`,
  },
  {
    id: "mmd-gantt",
    engine: "mermaid",
    category: "Planning",
    title: "Gantt chart",
    summary: "A two-week sprint with dependencies, a milestone and a critical task.",
    code: `gantt
    title Sprint 4
    dateFormat YYYY-MM-DD
    excludes weekends
    section Backend
    Design API endpoints     :done,      api,    2026-03-02, 2d
    Implement endpoints      :active,    impl,   after api, 4d
    Integration tests        :           tests,  after impl, 2d
    section Frontend
    Build forms              :           forms,  2026-03-04, 4d
    Connect to API           :           wire,   after impl, 2d
    section Release
    Code freeze              :milestone, freeze, 2026-03-12, 0d
    Demo                     :crit,      demo,   2026-03-13, 1d
`,
  },
  {
    id: "mmd-git",
    engine: "mermaid",
    category: "Planning",
    title: "Git graph",
    summary: "A feature branch and a hotfix merged back into main.",
    code: `gitGraph
    commit id: "init"
    commit id: "readme"
    branch feature/login
    checkout feature/login
    commit id: "login form"
    commit id: "validate input"
    checkout main
    branch hotfix
    commit id: "fix typo"
    checkout main
    merge hotfix tag: "v1.0.1"
    merge feature/login
    commit id: "release" type: HIGHLIGHT tag: "v1.1.0"
`,
  },
  {
    id: "mmd-mindmap",
    engine: "mermaid",
    category: "Planning",
    title: "Mind map",
    summary: "Operating systems topics for exam revision.",
    code: `mindmap
  root((Operating systems))
    Processes
      Scheduling
        Round robin
        Priority
      IPC
    Memory
      Paging
      Virtual memory
      Segmentation
    Storage
      File systems
      I/O scheduling
    Concurrency
      Locks
      Semaphores
      Deadlock
`,
  },
  {
    id: "mmd-timeline",
    engine: "mermaid",
    category: "Planning",
    title: "Timeline",
    summary: "A short history of programming languages by decade.",
    code: `timeline
    title A short history of programming languages
    1950s : Fortran : Lisp : COBOL
    1970s : C : Smalltalk : SQL
    1990s : Python : Java : JavaScript
    2010s : Rust : Kotlin : TypeScript : Swift
`,
  },
  {
    id: "mmd-kanban",
    engine: "mermaid",
    category: "Planning",
    title: "Kanban board",
    summary: "Coursework tracked across to do, in progress and done.",
    code: `kanban
  todo[To do]
    t1[Read chapter 5]
    t2[Problem set 3]
  doing[In progress]
    t3[Lab report]
  done[Done]
    t4[Quiz 2]
    t5[Group project proposal]
`,
  },
  {
    id: "mmd-journey",
    engine: "mermaid",
    category: "UML behaviour",
    title: "User journey",
    summary: "Registering for next semester's classes, scored by satisfaction.",
    code: `journey
    title Registering for next semester
    section Before registration
      Check degree requirements: 3: Student
      Meet advisor: 4: Student, Advisor
    section Registration day
      Log in at 8 am: 2: Student
      Popular class is full: 1: Student
      Join the wait-list: 2: Student
    section Afterwards
      Get a seat from the wait-list: 5: Student
`,
  },
  {
    id: "mmd-pie",
    engine: "mermaid",
    category: "Charts",
    title: "Pie chart",
    summary: "Hours spent on a group project, with values shown.",
    code: `pie showData
    title Hours spent on the group project
    "Coding" : 14
    "Debugging" : 9
    "Meetings" : 4
    "Writing the report" : 6
    "Arguing about tabs vs spaces" : 1
`,
  },
  {
    id: "mmd-xychart",
    engine: "mermaid",
    category: "Charts",
    title: "Line chart",
    summary: "n² against n log n for inputs up to 32.",
    code: `xychart-beta
    title "Work done for input size n"
    x-axis "n" [4, 8, 12, 16, 20, 24, 28, 32]
    y-axis "operations" 0 --> 1100
    line [16, 64, 144, 256, 400, 576, 784, 1024]
    line [8, 24, 43, 64, 86, 110, 135, 160]
`,
  },
  {
    id: "mmd-quadrant",
    engine: "mermaid",
    category: "Charts",
    title: "Quadrant chart",
    summary: "Sorting algorithms placed by speed and memory use.",
    code: `quadrantChart
    title Sorting algorithms on large inputs
    x-axis Slow --> Fast
    y-axis Low memory --> High memory
    quadrant-1 Fast but hungry
    quadrant-2 Avoid
    quadrant-3 Simple and lean
    quadrant-4 Sweet spot
    Bubble sort: [0.1, 0.1]
    Insertion sort: [0.22, 0.12]
    Merge sort: [0.75, 0.7]
    Quicksort: [0.85, 0.3]
    Heapsort: [0.7, 0.12]
    Counting sort: [0.92, 0.85]
`,
  },
  {
    id: "mmd-sankey",
    engine: "mermaid",
    category: "Charts",
    title: "Sankey diagram",
    summary: "A monthly student budget, from income to spending.",
    code: `sankey-beta
Part-time job,Income,700
Scholarship,Income,450
Income,Rent,600
Income,Food,300
Income,Books,80
Income,Transport,60
Income,Savings,110
Food,Groceries,220
Food,Eating out,80
`,
  },
];
