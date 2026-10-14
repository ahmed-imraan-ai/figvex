import type { Template } from "./index";

export const wavedromTemplates: Template[] = [
  {
    id: "wave-basics",
    engine: "wavedrom",
    category: "Algorithms & theory",
    title: "Timing diagram: clock, signals and a bus",
    summary: "WaveDrom basics: a clock, control signals and a data bus with values, one character per clock cycle.",
    code: `// Each character in a wave is one clock cycle:
//   p n  clock (rising, falling)   0 1  low, high   x  unknown
//   z    high impedance             .   same as before
//   = 2 3 4 5  a bus value, labelled from data in order
{ signal: [
  { name: 'clk',   wave: 'p.......' },
  { name: 'reset', wave: '10......' },
  { name: 'valid', wave: '0.1..0..' },
  { name: 'data',  wave: 'x.345x..', data: ['A0', 'A1', 'A2'] },
  { name: 'ready', wave: '0..1.0..' },
  {},
  { name: 'bus',   wave: 'z.=.z=.z', data: ['read', 'write'] }
],
  head: { text: 'Handshake', tick: 0 }
}
`,
  },
  {
    id: "wave-spi",
    engine: "wavedrom",
    category: "Algorithms & theory",
    title: "Timing diagram: SPI transfer",
    summary: "One SPI byte: chip select, clock, and data out and in, grouped and with tick numbers.",
    code: `// Square brackets group signals under a heading.
// hscale stretches the diagram sideways.
{ signal: [
  { name: 'CS',   wave: '10.........1' },
  { name: 'SCLK', wave: '0.p.......l.' },
  ['Data',
    { name: 'MOSI', wave: 'x.33333333x.', data: ['b7','b6','b5','b4','b3','b2','b1','b0'] },
    { name: 'MISO', wave: 'z.44444444z.', data: ['b7','b6','b5','b4','b3','b2','b1','b0'] }
  ]
],
  config: { hscale: 1 },
  head: { text: 'SPI mode 0, one byte', tick: 0 }
}
`,
  },
  {
    id: "wave-setup-hold",
    engine: "wavedrom",
    category: "Algorithms & theory",
    title: "Timing diagram: setup and hold",
    summary: "Arrows between points on the waves show a flip-flop's setup and hold times.",
    code: `// node puts a letter on a point of the wave; edge draws an arrow
// between two letters: a<->b is a double arrow, |~> curved, and so on.
{ signal: [
  { name: 'clk', wave: 'p.....', node: '..c...' },
  { name: 'D',   wave: 'x1.x..', node: '.a.b..' },
  { name: 'Q',   wave: 'x..1..', node: '...d..' }
],
  edge: ['a<->c setup', 'c<->b hold', 'c~>d clock to Q'],
  config: { hscale: 2 }
}
`,
  },
  {
    id: "wave-register",
    engine: "wavedrom",
    category: "Algorithms & theory",
    title: "Register bit fields",
    summary: "A 32-bit RISC-V instruction format drawn as bit fields.",
    code: `// reg draws a register: each field has a width in bits, a name and
// an optional type (a colour). Fields are listed from bit 0 upwards.
{ reg: [
  { bits: 7,  name: 'opcode',   attr: 'OP' },
  { bits: 5,  name: 'rd',       attr: 'dest' },
  { bits: 3,  name: 'funct3' },
  { bits: 5,  name: 'rs1',      attr: 'src1' },
  { bits: 5,  name: 'rs2',      attr: 'src2' },
  { bits: 7,  name: 'funct7',   type: 4 }
],
  config: { hspace: 900, lanes: 1, bits: 32 }
}
`,
  },
  {
    id: "wave-assign",
    engine: "wavedrom",
    category: "Algorithms & theory",
    title: "Logic circuit from assignments",
    summary: "WaveDrom's assign form draws gates from nested expressions: a half adder and a multiplexer.",
    code: `// Each line assigns an output from gates written as nested lists:
// ['&', a, b] is AND, ['|', ...] OR, ['^', ...] XOR, ['~', a] NOT.
{ assign: [
  ['sum',   ['^', 'a', 'b']],
  ['carry', ['&', 'a', 'b']],
  ['out',   ['|', ['&', ['~', 'sel'], 'x'], ['&', 'sel', 'y']]]
]}
`,
  },
];
