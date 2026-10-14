import type { Template } from "./index";

export const automatonTemplates: Template[] = [
  {
    id: "fa-ends-ab",
    engine: "automaton",
    category: "Algorithms & theory",
    title: "DFA: strings ending in ab",
    summary: "A deterministic finite automaton over a and b, with inputs to step through.",
    code: `automaton
title "Strings that end in ab"
# from -symbol-> to. Commas list several symbols on one arrow.
# Each input line is run; use the step bar on the diagram to follow it.
start q0
accept q2
q0 -b-> q0
q0 -a-> q1
q1 -a-> q1
q1 -b-> q2
q2 -a-> q1
q2 -b-> q0
input abab
input abba
input ε
`,
  },
  {
    id: "fa-nfa-abb",
    engine: "automaton",
    category: "Algorithms & theory",
    title: "NFA: (a|b)*abb with ε moves",
    summary: "A nondeterministic automaton with ε moves; the step bar shows every state it could be in.",
    code: `automaton
title "NFA for (a|b)*abb"
# ε (or eps) is a move that reads nothing. With a choice of moves,
# the automaton is in a set of states at once.
start s0
accept s4
s0 -ε-> s1
s1 -a, b-> s1
s1 -ε-> s2
s2 -a-> s3
s3 -b-> s5
s5 -b-> s4
input aabb
input abab
`,
  },
  {
    id: "fa-mod3",
    engine: "automaton",
    category: "Algorithms & theory",
    title: "DFA: binary multiples of 3",
    summary: "Reads a binary number bit by bit; the state is the remainder after dividing by 3.",
    code: `automaton
title "Binary numbers divisible by 3"
# The state is the remainder so far. Reading a bit doubles the
# number and adds the bit: r -> (2r + bit) mod 3.
states r0 r1 r2
start r0
accept r0
r0 -0-> r0
r0 -1-> r1
r1 -0-> r2
r1 -1-> r0
r2 -0-> r1
r2 -1-> r2
input 110
input 1001
input 111
`,
  },
  {
    id: "fa-turnstile",
    engine: "automaton",
    category: "Algorithms & theory",
    title: "State machine: coin turnstile",
    summary: "A turnstile that unlocks for a coin and locks again after a push; symbols can be whole words.",
    code: `automaton
title "Coin-operated turnstile"
# Symbols longer than one character are written with spaces in
# the input: coin push push.
start Locked
accept Locked
Locked -coin-> Unlocked
Locked -push-> Locked
Unlocked -push-> Locked
Unlocked -coin-> Unlocked
input coin push push coin coin push
`,
  },
  {
    id: "tm-increment",
    engine: "automaton",
    category: "Algorithms & theory",
    title: "Turing machine: add one in binary",
    summary: "Moves to the end of a binary number, then carries back to the left. Step through to watch the tape.",
    code: `automaton
title "Binary increment"
# A Turing machine move is read/write,direction (L, R or S).
# _ is the blank. The machine stops in an accepting state.
start right
accept done
right -0/0,R; 1/1,R-> right
right -_/_,L-> carry
carry -1/0,L-> carry
carry -0/1,S; _/1,S-> done
input 1011
input 111
`,
  },
  {
    id: "tm-anbn",
    engine: "automaton",
    category: "Algorithms & theory",
    title: "Turing machine: aⁿbⁿ",
    summary: "Accepts a's followed by the same number of b's, crossing off one of each per pass.",
    code: `automaton
title "Accept aⁿbⁿ"
# Cross off an a (X), find the matching b (Y), come back, repeat.
start q0
accept yes
q0 -a/X,R-> q1
q0 -Y/Y,R-> q3
q0 -_/_,S-> yes
q1 -a/a,R; Y/Y,R-> q1
q1 -b/Y,L-> q2
q2 -a/a,L; Y/Y,L-> q2
q2 -X/X,R-> q0
q3 -Y/Y,R-> q3
q3 -_/_,S-> yes
input aabb
input aab
`,
  },
];
