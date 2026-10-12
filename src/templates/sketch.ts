import type { Template } from "./index";

export const sketchTemplates: Template[] = [
  {
    id: "sketch-system",
    engine: "sketch",
    category: "Architecture & networks",
    title: "System sketch",
    summary: "A freeform web app architecture. Drag the boxes; the arrows follow.",
    code: `sketch
# Draw with the tools above the diagram, or edit these lines.
box browser 40 120 140 70 "Browser" round
box api 280 120 160 70 "API server" round fill=#fde68a
ellipse cache 540 30 130 60 "Cache"
box db 540 200 130 70 "Database"
box queue 280 290 160 60 "Job queue" dashed
box worker 540 330 130 60 "Worker" round
arrow browser -> api "HTTPS"
arrow api -> cache "read"
arrow api -> db "SQL"
arrow api -> queue "enqueue"
arrow queue -> worker
text note 40 300 "Sessions live in the cache\\nso any API server can answer." size=14
`,
  },
  {
    id: "sketch-wireframe",
    engine: "sketch",
    category: "Planning",
    title: "Login wireframe",
    summary: "A rough mobile login screen made of boxes and text.",
    code: `sketch
box phone 120 20 260 460 round
text title 190 60 "Sign in" size=26 bold
box email 150 130 200 40 "Email"
box password 150 190 200 40 "Password"
box submit 150 260 200 44 "Sign in" round fill=#1d1d1b stroke=#1d1d1b
text forgot 196 330 "Forgot password?" size=13
line 150,380 -> 350,380
text sso 205 395 "or continue with" size=12
box google 150 430 95 34 "Google" round
box github 255 430 95 34 "GitHub" round
text annotate 420 270 "Button disabled\\nuntil both fields\\nare filled" size=14
arrow 415,280 -> 360,280
`,
  },
  {
    id: "sketch-brainstorm",
    engine: "sketch",
    category: "Planning",
    title: "Brainstorm",
    summary: "Ideas for a group project around a central question.",
    code: `sketch
ellipse topic 300 190 200 90 "Study app\\nfor first years" bold fill=#fde68a
box a 60 60 150 54 "Timetable sync" round
box b 560 60 150 54 "Flashcards" round
box c 60 330 150 54 "Study groups" round
box d 560 330 150 54 "Deadline alerts" round
box e 320 40 160 54 "Campus map?" round dashed
arrow topic -> a
arrow topic -> b
arrow topic -> c
arrow topic -> d
line topic -> e dashed
text vote 300 420 "Vote: put a dot next to your top two" size=14
`,
  },
];
