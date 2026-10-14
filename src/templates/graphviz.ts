import type { Template } from "./index";

export const graphvizTemplates: Template[] = [
  {
    id: "gv-bst",
    engine: "graphviz",
    category: "Algorithms & theory",
    title: "Binary search tree",
    summary: "Keys inserted in the order 50, 30, 70, 20, 40, 60, 80, 35.",
    code: `// Binary search tree after inserting 50, 30, 70, 20, 40, 60, 80, 35
digraph BST {
    node [shape=circle, fixedsize=true, width=0.5]

    50 -> 30
    50 -> 70
    30 -> 20
    30 -> 40
    70 -> 60
    70 -> 80
    40 -> 35

    // An invisible node keeps 35 on the left of 40.
    r40 [style=invis, label=""]
    40 -> r40 [style=invis]
}
`,
  },
  {
    id: "gv-dijkstra",
    engine: "graphviz",
    category: "Algorithms & theory",
    title: "Weighted graph",
    summary: "Shortest paths from A with Dijkstra's algorithm; the tree edges are bold.",
    code: `// Shortest-path tree from A, found with Dijkstra's algorithm.
// Each node shows its final distance from A.
digraph Dijkstra {
    rankdir=LR
    node [shape=circle, width=0.6, fixedsize=true]
    edge [arrowsize=0.7]

    A [xlabel="0"]
    B [xlabel="3"]
    C [xlabel="1"]
    D [xlabel="4"]
    E [xlabel="7"]

    A -> B [label=4]
    A -> C [label=1, penwidth=2.5]
    C -> B [label=2, penwidth=2.5]
    B -> D [label=1, penwidth=2.5]
    C -> D [label=5]
    D -> E [label=3, penwidth=2.5]
    B -> E [label=6]
}
`,
  },
  {
    id: "gv-nfa",
    engine: "graphviz",
    category: "Algorithms & theory",
    title: "NFA",
    summary: "Non-deterministic automaton for strings over {a, b} that end in ab.",
    code: `// NFA for strings over {a, b} that end in "ab"
digraph NFA {
    rankdir=LR
    node [shape=circle]
    start [shape=point]
    q2 [shape=doublecircle]

    start -> q0
    q0 -> q0 [label="a, b"]
    q0 -> q1 [label="a"]
    q1 -> q2 [label="b"]
}
`,
  },
  {
    id: "gv-linked-list",
    engine: "graphviz",
    category: "Algorithms & theory",
    title: "Doubly linked list",
    summary: "Record nodes with prev and next pointers, plus head and tail.",
    code: `// Doubly linked list holding 12, 7 and 31
digraph List {
    rankdir=LR
    node [shape=record]

    head [shape=plaintext]
    tail [shape=plaintext]
    n1 [label="<prev> | 12 | <next>"]
    n2 [label="<prev> | 7 | <next>"]
    n3 [label="<prev> | 31 | <next>"]
    null1 [shape=plaintext, label="null"]
    null2 [shape=plaintext, label="null"]

    head -> n1
    n1:next:c -> n2 [tailclip=false]
    n2:prev:c -> n1 [tailclip=false]
    n2:next:c -> n3 [tailclip=false]
    n3:prev:c -> n2 [tailclip=false]
    n3:next:c -> null2 [tailclip=false]
    n1:prev:c -> null1 [tailclip=false, constraint=false]
    tail -> n3
}
`,
  },
  {
    id: "gv-hash-table",
    engine: "graphviz",
    category: "Data & databases",
    title: "Hash table",
    summary: "Separate chaining with five buckets and h(k) = k mod 5.",
    code: `// Hash table with separate chaining, h(k) = k mod 5
digraph HashTable {
    rankdir=LR
    node [shape=record, height=0.4]

    table [label="<0> 0 | <1> 1 | <2> 2 | <3> 3 | <4> 4", width=0.6]

    k10 [label="{ 10 | <next> }"]
    k25 [label="{ 25 | <next> }"]
    k6  [label="{ 6 | <next> }"]
    k12 [label="{ 12 | <next> }"]
    k22 [label="{ 22 | <next> }"]
    k19 [label="{ 19 | <next> }"]

    table:0 -> k10
    k10:next:c -> k25 [tailclip=false]
    table:1 -> k6
    table:2 -> k12
    k12:next:c -> k22 [tailclip=false]
    table:4 -> k19
}
`,
  },
  {
    id: "gv-modules",
    engine: "graphviz",
    category: "Architecture & networks",
    title: "Module dependencies",
    summary: "Packages of a web app grouped into layers with clusters.",
    code: `// Which module imports which, grouped by layer
digraph Modules {
    rankdir=TB
    compound=true
    node [shape=box, style=rounded]

    subgraph cluster_web {
        label="web"
        routes
        views
    }
    subgraph cluster_core {
        label="core"
        orders
        payments
        users
    }
    subgraph cluster_data {
        label="data"
        repository
        cache
    }

    routes -> views
    routes -> orders
    routes -> users
    orders -> payments
    orders -> repository
    payments -> repository
    users -> repository
    users -> cache
}
`,
  },
  {
    id: "gv-network",
    engine: "graphviz",
    category: "Architecture & networks",
    title: "Network topology",
    summary: "Small office network drawn with the neato spring layout.",
    code: `// Small office network. layout=neato places nodes like springs.
graph Office {
    layout=neato
    overlap=false
    splines=true
    node [shape=box, style=rounded]

    internet [shape=ellipse, label="Internet"]
    router [label="Router\\n192.168.1.1"]
    switch [label="Switch"]
    ap [label="Wi-Fi AP"]
    server [label="File server\\n192.168.1.10"]
    pc1 [label="PC 1"]
    pc2 [label="PC 2"]
    laptop [label="Laptop"]
    phone [label="Phone"]

    internet -- router
    router -- switch
    switch -- server
    switch -- pc1
    switch -- pc2
    switch -- ap
    ap -- laptop [style=dashed]
    ap -- phone [style=dashed]
}
`,
  },
  {
    id: "gv-dfd-level1",
    engine: "graphviz",
    category: "Data & databases",
    title: "Data flow diagram, level 1",
    summary: "The library system split into five processes and three data stores, in Yourdon and DeMarco notation.",
    code: `// Level 1 data flow diagram of a library system (Yourdon and DeMarco).
// Circles are processes, open boxes are data stores, squares are
// external entities and arrows are data flows. The flows to and from
// the entities match the context diagram (level 0).
digraph Level1 {
    rankdir=LR
    nodesep=0.5
    ranksep=0.9
    node [fontsize=12]
    edge [fontsize=10, arrowsize=0.7]

    // External entities
    node [shape=box, width=1.3, height=0.6]
    member [label="Member"]
    librarian [label="Librarian"]
    email [label="Email service"]

    // Processes, numbered
    node [shape=circle, width=1.15, fixedsize=true]
    p1 [label="1\\nRegister\\nmember"]
    p2 [label="2\\nManage\\ncatalogue"]
    p3 [label="3\\nIssue\\nloan"]
    p4 [label="4\\nReturn\\nbook"]
    p5 [label="5\\nSend\\nreminders"]

    // Data stores: two lines, with the store's number in its own cell
    node [shape=plain, fixedsize=false, width=0, height=0]
    d1 [label=<<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" CELLPADDING="6"><TR><TD SIDES="TBR">D1</TD><TD SIDES="TB">Members</TD></TR></TABLE>>]
    d2 [label=<<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" CELLPADDING="6"><TR><TD SIDES="TBR">D2</TD><TD SIDES="TB">Books</TD></TR></TABLE>>]
    d3 [label=<<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" CELLPADDING="6"><TR><TD SIDES="TBR">D3</TD><TD SIDES="TB">Loans</TD></TR></TABLE>>]

    // Columns: entities, then processes, then data stores
    { rank=same; member librarian email }
    { rank=same; p1 p2 p3 p4 p5 }
    { rank=same; d1 d2 d3 }

    member -> p1 [label="membership details"]
    p1 -> d1 [label="member record"]

    librarian -> p2 [label="new book details"]
    p2 -> d2 [label="book record"]
    member -> p2 [label="search terms"]
    d2 -> p2 [label="book details"]
    p2 -> member [label="search results"]

    member -> p3 [label="book and card"]
    d1 -> p3 [label="member status"]
    d3 -> p3 [label="current loans"]
    p3 -> d3 [label="new loan"]
    p3 -> member [label="due date"]

    member -> p4 [label="returned book"]
    p4 -> d3 [label="loan closed"]

    d3 -> p5 [label="overdue loans"]
    d1 -> p5 [label="contact details"]
    p5 -> email [label="reminder"]
    p5 -> librarian [label="overdue report"]
}
`,
  },
  {
    id: "gv-dfd-level1-gane-sarson",
    engine: "graphviz",
    category: "Data & databases",
    title: "Data flow diagram, Gane and Sarson",
    summary: "The same level 1 diagram in Gane and Sarson notation: rounded processes and stores open at one end.",
    code: `// Level 1 data flow diagram of a library system (Gane and Sarson).
// Rounded boxes are processes, with the number on top. Data stores are
// open on the right, and external entities have a thick border.
digraph GaneSarson {
    rankdir=LR
    nodesep=0.5
    ranksep=0.9
    node [fontsize=12]
    edge [fontsize=10, arrowsize=0.7]

    // External entities
    node [shape=box, penwidth=2, width=1.3, height=0.6]
    member [label="Member"]
    librarian [label="Librarian"]
    email [label="Email service"]

    // Processes: number, then what the process does
    node [shape=plain, penwidth=1, width=0, height=0]
    p1 [label=<<TABLE STYLE="rounded" BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="5"><TR><TD BORDER="1" SIDES="B">1</TD></TR><TR><TD>Register<BR/>member</TD></TR></TABLE>>]
    p2 [label=<<TABLE STYLE="rounded" BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="5"><TR><TD BORDER="1" SIDES="B">2</TD></TR><TR><TD>Manage<BR/>catalogue</TD></TR></TABLE>>]
    p3 [label=<<TABLE STYLE="rounded" BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="5"><TR><TD BORDER="1" SIDES="B">3</TD></TR><TR><TD>Issue<BR/>loan</TD></TR></TABLE>>]
    p4 [label=<<TABLE STYLE="rounded" BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="5"><TR><TD BORDER="1" SIDES="B">4</TD></TR><TR><TD>Return<BR/>book</TD></TR></TABLE>>]
    p5 [label=<<TABLE STYLE="rounded" BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="5"><TR><TD BORDER="1" SIDES="B">5</TD></TR><TR><TD>Send<BR/>reminders</TD></TR></TABLE>>]

    // Data stores: number cell, then a box open on the right
    d1 [label=<<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" CELLPADDING="6"><TR><TD SIDES="TBLR">D1</TD><TD SIDES="TB">Members</TD></TR></TABLE>>]
    d2 [label=<<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" CELLPADDING="6"><TR><TD SIDES="TBLR">D2</TD><TD SIDES="TB">Books</TD></TR></TABLE>>]
    d3 [label=<<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" CELLPADDING="6"><TR><TD SIDES="TBLR">D3</TD><TD SIDES="TB">Loans</TD></TR></TABLE>>]

    // Columns: entities, then processes, then data stores
    { rank=same; member librarian email }
    { rank=same; p1 p2 p3 p4 p5 }
    { rank=same; d1 d2 d3 }

    member -> p1 [label="membership details"]
    p1 -> d1 [label="member record"]

    librarian -> p2 [label="new book details"]
    p2 -> d2 [label="book record"]
    member -> p2 [label="search terms"]
    d2 -> p2 [label="book details"]
    p2 -> member [label="search results"]

    member -> p3 [label="book and card"]
    d1 -> p3 [label="member status"]
    d3 -> p3 [label="current loans"]
    p3 -> d3 [label="new loan"]
    p3 -> member [label="due date"]

    member -> p4 [label="returned book"]
    p4 -> d3 [label="loan closed"]

    d3 -> p5 [label="overdue loans"]
    d1 -> p5 [label="contact details"]
    p5 -> email [label="reminder"]
    p5 -> librarian [label="overdue report"]
}
`,
  },
  {
    id: "gv-dfd-level2",
    engine: "graphviz",
    category: "Data & databases",
    title: "Data flow diagram, level 2",
    summary: "Process 3, Issue loan, split into sub-processes 3.1 to 3.3, with the same flows in and out as in level 1.",
    code: `// Level 2 data flow diagram: process 3 (Issue loan) from level 1,
// broken into smaller steps. The flows crossing the dashed boundary are
// the same as the flows to and from process 3 in level 1.
digraph Level2 {
    nodesep=0.9
    ranksep=0.7
    node [fontsize=12]
    edge [fontsize=10, arrowsize=0.7]

    // The entity on top, the sub-processes in a row, the stores below
    member [shape=box, width=1.3, height=0.6, label="Member"]

    subgraph cluster_p3 {
        label="Process 3: Issue loan"
        labeljust=l
        style=dashed
        node [shape=circle, width=1.15, fixedsize=true]
        p31 [label="3.1\\nCheck\\nmember"]
        p32 [label="3.2\\nWork out\\ndue date"]
        p33 [label="3.3\\nRecord\\nloan"]
        { rank=same; p31 p32 p33 }
    }

    node [shape=plain]
    d1 [label=<<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" CELLPADDING="6"><TR><TD SIDES="TBR">D1</TD><TD SIDES="TB">Members</TD></TR></TABLE>>]
    d3 [label=<<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" CELLPADDING="6"><TR><TD SIDES="TBR">D3</TD><TD SIDES="TB">Loans</TD></TR></TABLE>>]

    member -> p31 [label="book and card"]
    p31 -> p32 [label="approved loan"]
    p32 -> p33 [label="loan with\\ndue date"]
    p33 -> member [label="due date"]
    p33 -> d3 [label="new loan"]
    // dir=back draws the arrow from the store while keeping the store below.
    p31 -> d1 [dir=back, label="member status"]
    p31 -> d3 [dir=back, label="current loans"]
}
`,
  },
];
