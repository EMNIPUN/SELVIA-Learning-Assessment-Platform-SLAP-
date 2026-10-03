# SELVIA External Education & Assessment Platform

The SELVIA External Education & Assessment Platform is a standalone web application for teaching and assessing **Software Engineering** courses. It is the external learning environment where students study, practise, and get assessed. The evidence it collects about student learning will later be shared with the **SELVIA Adaptive AI Tutor** through the Model Context Protocol (MCP).

> **Status:** Project initialization only. No application logic, database schemas, authentication, UI components, or API routes have been implemented yet.

---

## Purpose

The platform has two jobs:

1. **Deliver and assess learning.** Provide Software Engineering course content, practice activities, and formal assessments to students, and give lecturers the tools to manage that content.
2. **Capture learning evidence.** Record how students interact with materials and how they perform on assessments, so that the Adaptive AI Tutor can personalise support based on real, observed evidence.

## Planned Features

### For Students
- Browse and follow Software Engineering courses
- Access learning materials
- Complete exercises
- Take quizzes
- Sit tests and examinations
- View attempts and results

### For Lecturers
- Create and manage courses
- Author and organise learning materials
- Create exercises, quizzes, tests, and examinations
- Review student attempts and results

### Learning Evidence
- Record student attempts, scores, and activity as structured learning evidence
- Expose that evidence to the Adaptive AI Tutor through MCP (later phase)

## Intended Architecture

```
React + Vite                (client)
        ↓
Node.js + Express           (server)
        ↓
PostgreSQL + Neo4j          (relational data + knowledge/concept graph)
        ↓
Student Evidence
        ↓
MCP                         (Model Context Protocol integration)
        ↓
Adaptive AI Tutor
```

| Layer | Technology | Responsibility |
|-------|------------|----------------|
| Client | React + Vite | Student and lecturer web interface |
| Server | Node.js + Express | REST API and business logic |
| Relational data | PostgreSQL | Users, courses, content, assessments, attempts, results |
| Graph data | Neo4j | Concept relationships and learning-evidence graph |
| Integration | MCP | Sharing student evidence with the Adaptive AI Tutor |

## Project Structure

```
SELVIA-Learning-Assessment-Platform-SLAP-/
├── client/        # React + Vite frontend (not yet initialized)
├── server/        # Node.js + Express backend (not yet initialized)
├── docs/          # Project documentation
├── .gitignore
└── README.md
```

## Roadmap

1. Project initialization *(current step)*
2. Client scaffold (React + Vite)
3. Server scaffold (Node.js + Express)
4. Database design (PostgreSQL and Neo4j)
5. Authentication and roles (student / lecturer)
6. Course and learning-material management
7. Exercises, quizzes, tests, and examinations
8. Attempts, results, and learning-evidence capture
9. MCP integration with the Adaptive AI Tutor

## Scope

This project covers **only** the external education and assessment web application. The Adaptive AI Tutor itself is outside the scope of this project and will be integrated through MCP.
