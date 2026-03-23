from sqlalchemy import Column, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from .db import Base


class Note(Base):
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False, index=True)
    content = Column(Text, nullable=False, default="")
    is_pinned = Column(Integer, nullable=False, default=0)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

    tags = relationship("NoteTag", back_populates="note", cascade="all, delete-orphan")
    outgoing_links = relationship(
        "NoteLink",
        foreign_keys="NoteLink.from_note_id",
        back_populates="from_note",
        cascade="all, delete-orphan",
    )
    incoming_links = relationship(
        "NoteLink",
        foreign_keys="NoteLink.to_note_id",
        back_populates="to_note",
        cascade="all, delete-orphan",
    )


class Tag(Base):
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True, index=True)

    notes = relationship("NoteTag", back_populates="tag", cascade="all, delete-orphan")


class NoteTag(Base):
    __tablename__ = "note_tags"
    __table_args__ = (UniqueConstraint("note_id", "tag_id", name="uq_note_tag"),)

    id = Column(Integer, primary_key=True)
    note_id = Column(Integer, ForeignKey("notes.id", ondelete="CASCADE"), nullable=False)
    tag_id = Column(Integer, ForeignKey("tags.id", ondelete="CASCADE"), nullable=False)

    note = relationship("Note", back_populates="tags")
    tag = relationship("Tag", back_populates="notes")


class NoteLink(Base):
    __tablename__ = "note_links"
    __table_args__ = (
        UniqueConstraint("from_note_id", "to_note_id", "relation", name="uq_note_link"),
    )

    id = Column(Integer, primary_key=True)
    from_note_id = Column(Integer, ForeignKey("notes.id", ondelete="CASCADE"), nullable=False)
    to_note_id = Column(Integer, ForeignKey("notes.id", ondelete="CASCADE"), nullable=False)
    relation = Column(String, nullable=False, default="related")

    from_note = relationship("Note", foreign_keys=[from_note_id], back_populates="outgoing_links")
    to_note = relationship("Note", foreign_keys=[to_note_id], back_populates="incoming_links")
