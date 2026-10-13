import type { Template } from "./index";

export const orgchartTemplates: Template[] = [
  {
    id: "org-company",
    engine: "orgchart",
    category: "Organisations",
    title: "Company structure",
    summary: "A small software company: departments, an assistant, a vacancy and a dotted line.",
    code: `orgchart
title "Northwind Software"
counts
# Indent a line to put someone under the line above.
# "+" is an assistant, "?" a vacant post, [ ] the department.
Jane Smith: Chief Executive [Executive]
  + Lee Park: Executive Assistant
  Ravi Patel: Chief Technology Officer [Engineering]
    Ana Lopez #ana: Engineering Manager
      Tom Reed: Senior Developer
      Sara Khan: Developer
      ?: Graduate Developer
    Omar Haddad: QA Lead
      Priya Nair: Test Engineer
  Mia Chen #mia: Chief Financial Officer [Finance]
    Ben Ortiz: Accountant
  Zoe Adams: Head of Marketing [Marketing]
    Kai Turner: Content Designer
    Ella Brooks: Growth Analyst
# Dotted-line reporting: Ana agrees her team's budget with Mia.
ana .. mia "budget"
`,
  },
  {
    id: "org-university",
    engine: "orgchart",
    category: "Organisations",
    title: "University school",
    summary: "A school of computing in the compact layout, with teaching, research and support staff.",
    code: `orgchart
title "School of Computing"
compact
Prof. Helen Ward: Head of School [Leadership]
  + Dan Moore: School Administrator
  Dr Aisha Bello: Director of Teaching [Teaching]
    Dr Ken Ito: BSc Computer Science Lead
    Dr Ruth Ames: BSc Software Engineering Lead
    Dr Sam Lee: MSc Data Science Lead
  Prof. Marco Ricci: Director of Research [Research]
    Dr Lin Zhou: AI Group Lead
    Dr Femi Adeyemi: Security Group Lead
    ?: Systems Group Lead
  Grace Hill: Operations Manager [Professional services]
    Ian Price: Technical Services
    Rosa Diaz: Student Support
    Noah Kim: Timetabling
`,
  },
  {
    id: "org-society",
    engine: "orgchart",
    category: "Organisations",
    title: "Society committee",
    summary: "A student society committee, laid out left to right.",
    code: `orgchart
title "Computing Society Committee"
direction right
Maya Patel: President [Committee]
  + Luca Romano: Secretary
  Josh Evans: Vice President [Committee]
    Hana Sato: Events Officer [Events]
      Leo Grant: Hackathon Lead
      ?: Social Secretary
    Chris Obi: Outreach Officer [Outreach]
  Amira Yusuf: Treasurer [Finance]
    Tom Webb: Sponsorship Officer
`,
  },
  {
    id: "org-project",
    engine: "orgchart",
    category: "Organisations",
    title: "Project team",
    summary: "A final-year group project: roles and who answers to whom.",
    code: `orgchart
title "Group 7: Campus Navigation App"
Dr Ellis: Supervisor [Staff]
  Priya: Project Lead [Team]
    Sam: Backend Developer
    Jade: Frontend Developer
    Ollie: Tester and Documentation
    Ife: UX Designer
Ife .. Jade "pairs on UI"
`,
  },
];
