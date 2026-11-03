# Connected Notes — Knowledge Graph Workspace

Connected Notes is a local-first application for writing, searching, and connecting Markdown notes. It stores notes in SQLite, builds a navigable graph from directed note links, automatically surfaces backlinks, and supports full-text retrieval through SQLite FTS5.

The app combines a React/Vite frontend (Markdown editing, keyboard shortcuts, graph visualization) with a FastAPI REST backend (CRUD, tags, links) and SQLAlchemy data models.
---

## Design Goals

- Local-first — no accounts, no cloud dependency, data stored locally in SQLite
- Relationship-aware — notes can link to each other and form a knowledge graph
- Fast retrieval — full-text search using SQLite FTS5
- Clean writing workflow — markdown editor with live preview
- Decoupled architecture — frontend and backend separated so each layer can evolve independently

---

## Features

- Create, edit, pin, and delete notes
- Tag notes with normalized tags
- Create directed links between notes
- Automatic backlinks and related notes
- Full-text search across titles and content
- Markdown editor with live preview
- Slash-command quick inserts
- Keyboard shortcuts:
  - Cmd/Ctrl + S — Save note
  - Cmd/Ctrl + P — Pin/unpin note
- Graph view of note relationships

---

## Architecture

| Layer | Technology | Purpose |
|------|------------|---------|
| Backend API | FastAPI | Data access and note operations |
| Database | SQLite | Local-first storage |
| Search | SQLite FTS5 | Full-text search |
| ORM | SQLAlchemy | Relational data modeling |
| Frontend | React + Vite | User interface |
| Styling | Tailwind CSS | UI styling |
| Markdown | react-markdown | Live preview |
| Graph View | React Flow | Visualize note relationships |

---

## Data Model

The backend uses a normalized relational schema:

- notes — note content
- tags — normalized tag table
- note_tags — many-to-many mapping between notes and tags
- note_links — directed edges between notes

This allows FeatherGraph to represent notes as a directed graph, enabling backlinks, related notes, and graph visualization.

---

## Project Structure

FeatherGraph/
├── backend/
├── frontend/
├── screenshots/
└── README.md

---

## Running Connected Notes Locally

### 1. Start the backend

cd backend
python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload

Backend API:
http://127.0.0.1:8000

API docs:
http://127.0.0.1:8000/docs

### 2. Start the frontend

In a new terminal:

cd frontend
npm install
npm run dev

Frontend:
http://localhost:5173



## License
MIT License