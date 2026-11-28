// Entirely fictional, manually authored demonstration. Never presented as AI output.
export const DEMO_RESUME = `EXAMPLE STUDENT
Computer science student · Fictional résumé

EDUCATION
Example State University | B.S. Computer Science | Expected 2027
Coursework: Data Structures, Databases, Software Engineering

EXPERIENCE
Software Engineering Intern | Example Labs | Summer 2026
Built a reusable Java library using Spring Boot.
Wrote integration tests for the library's validation rules.

PROJECTS
Campus Pantry | Team project | React, Python, PostgreSQL
Built a scheduling app to help student volunteers coordinate pantry shifts.
Integrated the React interface with a teammate's Python API and documented the request contract.

COMMUNITY
Workshop Organizer | Campus Computing Club
Organized eight technical workshops for 150 attendees.

SKILLS
Languages: Java, Python, JavaScript. Tools: React, Spring Boot, PostgreSQL.`;

export const DEMO_NOTES = [
  {
    line: "Built a reusable Java library using Spring Boot.",
    title: "Start with the problem",
    kind: "content",
    priority: "high",
    observation:
      "The tools and deliverable are clear; the original problem and beneficiary are not yet visible.",
    why: "A reader can better understand your engineering choices when they know what needed to change.",
    action:
      "Add the real problem and who needed the library. Keep the technical detail.",
    question:
      "What prior workflow made this library necessary, and who needed it?",
  },
  {
    line: "Wrote integration tests for the library's validation rules.",
    title: "Keep this concrete testing evidence",
    kind: "strength",
    priority: "keep",
    observation:
      "This bullet names both the testing method and what was tested.",
    why: "Specific testing work helps a reader understand your contribution beyond building the library.",
    action:
      "Keep this evidence. The optional wording below only changes sentence order.",
    suggestion: "Tested the library's validation rules with integration tests.",
  },
  {
    line: "Organized eight technical workshops for 150 attendees.",
    title: "Connect activity to the need",
    kind: "content",
    priority: "medium",
    observation:
      "The activity and attendance are specific; what participants needed is still unclear.",
    why: "Attendance shows reach, while the actual need explains the value of organizing the workshops.",
    action:
      "If known, explain what participants came to learn or practice. Do not infer outcomes from attendance.",
    question:
      "What learning need prompted the workshops, and what did participants actually receive?",
  },
  {
    line: "Languages: Java, Python, JavaScript. Tools: React, Spring Boot, PostgreSQL.",
    title: "Optional: separate the tool groups",
    kind: "format",
    priority: "optional",
    observation: "Languages and tools share one line.",
    why: "Separate lines may make this list easier to scan; this is a minor presentation choice.",
    action: "Consider a line break before “Tools” if it improves readability.",
  },
];
