import { useState, useCallback, useRef, useEffect } from 'react'
import UploadZone from './components/UploadZone.jsx'
import WaveformEditor from './components/WaveformEditor.jsx'
import TrackList from './components/TrackList.jsx'
import { sliceToWAV16, sliceToWAV24, sliceToMP3, resampleSegment } from './utils/audioUtils.js'
import { dbPut, dbGet, dbDel } from './utils/db.js'

const FORMATS = [
  { id: 'mp3_320', label: 'MP3 320',   ext: 'mp3', mime: 'audio/mpeg' },
  { id: 'wav_24', label: 'WAV 24-bit', ext: 'wav', mime: 'audio/wav'  },
  { id: 'wav_16', label: 'WAV 16-bit', ext: 'wav', mime: 'audio/wav'  },
]

const SS_MARKERS = 'sm_markers'
const LS_FORMAT  = 'sm_format'

export default function App() {
  const [file, setFile]                   = useState(null)
  const [markerTimes, setMarkerTimes]     = useState([])
  const [restoredMarkers, setRestoredMarkers] = useState([]) // used only on session restore
  const [splitTracks, setSplitTracks]     = useState([])
  const [isSplitting, setIsSplitting]     = useState(false)
  const [splitProgress, setSplitProgress] = useState(0)
  const [splitStatus, setSplitStatus]     = useState('')
  const [format, setFormat]               = useState('wav_16')
  const [loading, setLoading]             = useState(true)
  const splitTracksRef = useRef([])

  // ── Restore session on mount ─────────────────────────────────────────
  useEffect(() => {
    const restore = async () => {
      try {
        const savedFormat = localStorage.getItem(LS_FORMAT) || 'wav_16'
        setFormat(savedFormat)

        const savedFile = await dbGet('file')
        if (savedFile) {
          const savedMarkers = JSON.parse(sessionStorage.getItem(SS_MARKERS) || '[]')
          setRestoredMarkers(savedMarkers)
          setFile(savedFile)
        }
      } catch (e) {
        console.warn('Session restore failed:', e)
      } finally {
        setLoading(false)
      }
    }
    restore()
  }, [])

  // ── File upload ──────────────────────────────────────────────────────
  const handleFileUpload = useCallback(async (f) => {
    splitTracksRef.current.forEach(t => URL.revokeObjectURL(t.url))
    splitTracksRef.current = []
    setSplitTracks([])
    setMarkerTimes([])
    setRestoredMarkers([])
    sessionStorage.removeItem(SS_MARKERS)
    setFile(f)
    try { await dbPut('file', f) } catch (e) { console.warn('IDB save failed:', e) }
  }, [])

  // ── Markers ──────────────────────────────────────────────────────────
  const handleMarkersChange = useCallback((times) => {
    setMarkerTimes(times)
    setSplitTracks([])
    splitTracksRef.current.forEach(t => URL.revokeObjectURL(t.url))
    splitTracksRef.current = []
    sessionStorage.setItem(SS_MARKERS, JSON.stringify(times))
  }, [])

  // ── Format picker ────────────────────────────────────────────────────
  const handleFormatChange = useCallback((id) => {
    setFormat(id)
    setSplitTracks([])
    splitTracksRef.current.forEach(t => URL.revokeObjectURL(t.url))
    splitTracksRef.current = []
    localStorage.setItem(LS_FORMAT, id)
  }, [])

  // ── Split ────────────────────────────────────────────────────────────
  const handleSplit = useCallback(async () => {
    if (!file || markerTimes.length === 0) return
    setIsSplitting(true)
    setSplitProgress(0)
    setSplitStatus('Decoding…')

    const fmt = FORMATS.find(f => f.id === format)
    const needResample = format !== 'mp3_320'

    try {
      const arrayBuffer = await file.arrayBuffer()
      const ctx = new AudioContext()
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
      ctx.close()

      const willResample = needResample && audioBuffer.sampleRate !== 44100
      const points = [0, ...markerTimes, audioBuffer.duration]
      const total = points.length - 1
      const tracks = []

      for (let i = 0; i < total; i++) {
        const start = points[i]
        const end   = points[i + 1]

        setSplitStatus(
          willResample
            ? `Track ${i + 1}/${total} — resampling to 44.1 kHz…`
            : `Track ${i + 1}/${total} — encoding ${fmt.label}…`
        )
        await new Promise(r => setTimeout(r, 0))

        let buf = audioBuffer, segStart = start, segEnd = end
        if (willResample) {
          buf = await resampleSegment(audioBuffer, start, end, 44100)
          segStart = 0
          segEnd = buf.duration
          setSplitStatus(`Track ${i + 1}/${total} — encoding ${fmt.label}…`)
          await new Promise(r => setTimeout(r, 0))
        }

        let blob
        if (format === 'mp3_320') {
          blob = sliceToMP3(buf, segStart, segEnd, 320)
        } else if (format === 'wav_24') {
          blob = new Blob([sliceToWAV24(buf, segStart, segEnd)], { type: fmt.mime })
        } else {
          blob = new Blob([sliceToWAV16(buf, segStart, segEnd)], { type: fmt.mime })
        }

        const url = URL.createObjectURL(blob)
        tracks.push({ start, end, duration: end - start, url, ext: fmt.ext })
        setSplitProgress(Math.round(((i + 1) / total) * 100))
        await new Promise(r => setTimeout(r, 0))
      }

      splitTracksRef.current = tracks
      setSplitTracks(tracks)
      setSplitStatus('')
    } catch (err) {
      console.error('Split failed:', err)
      alert(`Split failed: ${err.message}`)
      setSplitStatus('')
    } finally {
      setIsSplitting(false)
    }
  }, [file, markerTimes, format])

  // ── New file ─────────────────────────────────────────────────────────
  const handleNewFile = useCallback(async () => {
    splitTracksRef.current.forEach(t => URL.revokeObjectURL(t.url))
    splitTracksRef.current = []
    setSplitTracks([])
    setMarkerTimes([])
    setRestoredMarkers([])
    setFile(null)
    sessionStorage.removeItem(SS_MARKERS)
    try { await dbDel('file') } catch {}
  }, [])

  if (loading) return <div className="app-loading">Loading…</div>

  return (
    <div className="app">
      <header className="app-header">
        <h1>SplitMix</h1>
        <p>Upload · Place markers · Split tracks</p>
      </header>

      <main className="app-main">
        {!file ? (
          <UploadZone onUpload={handleFileUpload} />
        ) : (
          <>
            <div className="file-bar">
              <span className="file-name">{file.name}</span>
              <button className="btn-ghost" onClick={handleNewFile}>✕ New file</button>
            </div>

            <WaveformEditor
              key={`${file.name}_${file.size}`}
              file={file}
              onMarkersChange={handleMarkersChange}
              initialMarkers={restoredMarkers}
            />

            <div className="split-bar">
              <div className="format-picker">
                {FORMATS.map(f => (
                  <button
                    key={f.id}
                    className={`btn-fmt ${format === f.id ? 'active' : ''}`}
                    onClick={() => handleFormatChange(f.id)}
                    disabled={isSplitting}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <button
                className="btn-split"
                onClick={handleSplit}
                disabled={isSplitting || markerTimes.length === 0}
              >
                {isSplitting
                  ? `${splitProgress}%`
                  : markerTimes.length === 0
                    ? 'Place markers first'
                    : `Split into ${markerTimes.length + 1} tracks`}
              </button>

              {isSplitting && (
                <div className="split-status-wrap">
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${splitProgress}%` }} />
                  </div>
                  <span className="split-status">{splitStatus}</span>
                </div>
              )}
            </div>

            {splitTracks.length > 0 && (
              <TrackList
                tracks={splitTracks}
                fileName={file.name}
                formatLabel={FORMATS.find(f => f.id === format)?.label}
              />
            )}
          </>
        )}
      </main>
    </div>
  )
}
