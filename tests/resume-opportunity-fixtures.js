/** 100% fictional normalized evidence fixtures; no actual student résumé or real program. */
const req = (id,kind,priority,sourceQuote,capabilities=[])=>({id,kind,priority,sourceQuote,capabilities});
const makeOpportunity = x => ({...x,sourceText:x.requirements.map(r=>r.sourceQuote).join('\n')});
export const OPPORTUNITIES = Object.freeze([
  {
    "id": "backend-intern",
    "kind": "external_job_description",
    "title": "Fictional Backend SWE Internship",
    "sourceState": "user_pasted",
    "resumeRequirement": "unspecified",
    "requirements": [
      {
        "id": "java-spring",
        "kind": "skill",
        "priority": "required",
        "sourceQuote": "Build backend APIs with Java and Spring Boot.",
        "capabilities": [
          "spring-backend"
        ]
      },
      {
        "id": "testing",
        "kind": "skill",
        "priority": "required",
        "sourceQuote": "Write integration tests for services and workflows.",
        "capabilities": [
          "integration-testing"
        ]
      },
      {
        "id": "collaboration",
        "kind": "competency",
        "priority": "required",
        "sourceQuote": "Collaborate with engineers on API integrations.",
        "capabilities": [
          "team-integration"
        ]
      },
      {
        "id": "streaming",
        "kind": "skill",
        "priority": "preferred",
        "sourceQuote": "Experience with streaming systems such as Kafka is preferred.",
        "capabilities": [
          "stream-processing"
        ]
      },
      {
        "id": "enrollment",
        "kind": "eligibility",
        "priority": "required",
        "sourceQuote": "Applicants must be enrolled in an undergraduate degree program.",
        "capabilities": []
      }
    ],
    "sourceText": "Build backend APIs with Java and Spring Boot.\nWrite integration tests for services and workflows.\nCollaborate with engineers on API integrations.\nExperience with streaming systems such as Kafka is preferred.\nApplicants must be enrolled in an undergraduate degree program."
  },
  {
    "id": "discovery-fellowship",
    "kind": "applyfirst_program",
    "programId": "fictional-discovery-fellowship",
    "title": "Fictional Cross-Campus Technology Exploration Fellowship",
    "sourceState": "needs_confirmation",
    "resumeRequirement": "not_required",
    "requirements": [
      {
        "id": "first-two-years",
        "kind": "eligibility",
        "priority": "required",
        "sourceQuote": "Students in their first or second year of university may apply.",
        "capabilities": []
      },
      {
        "id": "curiosity",
        "kind": "competency",
        "priority": "preferred",
        "sourceQuote": "Show curiosity about exploring technology careers and industries.",
        "capabilities": [
          "career-exploration"
        ]
      },
      {
        "id": "mentorship",
        "kind": "competency",
        "priority": "preferred",
        "sourceQuote": "Participate in group mentorship and peer learning.",
        "capabilities": [
          "peer-mentoring",
          "community-building"
        ]
      },
      {
        "id": "initiative",
        "kind": "competency",
        "priority": "preferred",
        "sourceQuote": "Describe a project, challenge, or initiative that matters to you.",
        "capabilities": [
          "problem-framing",
          "research-method"
        ]
      },
      {
        "id": "no-resume",
        "kind": "application_material",
        "priority": "contextual",
        "sourceQuote": "No resume is needed for the initial interest form.",
        "capabilities": []
      }
    ],
    "sourceText": "Students in their first or second year of university may apply.\nShow curiosity about exploring technology careers and industries.\nParticipate in group mentorship and peer learning.\nDescribe a project, challenge, or initiative that matters to you.\nNo resume is needed for the initial interest form."
  },
  {
    "id": "startup-generalist",
    "kind": "external_job_description",
    "title": "Fictional Early-Stage Startup Product Engineer",
    "sourceState": "user_pasted",
    "resumeRequirement": "unspecified",
    "requirements": [
      {
        "id": "prototyping",
        "kind": "experience",
        "priority": "required",
        "sourceQuote": "Prototype customer-facing flows and test early product ideas.",
        "capabilities": [
          "product-prototype",
          "frontend-prototype"
        ]
      },
      {
        "id": "users",
        "kind": "competency",
        "priority": "required",
        "sourceQuote": "Talk with users, synthesize feedback, and iterate quickly.",
        "capabilities": [
          "user-research"
        ]
      },
      {
        "id": "crossfunctional",
        "kind": "competency",
        "priority": "required",
        "sourceQuote": "Work directly with founders and cross-functional partners.",
        "capabilities": [
          "crossfunctional",
          "team-integration"
        ]
      },
      {
        "id": "payments",
        "kind": "skill",
        "priority": "preferred",
        "sourceQuote": "Experience with payment APIs or financial workflows is a plus.",
        "capabilities": [
          "payments-api"
        ]
      }
    ],
    "sourceText": "Prototype customer-facing flows and test early product ideas.\nTalk with users, synthesize feedback, and iterate quickly.\nWork directly with founders and cross-functional partners.\nExperience with payment APIs or financial workflows is a plus."
  }
]);
const person = (id,rows,expected) => { const evidence=rows.map(([eid,sourceQuote,capabilities])=>({id:eid,sourceQuote,capabilities,evidenceState:'demonstrated'})); return {id,resumeText:evidence.map(e=>e.sourceQuote).join('\n'),evidence,expectedTop:Object.fromEntries(OPPORTUNITIES.map((o,i)=>[o.id,expected[i]]))}; };
export const CANDIDATES = Object.freeze([
  person("profile-01",[["p01-backend","Implemented Java Spring Boot endpoints for a campus scheduling tool.",["spring-backend"]],["p01-integration","Aligned API contracts with classmates and wrote integration tests for their shared services.",["team-integration","integration-testing"]],["p01-mentor","Joined a cross-campus technology mentorship cohort to explore different engineering roles.",["peer-mentoring","career-exploration"]],["p01-startup","Prototyped a ticket-checkout interface and interviewed five student organizers about the workflow.",["product-prototype","user-research"]]],["p01-integration","p01-mentor","p01-startup"]),
  person("profile-02",[["p02-backend","Built a Java Spring Boot API and ran integration tests for a lab inventory service.",["spring-backend","integration-testing"]],["p02-community","Organized peer-led career workshops across three university clubs.",["community-building","career-exploration"]],["p02-research","Interviewed eight users and revised a prototype for sharing surplus lab equipment.",["user-research","product-prototype"]]],["p02-backend","p02-community","p02-research"]),
  person("profile-03",[["p03-java","Implemented backend services in Spring Boot for a group course project.",["spring-backend"]],["p03-peer","Coordinated a peer-learning circle connecting students with engineering alumni.",["peer-mentoring","career-exploration"]],["p03-prototype","Prototyped a volunteer registration flow and iterated after student interviews.",["product-prototype","user-research"]]],["p03-java","p03-peer","p03-prototype"]),
  person("profile-04",[["p04-engineering","Wrote Java Spring Boot APIs and integration tests for an academic library.",["spring-backend","integration-testing"]],["p04-teaching","Mentored participants in a national programming cohort and helped peers debug exercises.",["peer-mentoring","career-exploration"]],["p04-crossfunctional","Paired with designers and student researchers to prototype a tutoring booking flow.",["crossfunctional","product-prototype"]]],["p04-engineering","p04-teaching","p04-crossfunctional"]),
  person("profile-05",[["p05-research","Conducted reproducible Python research on sensor calibration and experimental design.",["research-method","problem-framing"]],["p05-learning","Joined a mentorship community to explore research and engineering career paths.",["career-exploration","peer-mentoring"]],["p05-customers","Interviewed product users and used feedback to revise a mobile onboarding prototype.",["user-research","product-prototype"]]],[null,"p05-learning","p05-customers"]),
  person("profile-06",[["p06-tech","Built Java Spring Boot services and integration tests for a student payment prototype.",["spring-backend","integration-testing","payments-api"]],["p06-community","Led peer sessions on fintech careers and presented questions to industry mentors.",["community-building","career-exploration"]],["p06-founder","Prototyped independent payment approvals and used customer interviews to adjust checkout steps.",["product-prototype","user-research","payments-api"]]],["p06-tech","p06-community","p06-founder"]),
  person("profile-07",[["p07-visual","Designed accessibility-focused dashboards for a student research exhibit.",["design"]],["p07-community","Joined a cross-campus product fellowship and learned from mentors in design and engineering.",["career-exploration","peer-mentoring"]],["p07-prototype","Interviewed volunteers and iterated a Figma sign-up prototype for a local charity.",["user-research","frontend-prototype"]]],[null,"p07-community","p07-prototype"]),
  person("profile-08",[["p08-java","Built Spring Boot services and integration tests for an internal tooling internship.",["spring-backend","integration-testing"]],["p08-program","Completed an employer-hosted exploratory mentorship program on technology careers.",["career-exploration","peer-mentoring"]],["p08-test","Prototyped a customer-facing workflow and collected usability feedback from test participants.",["product-prototype","user-research"]]],["p08-java","p08-program","p08-test"]),
  person("profile-09",[["p09-integration","Coordinated API specifications with three classmates, resolving integration issues.",["team-integration"]],["p09-mentor","Guided peers through coding exercises and participated in an interschool technology cohort.",["peer-mentoring","career-exploration"]],["p09-collab","Collaborated with designers to revise an interactive onboarding prototype based on interviews.",["crossfunctional","product-prototype","user-research"]]],["p09-integration","p09-mentor","p09-collab"]),
  person("profile-10",[["p10-course","Built a Java Spring Boot homework API with peer-reviewed integration tests.",["spring-backend","integration-testing"]],["p10-exploration","Explored software and product careers through workshops and a peer mentoring program.",["career-exploration","peer-mentoring"]],["p10-project","Built a clickable event-planning prototype and interviewed classmates about their needs.",["product-prototype","user-research"]]],["p10-course","p10-exploration","p10-project"])
]);
