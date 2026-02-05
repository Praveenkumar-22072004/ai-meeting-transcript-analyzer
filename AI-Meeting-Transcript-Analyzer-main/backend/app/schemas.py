from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class SpeakerSegmentBase(BaseModel):
    speaker: str
    text: str
    start_time: Optional[float] = None
    end_time: Optional[float] = None


class SpeakerSegmentCreate(SpeakerSegmentBase):
    pass


class SpeakerSegment(SpeakerSegmentBase):
    id: int

    class Config:
        orm_mode = True


class MeetingBase(BaseModel):
    filename: str
    transcript: str
    summary: Optional[str] = None
    key_points: List[str] = Field(default_factory=list)
    decisions: List[str] = Field(default_factory=list)
    todos: List[str] = Field(default_factory=list)


class MeetingCreate(MeetingBase):
    speaker_segments: List[SpeakerSegmentCreate] = Field(default_factory=list)


class Meeting(MeetingBase):
    id: int
    created_at: datetime
    speaker_segments: List[SpeakerSegment] = Field(default_factory=list)

    class Config:
        orm_mode = True
