import type { Template } from "./index";

export const wireframeTemplates: Template[] = [
  {
    id: "wire-login-flow",
    engine: "wireframe",
    category: "Planning",
    title: "App sign-in flow",
    summary: "Three phone screens, sign in, home and settings, with arrows for how the user moves between them.",
    code: `wireframe
title "Sign-in flow"
# Indent controls under their screen. Quoted text is what the control
# shows; words after it change it: primary, on, back. "row" puts the
# controls indented under it side by side.
screen login "Sign in" phone
  header "Campus app"
  heading "Welcome back"
  text "Sign in with your student account to see your timetable."
  field "Email" "you@uni.ac.uk"
  password "Password"
  row
    checkbox "Remember me" on
    link "Forgot password?"
  button "Sign in" primary
  divider
  button "Create an account"

screen home "Home" phone
  header "Today" menu
  search "Search modules"
  card "Next lecture"
    text "Databases, 10:00 in Room 2.14"
    progress "Week 7 of 12" 58
  list "Timetable" "Grades" "Library"
  nav *"Home" "Search" "Profile"

screen settings "Settings" phone
  header "Settings" back
  toggle "Notifications" on
  toggle "Dark mode"
  dropdown "Language" "English"
  slider "Text size" 40
  alert "Changes are saved as you go." success

login -> home "Sign in"
home -> settings "Menu"
settings -> home "Back"
`,
  },
  {
    id: "wire-dashboard",
    engine: "wireframe",
    category: "Planning",
    title: "Web dashboard",
    summary: "A desktop admin page in a browser frame: navigation, stats cards, a chart placeholder and a table.",
    code: `wireframe
screen dash "Admin dashboard" browser
  header "Coursework tracker" menu
  tabs *"Overview" "Students" "Marking" "Settings"
  row
    card "Submitted"
      heading "128"
    card "Late"
      heading "9"
    card "Marked"
      heading "74"
  image "Submissions per day" 160
  table "Student" "Module" "Status"
    row "A. Khan" "CS201" "Marked"
    row "B. Silva" "CS201" "Submitted"
    row "C. Musa" "CS204" "Late"
  row
    button "Export CSV"
    button "Send reminders" primary
`,
  },
  {
    id: "wire-form-sketchy",
    engine: "wireframe",
    category: "Planning",
    title: "Contact form (sketchy)",
    summary: "A tablet form drawn in the sketchy style, like a paper prototype. Change the style in the Style menu.",
    code: `wireframe
# Pick "Sketchy" in the Style menu for a hand-drawn look.
screen form "Book a tutorial" tablet
  header "Help desk" back
  heading "Book a tutorial"
  row
    field "First name" "Aisha"
    field "Last name" "Rahman"
  dropdown "Module" "CS204 Algorithms"
  row
    radio "Online" on
    radio "In person"
  textarea "What do you need help with?" "Describe the problem…"
  checkbox "Email me a reminder" on
  row
    button "Cancel"
    button "Book" primary
`,
  },
];
