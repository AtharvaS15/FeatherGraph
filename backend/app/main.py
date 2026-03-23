from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from . import crud, models, schemas
from .db import SessionLocal, get_db
from .init_db import init_db

app = FastAPI(title="FeatherGraph API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def serialize_note(note: models.Note):
    outgoing = [
        {
            "id": link.id,
            "note_id": link.to_note.id,
            "title": link.to_note.title,
            "relation": link.relation,
        }
        for link in sorted(note.outgoing_links, key=lambda item: item.to_note.title.lower())
        if link.to_note
    ]

    incoming = [
        {
            "id": link.id,
            "note_id": link.from_note.id,
            "title": link.from_note.title,
            "relation": link.relation,
        }
        for link in sorted(note.incoming_links, key=lambda item: item.from_note.title.lower())
        if link.from_note
    ]

    return {
        "id": note.id,
        "title": note.title,
        "content": note.content,
        "created_at": note.created_at,
        "updated_at": note.updated_at,
        "is_pinned": bool(note.is_pinned),
        "tags": [nt.tag.name for nt in sorted(note.tags, key=lambda item: item.tag.name)],
        "outgoing_links": outgoing,
        "incoming_links": incoming,
    }


@app.on_event("startup")
def startup():
    init_db()


@app.get("/health")
def health():
    return {"status": "ok", "app": "FeatherGraph"}


@app.get("/graph")
def graph_data(db: Session = Depends(get_db)):
    notes, links = crud.list_graph(db)
    return {
        "nodes": [
            {
                "id": note.id,
                "title": note.title,
                "is_pinned": bool(note.is_pinned),
                "tags": [nt.tag.name for nt in sorted(note.tags, key=lambda item: item.tag.name)],
                "updated_at": note.updated_at,
            }
            for note in notes
        ],
        "edges": [
            {
                "id": link.id,
                "from_note_id": link.from_note_id,
                "to_note_id": link.to_note_id,
                "relation": link.relation,
            }
            for link in links
        ],
    }


@app.get("/notes")
def list_notes(db: Session = Depends(get_db)):
    notes = crud.list_notes(db)
    return [
        {
            "id": n.id,
            "title": n.title,
            "updated_at": n.updated_at,
            "is_pinned": bool(n.is_pinned),
            "tags": [nt.tag.name for nt in sorted(n.tags, key=lambda x: x.tag.name)],
        }
        for n in notes
    ]


@app.post("/notes")
def create_note(payload: schemas.NoteCreate, db: Session = Depends(get_db)):
    note = crud.create_note(db, payload.title.strip(), payload.content)
    return serialize_note(note)


@app.get("/notes/{note_id}")
def get_note(note_id: int, db: Session = Depends(get_db)):
    note = crud.get_note(db, note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return serialize_note(note)


@app.put("/notes/{note_id}")
def update_note(note_id: int, payload: schemas.NoteUpdate, db: Session = Depends(get_db)):
    note = crud.update_note(db, note_id, payload.title.strip(), payload.content, payload.is_pinned)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return serialize_note(note)


@app.delete("/notes/{note_id}")
def delete_note(note_id: int, db: Session = Depends(get_db)):
    ok = crud.delete_note(db, note_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Note not found")
    return {"deleted": True}


@app.post("/notes/{note_id}/tags")
def add_tag(note_id: int, payload: schemas.TagCreate, db: Session = Depends(get_db)):
    note = crud.add_tag_to_note(db, note_id, payload.name)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return serialize_note(note)


@app.delete("/notes/{note_id}/tags/{tag_name}")
def remove_tag(note_id: int, tag_name: str, db: Session = Depends(get_db)):
    note = crud.remove_tag_from_note(db, note_id, tag_name)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return serialize_note(note)


@app.post("/links")
def create_link(payload: schemas.LinkCreate, db: Session = Depends(get_db)):
    result = crud.create_link(db, payload.from_note_id, payload.to_note_id, payload.relation.strip())
    if result == "self":
        raise HTTPException(status_code=400, detail="Cannot link a note to itself")
    if result is None:
        raise HTTPException(status_code=404, detail="One or both notes not found")
    return {
        "id": result.id,
        "from_note_id": result.from_note_id,
        "to_note_id": result.to_note_id,
        "relation": result.relation,
    }


@app.delete("/links/{link_id}")
def delete_link(link_id: int, db: Session = Depends(get_db)):
    ok = crud.remove_link(db, link_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Link not found")
    return {"deleted": True}


@app.get("/search")
def search_notes(q: str, db: Session = Depends(get_db)):
    rows = crud.search_notes(db, q)
    return [dict(row._mapping) for row in rows]
