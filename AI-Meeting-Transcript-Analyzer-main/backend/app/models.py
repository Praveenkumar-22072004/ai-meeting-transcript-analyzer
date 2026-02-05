from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, Float, ForeignKey, JSON
from sqlalchemy.orm import relationship

from app.database import Base


class Meeting(Base):
    __tablename__ = "meetings"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    transcript = Column(Text, nullable=False)
    summary = Column(Text, nullable=True)
    key_points = Column(JSON, default=list)
    decisions = Column(JSON, default=list)
    todos = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)

    speaker_segments = relationship(
        "SpeakerSegment", back_populates="meeting", cascade="all, delete-orphan"
    )


class SpeakerSegment(Base):
    __tablename__ = "speaker_segments"

    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id", ondelete="CASCADE"))
    speaker = Column(String, default="Speaker 1")
    text = Column(Text, nullable=False)
    start_time = Column(Float, nullable=True)
    end_time = Column(Float, nullable=True)

    meeting = relationship("Meeting", back_populates="speaker_segments")
