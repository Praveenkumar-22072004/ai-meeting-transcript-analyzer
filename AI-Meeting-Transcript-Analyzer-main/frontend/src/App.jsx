import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import './styles.css'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const SectionCard = ({ title, children }) => (
  <div className="card">
    <div className="card-header">
      <div className="pill" />
      <h3>{title}</h3>
    </div>
    {children}
  </div>
)

const BulletList = ({ items, emptyLabel = 'Nothing yet' }) => (
  <ul className="bullet-list">
    {items && items.length
      ? items.map((item, idx) => (
          <li key={idx}>
            <span className="dot" />
            <span>{item}</span>
          </li>
        ))
      : <li className="muted">{emptyLabel}</li>}
  </ul>
)

const SpeakerSegments = ({ segments }) => (
  <div className="segments">
    {segments && segments.length ? (
      segments.map(seg => (
        <div key={seg.id || `${seg.start_time}-${seg.text}` } className="segment">
          <div className="segment-meta">
            <span className="segment-speaker">{seg.speaker}</span>
            {(seg.start_time !== undefined && seg.end_time !== undefined) && (
              <span className="segment-time">
                {seg.start_time?.toFixed(1)}s → {seg.end_time?.toFixed(1)}s
              </span>
            )}
          </div>
          <p>{seg.text}</p>
        </div>
      ))
    ) : (
      <p className="muted">No speaker turns detected.</p>
    )}
  </div>
)

function App() {
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [meeting, setMeeting] = useState(null)
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const api = useMemo(() => axios.create({ baseURL: API_BASE }), [])

  const fetchHistory = async () => {
    try {
      setLoadingHistory(true)
      const res = await api.get('/api/meetings')
      setHistory(res.data)
    } catch (err) {
      console.error(err)
      setError('Unable to load previous meetings')
    } finally {
      setLoadingHistory(false)
    }
  }

  useEffect(() => {
    fetchHistory()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleUpload = async () => {
    if (!file) {
      setError('Please select an audio, video, or text file')
      return
    }
    setError('')
    setUploading(true)
    setProgress(0)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await api.post('/api/meetings/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: ({ loaded, total }) => {
          if (!total) return
          setProgress(Math.round((loaded / total) * 100))
        },
      })
      setMeeting(res.data)
      setHistory(prev => [res.data, ...prev])
    } catch (err) {
      console.error(err)
      const message = err.response?.data?.detail || 'Upload failed'
      setError(message)
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }

  const selectFromHistory = async (id) => {
    try {
      const res = await api.get(`/api/meetings/${id}`)
      setMeeting(res.data)
      setError('')
    } catch (err) {
      console.error(err)
      setError('Unable to load meeting details')
    }
  }

  return (
    <div className="page">
      <div className="grid">
        <header className="hero">
          <div>
            <p className="eyebrow">AI Meeting Transcript Analyzer</p>
            <h1>Turn raw calls into ready-to-share notes.</h1>
            <p className="subtitle">
              Upload .mp3, .mp4, or .txt and get transcripts, speaker attributions,
              summaries, decisions, and action items in seconds.
            </p>
            <div className="upload-bar">
              <label className="upload-label">
                <input
                  type="file"
                  accept=".mp3,.mp4,.wav,.m4a,.aac,.flac,.txt"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                {file ? file.name : 'Choose a file'}
              </label>
              <button className="primary" onClick={handleUpload} disabled={uploading}>
                {uploading ? 'Processing…' : 'Upload & Analyze'}
              </button>
            </div>
            {uploading && <div className="progress"><div style={{ width: `${progress}%` }} /></div>}
            {error && <p className="error">{error}</p>}
          </div>
          <div className="glass">
            <p className="muted">Latest files</p>
            {loadingHistory ? (
              <p className="muted">Loading…</p>
            ) : history.length ? (
              <ul className="history">
                {history.map(item => (
                  <li key={item.id}>
                    <button onClick={() => selectFromHistory(item.id)}>
                      <span className="history-title">{item.filename}</span>
                      <span className="history-sub">{new Date(item.created_at).toLocaleString()}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No uploads yet.</p>
            )}
          </div>
        </header>

        <main className="content">
          {meeting ? (
            <div className="content-grid">
              <SectionCard title="Summary">
                <p className="body-text">{meeting.summary || 'No summary yet.'}</p>
              </SectionCard>

              <SectionCard title="Key Points">
                <BulletList items={meeting.key_points} emptyLabel="No points detected" />
              </SectionCard>

              <SectionCard title="Decisions">
                <BulletList items={meeting.decisions} emptyLabel="No decisions captured" />
              </SectionCard>

              <SectionCard title="To-do List">
                <BulletList items={meeting.todos} emptyLabel="No action items" />
              </SectionCard>

              <SectionCard title="Speaker Timeline">
                <SpeakerSegments segments={meeting.speaker_segments} />
              </SectionCard>

              <SectionCard title="Full Transcript">
                <div className="transcript">
                  <pre>{meeting.transcript}</pre>
                </div>
              </SectionCard>
            </div>
          ) : (
            <div className="placeholder">
              <p className="muted">Upload a file to see insights.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
