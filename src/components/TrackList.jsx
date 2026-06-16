import { useState, useEffect, useCallback, useRef } from 'react'
import { formatTime } from '../utils/audioUtils.js'

function baseName(filename) {
  return filename.replace(/\.[^.]+$/, '')
}

function sanitize(name) {
  return name.trim().replace(/[/\\:*?"<>|]/g, '_') || 'track'
}

export default function TrackList({ tracks, fileName, formatLabel }) {
  const ext = tracks[0]?.ext ?? 'wav'
  const base = baseName(fileName)

  const [names, setNames] = useState([])
  const [editing, setEditing] = useState(null)
  const [editVal, setEditVal] = useState('')
  const inputRef = useRef(null)

  // Reset names when tracks change
  useEffect(() => {
    setNames(tracks.map((_, i) => `${base} — Track ${String(i + 1).padStart(2, '0')}`))
    setEditing(null)
  }, [tracks, base])

  useEffect(() => {
    if (editing !== null) inputRef.current?.select()
  }, [editing])

  const startEdit = useCallback((i) => {
    setEditing(i)
    setEditVal(names[i])
  }, [names])

  const commitEdit = useCallback(() => {
    if (editing === null) return
    const trimmed = editVal.trim()
    if (trimmed) setNames(prev => prev.map((n, i) => i === editing ? trimmed : n))
    setEditing(null)
  }, [editing, editVal])

  const cancelEdit = useCallback(() => setEditing(null), [])

  const downloadAll = useCallback(() => {
    tracks.forEach((track, i) => {
      setTimeout(() => {
        const a = document.createElement('a')
        a.href = track.url
        a.download = `${sanitize(names[i] ?? base)}.${ext}`
        a.click()
      }, i * 350)
    })
  }, [tracks, names, base, ext])

  return (
    <div className="track-list">
      <div className="track-list-header">
        <span>{tracks.length} tracks · {formatLabel}</span>
        <button className="btn-dl-all" onClick={downloadAll}>⬇ Download all</button>
      </div>

      {tracks.map((track, i) => (
        <div key={i} className="track-item">
          <div className="track-number">{i + 1}</div>

          <div className="track-info">
            {editing === i ? (
              <input
                ref={inputRef}
                className="track-name-input"
                value={editVal}
                onChange={e => setEditVal(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
                  if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
                }}
              />
            ) : (
              <div
                className="track-name editable"
                onClick={() => startEdit(i)}
                title="Click to rename"
              >
                {names[i] ?? ''}
                <span className="edit-hint">✎</span>
              </div>
            )}
            <div className="track-meta">
              {formatTime(track.start)} → {formatTime(track.end)} · {formatTime(track.duration)}
            </div>
          </div>

          <a
            className="btn-dl-track"
            href={track.url}
            download={`${sanitize(names[i] ?? base)}.${ext}`}
          >
            ⬇ {ext.toUpperCase()}
          </a>
        </div>
      ))}
    </div>
  )
}
