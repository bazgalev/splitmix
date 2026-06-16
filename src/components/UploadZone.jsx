import { useRef, useState, useCallback } from 'react'

const ACCEPTED = ['audio/mpeg', 'audio/wav', 'audio/wave', 'audio/x-wav', 'audio/mp3', 'audio/ogg', 'audio/flac', 'audio/aac']

export default function UploadZone({ onUpload }) {
  const inputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)

  const handleFile = useCallback((file) => {
    if (!file) return
    onUpload(file)
  }, [onUpload])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const onDragOver = useCallback((e) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const onDragLeave = useCallback(() => setDragOver(false), [])

  return (
    <div
      className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        onChange={e => handleFile(e.target.files[0])}
      />
      <div className="upload-icon">🎵</div>
      <h2>Drop audio file here</h2>
      <p>or click to browse · MP3, WAV, OGG, FLAC, AAC</p>
    </div>
  )
}
