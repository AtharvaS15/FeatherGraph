from typing import List

from pydantic import BaseModel, Field


class NoteCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = ""


class NoteUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = ""
    is_pinned: bool = False


class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)


class LinkCreate(BaseModel):
    from_note_id: int
    to_note_id: int
    relation: str = Field(default="related", min_length=1, max_length=50)


class NoteSummary(BaseModel):
    id: int
    title: str
    updated_at: str
    is_pinned: bool
    tags: List[str]


class LinkOut(BaseModel):
    id: int
    note_id: int
    title: str
    relation: str


class NoteOut(BaseModel):
    id: int
    title: str
    content: str
    created_at: str
    updated_at: str
    is_pinned: bool
    tags: List[str]
    outgoing_links: List[LinkOut]
    incoming_links: List[LinkOut]
