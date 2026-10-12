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
];
