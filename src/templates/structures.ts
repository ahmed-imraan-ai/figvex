import type { Template } from "./index";

export const structuresTemplates: Template[] = [
  {
    id: "ds-linear",
    engine: "structures",
    category: "Algorithms & theory",
    title: "Arrays, stacks, queues and lists",
    summary: "The linear structures side by side, with highlighted cells and pointers into the array.",
    code: `structures
title "Linear structures"
# mark highlights items; ptr puts named pointers under array cells.
array A = [7, 2, 9, 4, 1, 8] mark 2, 3 ptr lo=0 mid=2 hi=5
stack S = [10, 20, 30]
queue Q = [a, b, c, d]
list L = 3 -> 1 -> 4 -> 1
list D = 5 <-> 9 <-> 2
list C = x -> y -> z circular
`,
  },
  {
    id: "ds-trees",
    engine: "structures",
    category: "Algorithms & theory",
    title: "Binary search tree and heap",
    summary: "A BST built by inserting values in order, and a max-heap shown as a tree and as its array.",
    code: `structures
title "Trees"
# bst inserts the values in the order given.
bst B = 50 30 70 20 40 60 80 35 mark 40
# A heap is stored as an array: the children of index i are 2i+1 and 2i+2.
heap H = [90, 70, 80, 30, 50, 60, 10] mark 1
# Any tree: value(children). Leave a child empty with a comma: 10(, 14).
tree T = A(B(D, E), C(, F))
`,
  },
  {
    id: "ds-hash",
    engine: "structures",
    category: "Algorithms & theory",
    title: "Hash tables: chaining and probing",
    summary: "The same keys with separate chaining in a table of 7, and with linear probing in a table of 11.",
    code: `structures
title "Hash tables, h(k) = k mod size"
hash Chained size 7 = 10, 22, 31, 4, 15, 28, 17, 88, 59
hash Linear size 11 = 10, 22, 31, 4, 15, 28, 17, 88, 59 probe linear
`,
  },
  {
    id: "ds-graphs",
    engine: "structures",
    category: "Algorithms & theory",
    title: "Graphs and an adjacency matrix",
    summary: "A weighted undirected graph, a directed graph and the matching adjacency matrix.",
    code: `structures
title "Graphs"
# a-b joins two nodes; a-b:4 gives the edge a weight.
graph G = A-B:4, A-C:2, B-C:5, B-D:10, C-E:3, E-D:4, D-F:11 mark A, D
digraph DG = 0->1, 1->2, 2->0, 2->3, 3->3
# Row i, column j is 1 when DG has an edge from i to j.
matrix M = [[0, 1, 0, 0], [0, 0, 1, 0], [1, 0, 0, 1], [0, 0, 0, 1]]
`,
  },
];
