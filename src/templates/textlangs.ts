import type { Template } from "./index";

// Templates for D2 and nomnoml, for people who already write those.

export const textLanguageTemplates: Template[] = [
  {
    id: "nml-classes",
    engine: "nomnoml",
    category: "UML structure",
    title: "nomnoml class diagram",
    summary: "A small library system in nomnoml's bracket syntax: classes with compartments, inheritance and associations.",
    code: `// Boxes are [Name|fields|methods]. Arrows: -> association,
// -:> inheritance, +-> composition, o-> aggregation.
#direction: right
#spacing: 50

[<abstract>Item|title: String;year: int|isAvailable(): bool]
[Book|isbn: String;pages: int]
[DVD|minutes: int]
[Member|name: String;email: String|borrow(item);return(item)]
[Loan|due: Date|isOverdue(): bool]
[<database>Catalogue]

[Book] -:> [Item]
[DVD] -:> [Item]
[Member] 1 - 0..* [Loan]
[Loan] -> 1 [Item]
[Catalogue] o-> 0..* [Item]
`,
  },
  {
    id: "nml-flow",
    engine: "nomnoml",
    category: "UML behaviour",
    title: "nomnoml activity flow",
    summary: "A login flow with start, choice and end nodes, written in nomnoml.",
    code: `#direction: down
[<start>start] -> [Enter email and password]
[Enter email and password] -> [<choice>Correct?]
[<choice>Correct?] -> yes [Open dashboard]
[<choice>Correct?] -> no [Show error]
[Show error] -> [Enter email and password]
[Open dashboard] -> [<end>end]
`,
  },
  {
    id: "d2-architecture",
    engine: "d2",
    category: "Architecture & networks",
    title: "D2 web architecture",
    summary: "A web app in D2: containers, shapes like cylinder and person, and labelled connections.",
    code: `direction: right
# D2: name: label, a -> b: label, and { } for containers.

user: Student {shape: person}

campus: Campus cloud {
  lb: Load balancer
  web: Web servers {
    a: web-1
    b: web-2
  }
  db: Database {shape: cylinder}
  cache: Cache {shape: stored_data}

  lb -> web.a
  lb -> web.b
  web.a -> db
  web.b -> db
  web.a -> cache: sessions
}

user -> campus.lb: HTTPS
`,
  },
  {
    id: "d2-sql-tables",
    engine: "d2",
    category: "Data & databases",
    title: "D2 database tables",
    summary: "Tables with typed columns and keys using D2's sql_table shape, joined by foreign keys.",
    code: `students: {
  shape: sql_table
  id: int {constraint: primary_key}
  name: varchar
  course_id: int {constraint: foreign_key}
}
courses: {
  shape: sql_table
  id: int {constraint: primary_key}
  title: varchar
}
enrolments: {
  shape: sql_table
  student_id: int {constraint: foreign_key}
  module_id: int {constraint: foreign_key}
  mark: int
}
modules: {
  shape: sql_table
  id: int {constraint: primary_key}
  title: varchar
}

students.course_id -> courses.id
enrolments.student_id -> students.id
enrolments.module_id -> modules.id
`,
  },
  {
    id: "d2-sequence",
    engine: "d2",
    category: "UML behaviour",
    title: "D2 sequence diagram",
    summary: "A login request drawn with D2's sequence_diagram shape.",
    code: `login: Signing in {
  shape: sequence_diagram
  browser: Browser
  api: API
  db: Database

  browser -> api: POST /login
  api -> db: find user
  db -> api: user and hash
  api -> api: check password
  api -> browser: 200 + session cookie
}
`,
  },
];
