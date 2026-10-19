import os
import re
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


def split_sentences(text: str) -> List[str]:
    """Extract individual clean, complete sentences from text."""
    if not text:
        return []
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    sentences = []
    for line in lines:
        parts = re.split(r'(?<=[.!?])\s+(?=[A-Z0-9#\-\*])', line)
        for part in parts:
            cleaned = part.strip()
            cleaned = re.sub(r'^(?:[-*•]|\d+[.)])\s*', '', cleaned).strip()
            if len(cleaned) > 8:
                sentences.append(cleaned)
    return sentences


def simple_summarize(text: str, max_sentences: int = 3) -> str:
    """Generate a coherent, high-signal summary of the transcript."""
    sentences = split_sentences(text)
    if not sentences:
        return "No summary could be generated."

    filler_patterns = re.compile(
        r'^(?:hello|hi|hey|good morning|good afternoon|can you hear me|thanks for coming|welcome everyone|welcome|thanks)\b',
        re.IGNORECASE,
    )
    content_sentences = [s for s in sentences if not filler_patterns.match(s)]
    if not content_sentences:
        content_sentences = sentences

    priority_keywords = re.compile(
        r'\b(?:objective|goal|launch|deploy|project|discuss|reviewed|agreed|decided|feature|status|update|timeline|quarter|sprint|release|system)\b',
        re.IGNORECASE,
    )
    scored = []
    for idx, s in enumerate(content_sentences):
        score = 0
        if priority_keywords.search(s):
            score += 2
        if 20 <= len(s) <= 180:
            score += 1
        if idx < 4:
            score += 1
        scored.append((score, idx, s))

    scored.sort(key=lambda x: (-x[0], x[1]))
    selected = sorted(scored[:max_sentences], key=lambda x: x[1])
    chosen = [item[2] for item in selected]

    res = " ".join(chosen)
    if not res.endswith((".", "!", "?")):
        res += "."
    return res


def extract_key_points(text: str, max_items: int = 5) -> List[str]:
    """Extract key discussion highlights from the meeting."""
    sentences = split_sentences(text)
    if not sentences:
        return []

    filler_patterns = re.compile(
        r'^(?:hello|hi|good morning|thanks|can everyone see|welcome)\b', re.IGNORECASE
    )
    candidates = [s for s in sentences if not filler_patterns.match(s)]
    if not candidates:
        candidates = sentences

    key_regex = re.compile(
        r'\b(?:review|update|progress|milestone|feature|architecture|metric|performance|service|client|backend|frontend|design|system|database|goal|priority)\b',
        re.IGNORECASE,
    )
    matches = [s for s in candidates if key_regex.search(s)]
    unique_matches = []
    seen = set()
    for s in matches + candidates:
        clean = s.rstrip(".")
        if clean.lower() not in seen and len(clean) > 15:
            seen.add(clean.lower())
            unique_matches.append(clean)
        if len(unique_matches) >= max_items:
            break
    return unique_matches


def extract_decisions(text: str, max_items: int = 5) -> List[str]:
    """Extract decisions, agreements, and resolutions from the meeting."""
    sentences = split_sentences(text)
    if not sentences:
        return []

    decision_regex = re.compile(
        r'\b(?:decided|agreed|agreed to|approve|approved|chosen|selected|resolved|settled|conclusion|consensus|signed off|confirmed|opted to|will use|decision)\b',
        re.IGNORECASE,
    )
    matches = [s for s in sentences if decision_regex.search(s)]
    unique = []
    seen = set()
    for s in matches:
        clean = s.rstrip(".")
        if clean.lower() not in seen:
            seen.add(clean.lower())
            unique.append(clean)
        if len(unique) >= max_items:
            break

    if not unique:
        fallback_regex = re.compile(
            r'\b(?:plan to|scheduled|committed to|will finalize|ready to)\b', re.IGNORECASE
        )
        for s in sentences:
            if fallback_regex.search(s):
                clean = s.rstrip(".")
                if clean.lower() not in seen:
                    seen.add(clean.lower())
                    unique.append(clean)
            if len(unique) >= max_items:
                break

    return unique


def extract_todos(text: str, max_items: int = 5) -> List[str]:
    """Extract actionable to-dos and task assignments."""
    sentences = split_sentences(text)
    if not sentences:
        return []

    todo_regex = re.compile(
        r'\b(?:will|need to|needs to|action item|todo|to-do|assigned|assign|deadline|by friday|by monday|by next|follow up|task|deliver|prepare|implement|deploy|review by)\b',
        re.IGNORECASE,
    )
    matches = [s for s in sentences if todo_regex.search(s)]
    unique = []
    seen = set()
    for s in matches:
        clean = s.rstrip(".")
        if clean.lower() not in seen:
            seen.add(clean.lower())
            unique.append(clean)
        if len(unique) >= max_items:
            break

    return unique


def parse_text_into_segments(text: str) -> List[dict]:
    """
    Parse a text file into speaker segments.
    Detects inline speaker labels (e.g., 'Alice: hello') or splits by coherent turns.
    """
    if not text:
        return []
    lines = [
        line.strip()
        for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
        if line.strip()
    ]
    segments = []

    speaker_pattern = re.compile(r'^(?:\[[\d:.]+\]\s*)?([A-Za-z0-9_\s]{1,25})\s*:\s*(.+)$')

    has_speaker_labels = False
    for line in lines[:20]:
        if speaker_pattern.match(line):
            has_speaker_labels = True
            break

    if has_speaker_labels:
        current_speaker = "Speaker 1"
        current_text = []
        for line in lines:
            m = speaker_pattern.match(line)
            if m:
                if current_text:
                    segments.append(
                        {
                            "speaker": current_speaker,
                            "text": " ".join(current_text),
                            "start_time": None,
                            "end_time": None,
                        }
                    )
                    current_text = []
                current_speaker = m.group(1).strip()
                current_text.append(m.group(2).strip())
            else:
                current_text.append(line)
        if current_text:
            segments.append(
                {
                    "speaker": current_speaker,
                    "text": " ".join(current_text),
                    "start_time": None,
                    "end_time": None,
                }
            )
    else:
        sentences = split_sentences(text)
        chunk_size = 2
        for i in range(0, len(sentences), chunk_size):
            chunk = sentences[i : i + chunk_size]
            speaker_idx = (i // chunk_size) % 2 + 1
            segments.append(
                {
                    "speaker": f"Speaker {speaker_idx}",
                    "text": " ".join(chunk),
                    "start_time": None,
                    "end_time": None,
                }
            )

    return segments


def infer_speakers(segments: List[dict]) -> List[dict]:
    """Assign clean speaker labels and format segments."""
    labeled = []
    for idx, seg in enumerate(segments):
        speaker = seg.get("speaker") or f"Speaker {idx % 2 + 1}"
        labeled.append(
            {
                "speaker": speaker,
                "text": seg.get("text", "").strip(),
                "start_time": seg.get("start") if "start" in seg else seg.get("start_time"),
                "end_time": seg.get("end") if "end" in seg else seg.get("end_time"),
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
