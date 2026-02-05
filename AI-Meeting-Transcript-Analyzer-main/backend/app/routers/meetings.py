import os
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app import schemas, models
from app.database import get_db
from app import services

router = APIRouter(prefix="/meetings", tags=["meetings"])

ALLOWED_EXTENSIONS = {".mp3", ".mp4", ".wav", ".m4a", ".aac", ".flac", ".txt"}


@router.post("/upload", response_model=schemas.Meeting)
def upload_meeting(file: UploadFile = File(...), db: Session = Depends(get_db)):
    suffix = os.path.splitext(file.filename)[1].lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported file type")

    temp_path, suffix = services.handle_upload(file)

    try:
        if suffix == ".txt":
            transcript = services.read_text_file(temp_path)
            segments = [{"text": t} for t in transcript.split(". ") if t.strip()]
        else:
            transcript, segments = services.transcribe_file(temp_path)

        if not transcript:
            raise HTTPException(status_code=500, detail="Transcription produced empty text")

        summary = services.simple_summarize(transcript)
        key_points = services.extract_bullets(transcript)
        decisions = services.extract_bullets(transcript)
        todos = services.extract_bullets(transcript)
        speaker_segments = services.infer_speakers(segments)

        meeting = models.Meeting(
            filename=file.filename,
            transcript=transcript,
            summary=summary,
            key_points=key_points,
            decisions=decisions,
            todos=todos,
        )
        db.add(meeting)
        db.flush()

        for seg in speaker_segments:
            db.add(
                models.SpeakerSegment(
                    meeting_id=meeting.id,
                    speaker=seg["speaker"],
                    text=seg["text"],
                    start_time=seg.get("start_time"),
                    end_time=seg.get("end_time"),
                )
            )

        db.commit()
        db.refresh(meeting)
        return meeting
    except services.TranscriptionError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload processing failed: {e}")
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass


@router.get("/", response_model=List[schemas.Meeting])
def list_meetings(db: Session = Depends(get_db)):
    return db.query(models.Meeting).order_by(models.Meeting.created_at.desc()).all()


@router.get("/{meeting_id}", response_model=schemas.Meeting)
def get_meeting(meeting_id: int, db: Session = Depends(get_db)):
    meeting = db.query(models.Meeting).filter(models.Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return meeting
