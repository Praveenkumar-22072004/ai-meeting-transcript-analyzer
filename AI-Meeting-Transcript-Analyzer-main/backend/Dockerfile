FROM python:3.10-slim

# Install system dependencies (ffmpeg is required by Whisper)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . .

# Railway routes traffic using $PORT
ENV PORT=8000
EXPOSE 8000

CMD ["python", "run.py"]
