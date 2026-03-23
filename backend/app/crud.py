from datetime import datetime, timezone

from sqlalchemy import desc, text
from sqlalchemy.orm import Session, joinedload

from . import models


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _sync_fts(db: Session, note_id: int, title: str, content: str) -> None:
    # SQLite FTS virtual tables do not support UPSERT syntax.
    db.execute(text("DELETE FROM notes_fts WHERE rowid = :id"), {"id": note_id})
    db.execute(
        text("INSERT INTO notes_fts(rowid, title, content) VALUES (:id, :title, :content)"),
        {"id": note_id, "title": title, "content": content},
    )


def create_note(db: Session, title: str, content: str):
    stamp = now_iso()
    note = models.Note(title=title, content=content, created_at=stamp, updated_at=stamp, is_pinned=0)
    db.add(note)
    db.commit()
    db.refresh(note)
    _sync_fts(db, note.id, note.title, note.content)
    db.commit()
    return get_note(db, note.id)


def get_note(db: Session, note_id: int):
    return (
        db.query(models.Note)
        .options(
            joinedload(models.Note.tags).joinedload(models.NoteTag.tag),
            joinedload(models.Note.outgoing_links).joinedload(models.NoteLink.to_note),
            joinedload(models.Note.incoming_links).joinedload(models.NoteLink.from_note),
        )
        .filter(models.Note.id == note_id)
        .first()
    )


def list_notes(db: Session):
    return (
        db.query(models.Note)
        .options(joinedload(models.Note.tags).joinedload(models.NoteTag.tag))
        .order_by(desc(models.Note.is_pinned), desc(models.Note.updated_at))
        .all()
    )


def list_graph(db: Session):
    notes = (
        db.query(models.Note)
        .options(joinedload(models.Note.tags).joinedload(models.NoteTag.tag))
        .order_by(desc(models.Note.is_pinned), desc(models.Note.updated_at))
        .all()
    )
    links = db.query(models.NoteLink).all()
    return notes, links


def update_note(db: Session, note_id: int, title: str, content: str, is_pinned: bool):
    note = db.query(models.Note).filter(models.Note.id == note_id).first()
    if not note:
        return None
    note.title = title
    note.content = content
    note.updated_at = now_iso()
    note.is_pinned = 1 if is_pinned else 0
    db.commit()
    db.refresh(note)
    _sync_fts(db, note.id, note.title, note.content)
    db.commit()
    return get_note(db, note.id)


def delete_note(db: Session, note_id: int):
    note = db.query(models.Note).filter(models.Note.id == note_id).first()
    if not note:
        return False
    db.delete(note)
    db.commit()
    db.execute(text("DELETE FROM notes_fts WHERE rowid = :id"), {"id": note_id})
    db.commit()
    return True


def add_tag_to_note(db: Session, note_id: int, tag_name: str):
    note = db.query(models.Note).filter(models.Note.id == note_id).first()
    if not note:
        return None
    clean = tag_name.strip().lower()
    tag = db.query(models.Tag).filter(models.Tag.name == clean).first()
    if not tag:
        tag = models.Tag(name=clean)
        db.add(tag)
        db.commit()
        db.refresh(tag)
    existing = db.query(models.NoteTag).filter_by(note_id=note_id, tag_id=tag.id).first()
    if not existing:
        db.add(models.NoteTag(note_id=note_id, tag_id=tag.id))
        note.updated_at = now_iso()
        db.commit()
    return get_note(db, note_id)


def remove_tag_from_note(db: Session, note_id: int, tag_name: str):
    clean = tag_name.strip().lower()
    tag = db.query(models.Tag).filter(models.Tag.name == clean).first()
    if not tag:
        return get_note(db, note_id)
    note_tag = db.query(models.NoteTag).filter_by(note_id=note_id, tag_id=tag.id).first()
    if not note_tag:
        return get_note(db, note_id)
    db.delete(note_tag)
    note = db.query(models.Note).filter(models.Note.id == note_id).first()
    if note:
        note.updated_at = now_iso()
    db.commit()
    return get_note(db, note_id)


def create_link(db: Session, from_note_id: int, to_note_id: int, relation: str):
    if from_note_id == to_note_id:
        return "self"
    from_note = db.query(models.Note).filter(models.Note.id == from_note_id).first()
    to_note = db.query(models.Note).filter(models.Note.id == to_note_id).first()
    if not from_note or not to_note:
        return None
    existing = db.query(models.NoteLink).filter_by(
        from_note_id=from_note_id,
        to_note_id=to_note_id,
        relation=relation,
    ).first()
    if existing:
        return existing
    link = models.NoteLink(from_note_id=from_note_id, to_note_id=to_note_id, relation=relation)
    db.add(link)
    from_note.updated_at = now_iso()
    db.commit()
    db.refresh(link)
    return link


def remove_link(db: Session, link_id: int):
    link = db.query(models.NoteLink).filter(models.NoteLink.id == link_id).first()
    if not link:
        return False
    db.delete(link)
    db.commit()
    return True


def search_notes(db: Session, query: str):
    rows = db.execute(
        text(
            """
            SELECT n.id, n.title, n.updated_at, n.is_pinned
            FROM notes_fts f
            JOIN notes n ON n.id = f.rowid
            WHERE notes_fts MATCH :query
            ORDER BY n.is_pinned DESC, bm25(notes_fts), n.updated_at DESC
            """
        ),
        {"query": query},
    ).fetchall()
    return rows

