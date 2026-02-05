import os
import shutil
import tempfile
from typing import List, Tuple

import whisper


class TranscriptionError(Exception):
    pass


def load_model():
    """Lazy-load Whisper model (base size by default)"""
    model_size = os.getenv("WHISPER_MODEL", "base")
    return whisper.load_model(model_size)


def transcribe_file(upload_path: str) -> Tuple[str, List[dict]]:
    """
    Transcribe an audio/video file using Whisper.
    Returns transcript text and list of segments with start/end/text.
    """
    ffmpeg_path = os.getenv("FFMPEG_PATH")
    if ffmpeg_path:
        ffmpeg_dir = os.path.dirname(ffmpeg_path)
        if ffmpeg_dir and ffmpeg_dir not in os.environ.get("PATH", ""):
            os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")

    if shutil.which("ffmpeg") is None:
        raise TranscriptionError(
            "Whisper transcription failed: ffmpeg executable not found. "
            "Install ffmpeg and add it to PATH (Windows), or set FFMPEG_PATH to the full path of ffmpeg.exe."
        )

    model = load_model()
    try:
        result = model.transcribe(upload_path)
    except Exception as e:
        msg = str(e)
        hint = ""
        if "ffmpeg" in msg.lower() or "av" in msg.lower() or "decoder" in msg.lower() or "winerror 2" in msg.lower():
            hint = " (Hint: install ffmpeg and make sure it is on PATH to transcribe .mp4/.m4a/.aac)"
        raise TranscriptionError(f"Whisper transcription failed: {msg}{hint}") from e

    text = result.get("text", "").strip()
    segments = result.get("segments", [])
    return text, segments


def read_text_file(upload_path: str) -> str:
    with open(upload_path, "r", encoding="utf-8", errors="ignore") as f:
        return f.read()


def simple_summarize(text: str, max_sentences: int = 3) -> str:
    sentences = [s.strip() for s in text.replace("\n", " ").split(".") if s.strip()]
    return ". ".join(sentences[:max_sentences]) + ("." if sentences else "")


def extract_bullets(text: str, max_items: int = 5) -> List[str]:
    sentences = [s.strip() for s in text.replace("\n", " ").split(".") if s.strip()]
    return sentences[:max_items]


def infer_speakers(segments: List[dict]) -> List[dict]:
    """Assign simple alternating speaker labels if diarization not available."""
    labeled = []
    for idx, seg in enumerate(segments):
        speaker = f"Speaker {idx % 2 + 1}"
        labeled.append(
            {
                "speaker": speaker,
                "text": seg.get("text", "").strip(),
                "start_time": seg.get("start"),
                "end_time": seg.get("end"),
            }
        )
    return labeled


def handle_upload(file) -> Tuple[str, str]:
    """Save uploaded file to temp path and return path + extension"""
    suffix = os.path.splitext(file.filename)[1].lower()
    fd, temp_path = tempfile.mkstemp(suffix=suffix)
    with os.fdopen(fd, "wb") as out:
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)
    return temp_path, suffix
