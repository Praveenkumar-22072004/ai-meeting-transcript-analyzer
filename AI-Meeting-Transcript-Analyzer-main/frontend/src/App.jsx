import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import './styles.css'

const getApiBase = () => {
  let url = (import.meta.env.VITE_API_URL || '').trim()
  if (url) {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url
    }
    return url.replace(/\/+$/, '')
  }
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'http://localhost:8001'
  }
  return ''
}

const API_BASE = getApiBase()

const formatTime = (seconds) => {
  if (seconds === undefined || seconds === null) return ''
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

const formatFileSize = (bytes) => {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const SectionCard = ({ title, icon, badge, actions, children }) => (
  <div className="card">
    <div className="card-header">
      <div className="card-header-left">
        <div className="pill" />
        {icon && <span className="card-icon">{icon}</span>}
        <h3>{title}</h3>
        {badge !== undefined && <span className="card-badge">{badge}</span>}
      </div>
      {actions && <div className="card-actions">{actions}</div>}
    </div>
    {children}
  </div>
)

const BulletList = ({ items, emptyLabel = 'Nothing detected' }) => (
  <ul className="bullet-list">
    {Array.isArray(items) && items.length ? (
      items.map((item, idx) => (
        <li key={idx}>
          <span className="dot" />
          <span>{item}</span>
        </li>
      ))
    ) : (
      <li className="muted">{emptyLabel}</li>
    )}
  </ul>
)

const SpeakerSegments = ({ segments }) => {
  return (
    <div className="segments">
      {Array.isArray(segments) && segments.length ? (
        segments.map((seg, idx) => {
          const isSpeaker1 = seg.speaker.toLowerCase().includes('1')
          const timeRange =
            seg.start_time !== undefined && seg.end_time !== undefined && seg.start_time !== null
              ? `${formatTime(seg.start_time)} → ${formatTime(seg.end_time)}`
              : ''

          return (
            <div
              key={seg.id || `${seg.start_time}-${idx}`}
              className={`segment ${isSpeaker1 ? 'segment-spk1' : 'segment-spk2'}`}
            >
              <div className="segment-meta">
                <span className={`segment-speaker-badge ${isSpeaker1 ? 'badge-spk1' : 'badge-spk2'}`}>
                  {seg.speaker}
                </span>
                {timeRange && <span className="segment-time">{timeRange}</span>}
              </div>
              <p>{seg.text}</p>
            </div>
          )
        })
      ) : (
        <p className="muted">No speaker turns detected.</p>
      )}
    </div>
  )
}

function App() {
  const [file, setFile] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [meeting, setMeeting] = useState(null)
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [copied, setCopied] = useState(false)

  const api = useMemo(() => axios.create({ baseURL: API_BASE }), [])

  const fetchHistory = async () => {
    try {
      setLoadingHistory(true)
      const res = await api.get('/api/meetings')
      if (Array.isArray(res.data)) {
        setHistory(res.data)
        // Select the most recent meeting by default if none is selected
        if (!meeting && res.data.length > 0) {
          setMeeting(res.data[0])
        }
      } else {
        setHistory([])
      }
    } catch (err) {
      console.error(err)
      setHistory([])
    } finally {
      setLoadingHistory(false)
    }
  }

  useEffect(() => {
    fetchHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0])
      setError('')
    }
  }

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
      setHistory((prev) => [res.data, ...prev.filter((m) => m.id !== res.data.id)])
      setFile(null)
    } catch (err) {
      console.error(err)
      const message =
        err.response?.data?.detail ||
        (err.code === 'ERR_NETWORK'
          ? 'Backend unavailable: cannot reach API. Please verify the backend is running and VITE_API_URL is configured.'
          : err.message || 'Upload failed')
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

  const handleDelete = async (e, id) => {
    e.stopPropagation()
    if (!window.confirm('Delete this meeting analysis?')) return
    try {
      await api.delete(`/api/meetings/${id}`)
      setHistory((prev) => prev.filter((item) => item.id !== id))
      if (meeting && meeting.id === id) {
        setMeeting((prev) => {
          const remaining = history.filter((item) => item.id !== id)
          return remaining.length > 0 ? remaining[0] : null
        })
      }
    } catch (err) {
      console.error(err)
      setError('Failed to delete meeting')
    }
  }

  const handleCopySummary = () => {
    if (!meeting?.summary) return
    navigator.clipboard.writeText(meeting.summary)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleExportMarkdown = () => {
    if (!meeting) return
    let md = `# Meeting Notes: ${meeting.filename}\n\n`
    md += `*Generated: ${new Date(meeting.created_at).toLocaleString()}*\n\n`
    md += `## Summary\n${meeting.summary || 'N/A'}\n\n`

    md += `## Key Points\n`
    if (Array.isArray(meeting.key_points) && meeting.key_points.length) {
      meeting.key_points.forEach((p) => {
        md += `- ${p}\n`
      })
    } else {
      md += `*None detected.*\n`
    }

    md += `\n## Decisions\n`
    if (Array.isArray(meeting.decisions) && meeting.decisions.length) {
      meeting.decisions.forEach((d) => {
        md += `- ${d}\n`
      })
    } else {
      md += `*None captured.*\n`
    }

    md += `\n## Action Items (To-Dos)\n`
    if (Array.isArray(meeting.todos) && meeting.todos.length) {
      meeting.todos.forEach((t) => {
        md += `- [ ] ${t}\n`
      })
    } else {
      md += `*No action items.*\n`
    }

    md += `\n## Full Transcript\n\n\`\`\`\n${meeting.transcript}\n\`\`\`\n`

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${meeting.filename.replace(/\.[^/.]+$/, '')}_notes.md`
    link.click()
    URL.revokeObjectURL(url)
  }

  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return history
    return history.filter((item) =>
      item.filename.toLowerCase().includes(searchQuery.toLowerCase().trim())
    )
  }, [history, searchQuery])

  return (
    <div className="page">
      <div className="grid">
        <header className="hero">
          <div className="hero-left">
            <div className="brand-header">
              <span className="brand-icon">⚡</span>
              <p className="eyebrow">AI Meeting Transcript Analyzer</p>
            </div>
            <h1>Turn raw calls into ready-to-share notes.</h1>
            <p className="subtitle">
              Upload audio, video (.mp3, .mp4, .wav, .m4a), or notes (.txt). Get precise
              transcripts, speaker turns, executive summaries, decisions, and action items in seconds.
            </p>

            {/* Drag & Drop Upload Zone */}
            <div
              className={`dropzone ${dragActive ? 'dropzone-active' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input
                type="file"
                id="file-input"
                className="hidden-input"
                accept=".mp3,.mp4,.wav,.m4a,.aac,.flac,.txt"
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null)
                  setError('')
                }}
              />
              <div className="dropzone-content">
                <div className="dropzone-icon">📁</div>
                {file ? (
                  <div className="file-selected-box">
                    <div className="file-info">
                      <span className="file-name">{file.name}</span>
                      <span className="file-size">{formatFileSize(file.size)}</span>
                    </div>
                    <button
                      type="button"
                      className="btn-clear"
                      onClick={(e) => {
                        e.stopPropagation()
                        setFile(null)
                      }}
                      title="Remove file"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <label htmlFor="file-input" className="dropzone-prompt">
                    <span className="prompt-highlight">Click to browse</span> or drag and drop your meeting file
                    <span className="prompt-sub">Supports MP3, MP4, WAV, M4A, AAC, FLAC, and TXT</span>
                  </label>
                )}
              </div>

              <div className="upload-actions">
                <button
                  type="button"
                  className="primary"
                  onClick={handleUpload}
                  disabled={uploading || !file}
                >
                  {uploading ? (
                    <span className="btn-loading">
                      <span className="spinner" /> Analyzing… {progress > 0 && `${progress}%`}
                    </span>
                  ) : (
                    'Upload & Analyze'
                  )}
                </button>
              </div>
            </div>

            {uploading && (
              <div className="progress-container">
                <div className="progress">
                  <div style={{ width: `${progress}%` }} />
                </div>
                <span className="progress-label">{progress}% uploaded</span>
              </div>
            )}

            {error && (
              <div className="error-box">
                <span className="error-icon">⚠️</span>
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Previous Meetings Sidebar */}
          <aside className="glass history-card">
            <div className="history-header">
              <h3>Previous Meetings</h3>
              <span className="history-count">{history.length}</span>
            </div>

            {history.length > 3 && (
              <div className="history-search">
                <input
                  type="text"
                  placeholder="Filter meetings…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            )}

            {loadingHistory ? (
              <div className="loading-state">
                <div className="spinner-small" />
                <span>Loading history…</span>
              </div>
            ) : filteredHistory.length ? (
              <ul className="history">
                {filteredHistory.map((item) => {
                  const isSelected = meeting?.id === item.id
                  return (
                    <li key={item.id} className={isSelected ? 'active-history-item' : ''}>
                      <button
                        className="history-btn"
                        onClick={() => selectFromHistory(item.id)}
                      >
                        <div className="history-text">
                          <span className="history-title">{item.filename}</span>
                          <span className="history-sub">
                            {new Date(item.created_at).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="history-delete-btn"
                          title="Delete"
                          onClick={(e) => handleDelete(e, item.id)}
                        >
                          🗑
                        </button>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="muted empty-history">
                {searchQuery ? 'No matching meetings.' : 'No uploads yet.'}
              </p>
            )}
          </aside>
        </header>

        {/* Meeting Details View */}
        <main className="content">
          {meeting ? (
            <div className="meeting-view">
              <div className="meeting-banner">
                <div className="meeting-banner-left">
                  <span className="badge-live">Analysis Ready</span>
                  <h2 className="meeting-headline">{meeting.filename}</h2>
                  <span className="meeting-meta-time">
                    {new Date(meeting.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="meeting-banner-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleCopySummary}
                    title="Copy executive summary"
                  >
                    {copied ? '✓ Copied!' : '📋 Copy Summary'}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleExportMarkdown}
                    title="Export markdown notes"
                  >
                    📥 Export Notes (.md)
                  </button>
                  <button
                    type="button"
                    className="btn-danger-outline"
                    onClick={(e) => handleDelete(e, meeting.id)}
                    title="Delete meeting"
                  >
                    🗑 Delete
                  </button>
                </div>
              </div>

              <div className="content-grid">
                <SectionCard
                  title="Executive Summary"
                  icon="📝"
                  badge="AI Summary"
                  actions={
                    <button className="icon-btn" onClick={handleCopySummary} title="Copy Summary">
                      {copied ? '✓' : '📋'}
                    </button>
                  }
                >
                  <p className="body-text">{meeting.summary || 'No summary available.'}</p>
                </SectionCard>

                <SectionCard
                  title="Key Discussion Points"
                  icon="💡"
                  badge={`${meeting.key_points?.length || 0} items`}
                >
                  <BulletList items={meeting.key_points} emptyLabel="No key points detected" />
                </SectionCard>

                <SectionCard
                  title="Agreements & Decisions"
                  icon="🎯"
                  badge={`${meeting.decisions?.length || 0} captured`}
                >
                  <BulletList items={meeting.decisions} emptyLabel="No decisions captured" />
                </SectionCard>

                <SectionCard
                  title="Action Items & To-Dos"
                  icon="✅"
                  badge={`${meeting.todos?.length || 0} tasks`}
                >
                  <BulletList items={meeting.todos} emptyLabel="No action items detected" />
                </SectionCard>

                <SectionCard
                  title="Speaker Timeline & Diarization"
                  icon="🎙️"
                  badge={`${meeting.speaker_segments?.length || 0} turns`}
                >
                  <SpeakerSegments segments={meeting.speaker_segments} />
                </SectionCard>

                <SectionCard
                  title="Full Raw Transcript"
                  icon="📜"
                  badge={`${meeting.transcript?.length || 0} chars`}
                >
                  <div className="transcript">
                    <pre>{meeting.transcript}</pre>
                  </div>
                </SectionCard>
              </div>
            </div>
          ) : (
            <div className="placeholder">
              <div className="placeholder-icon">🎙️</div>
              <h3>No Meeting Selected</h3>
              <p className="muted">
                Upload an audio, video, or text transcript file above, or select an existing meeting from the sidebar.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
