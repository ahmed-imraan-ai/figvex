import type { Template } from "./index";

export const logicTemplates: Template[] = [
  {
    id: "logic-kmap",
    engine: "logic",
    category: "Algorithms & theory",
    title: "Truth table and Karnaugh map",
    summary: "Type a boolean expression and get its truth table, Karnaugh map groups and simplest form.",
    code: `logic
title "Simplifying an expression"
# Write AND as · . * & or side by side (AB), OR as + or |,
# NOT as ! ~ ¬ or a ' after a letter. The Style menu changes
# how the answer is written: overbars, primes, ∧ ∨ ¬ or code.
F = A'B'C' + A'BC' + AB'C' + ABC' + ABC
show table kmap simplified minterms
`,
  },
  {
    id: "logic-minterms",
    engine: "logic",
    category: "Algorithms & theory",
    title: "Four-variable K-map with don't cares",
    summary: "A function given as minterms and don't cares, simplified both ways: sum of products and product of sums.",
    code: `logic
title "Four-variable map with don't cares"
# m(...) lists the rows where F is 1, d(...) the rows that don't matter.
# Groups may wrap round the edges of the map, as the corners do here.
F(A, B, C, D) = m(0, 2, 5, 7, 8, 10, 13, 15) + d(1, 9)
form both
show kmap simplified
`,
  },
  {
    id: "logic-adder",
    engine: "logic",
    category: "Algorithms & theory",
    title: "Full adder",
    summary: "Sum and carry of a one-bit full adder, with the truth table and both gate circuits.",
    code: `logic
title "Full adder"
vars A B Cin
S = A ^ B ^ Cin
Cout = AB + Cin(A ^ B)
show table circuit
`,
  },
  {
    id: "logic-demorgan",
    engine: "logic",
    category: "Algorithms & theory",
    title: "De Morgan's laws",
    summary: "Checks that NOT (A AND B) is the same as NOT A OR NOT B, and the same for OR.",
    code: `logic
title "De Morgan's laws"
F1 = !(A & B)
G1 = !A | !B
F2 = !(A | B)
G2 = !A & !B
show table
compare F1 G1
compare F2 G2
`,
  },
  {
    id: "logic-majority",
    engine: "logic",
    category: "Algorithms & theory",
    title: "Majority vote circuit (IEC symbols)",
    summary: "The output is 1 when at least two of three inputs are 1, drawn with IEC box symbols.",
    code: `logic
title "Majority of three"
# gates iec draws box symbols (&, ≥1); ansi draws the curved shapes.
M = ABC + ABC' + AB'C + A'BC
gates iec
circuit simplified
show table kmap simplified circuit
`,
  },
];
