import { useEffect, useRef, useState, useCallback } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/plugins/regions'
import TimelinePlugin from 'wavesurfer.js/plugins/timeline'
import { formatTime } from '../utils/audioUtils.js'

const MIN_Z = 0.3
const MAX_Z = 400
const sliderToZoom = v => MIN_Z * Math.pow(MAX_Z / MIN_Z, v / 100)
const zoomToSlider = z => Math.round(Math.log(Math.max(MIN_Z, Math.min(MAX_Z, z)) / MIN_Z) / Math.log(MAX_Z / MIN_Z) * 100)

export default function WaveformEditor({ file, onMarkersChange, initialMarkers = [] }) {
  const containerRef = useRef(null)
  const wsRef = useRef(null)
  const wsRegionsRef = useRef(null)
  const regionMapRef = useRef({})
  const markersRef = useRef([])
  const isAddingMarkerRef = useRef(false)
  const addMarkerFnRef = useRef(null)
  const initialMarkersRef = useRef(initialMarkers)

  const [isReady, setIsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isAddingMarker, setIsAddingMarker] = useState(false)
  const [zoom, setZoom] = useState(null) // null = not yet set, let fillParent handle initial render
  const [markers, setMarkers] = useState([])

  useEffect(() => { isAddingMarkerRef.current = isAddingMarker }, [isAddingMarker])

  const syncMarkers = useCallback((next) => {
    const sorted = [...next].sort((a, b) => a.time - b.time)
    markersRef.current = sorted
    setMarkers(sorted)
    onMarkersChange(sorted.map(m => m.time))
  }, [onMarkersChange])

  const addMarker = useCallback((time) => {
    if (!wsRegionsRef.current) return

    const region = wsRegionsRef.current.addRegion({
      start: time,
      end: time + 0.001,
      drag: true,
      resize: false,
      color: 'transparent',
    })

    // Style region.element directly — 'content' prop is a label widget, not a full-height overlay
    const el = region.element
    el.style.cssText += ';border-left:2px solid #ff4081;overflow:visible;z-index:10;cursor:ew-resize;'

    // Wide invisible hit area so user can grab the thin line
    const hit = document.createElement('div')
    hit.style.cssText = 'position:absolute;top:0;left:-8px;width:18px;height:100%;cursor:ew-resize;'
    el.appendChild(hit)

    el.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      e.stopPropagation()
      region.remove()
    })

    regionMapRef.current[region.id] = region

    region.on('update-end', () => {
      syncMarkers(markersRef.current.map(m =>
        m.id === region.id ? { ...m, time: region.start } : m
      ))
    })

    region.on('remove', () => {
      delete regionMapRef.current[region.id]
      syncMarkers(markersRef.current.filter(m => m.id !== region.id))
    })

    syncMarkers([...markersRef.current, { id: region.id, time }])
  }, [syncMarkers])

  useEffect(() => { addMarkerFnRef.current = addMarker }, [addMarker])

  const removeMarkerById = useCallback((id) => {
    regionMapRef.current[id]?.remove()
  }, [])

  const clearAllMarkers = useCallback(() => {
    Object.values(regionMapRef.current).forEach(r => r.remove())
    regionMapRef.current = {}
    markersRef.current = []
    setMarkers([])
    onMarkersChange([])
  }, [onMarkersChange])

  useEffect(() => {
    if (!containerRef.current || !file) return

    const wsRegions = RegionsPlugin.create()
    wsRegionsRef.current = wsRegions

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#3d7fc1',
      progressColor: '#1a5294',
      cursorColor: '#ff4081',
      height: 192,
      normalize: true,
      fillParent: true,
      scrollParent: true,
      plugins: [
        TimelinePlugin.create({
          height: 20,
          style: { fontSize: '10px', color: '#6e7681' },
        }),
        wsRegions,
      ],
    })

    wsRef.current = ws

    ws.on('ready', () => {
      setIsReady(true)
      const dur = ws.getDuration()
      setDuration(dur)
      const w = containerRef.current?.clientWidth ?? 1000
      setZoom(Math.max(MIN_Z, w / dur))
      // restore markers from saved session
      const saved = initialMarkersRef.current
      if (saved.length > 0) {
        saved.forEach(time => addMarkerFnRef.current?.(time))
        initialMarkersRef.current = [] // consume once
      }
    })
    ws.on('audioprocess', t => setCurrentTime(t))
    ws.on('seeking', t => setCurrentTime(t))
    ws.on('play', () => setIsPlaying(true))
    ws.on('pause', () => setIsPlaying(false))
    ws.on('finish', () => setIsPlaying(false))
    ws.on('interaction', (t) => {
      if (isAddingMarkerRef.current) addMarkerFnRef.current?.(t)
    })

    ws.loadBlob(file)

    return () => {
      ws.destroy()
      wsRef.current = null
      wsRegionsRef.current = null
      regionMapRef.current = {}
      markersRef.current = []
      setIsReady(false)
      setIsPlaying(false)
      setCurrentTime(0)
      setDuration(0)
      setMarkers([])
    }
  }, [file])

  useEffect(() => {
    if (wsRef.current && isReady && zoom !== null) wsRef.current.zoom(zoom)
  }, [zoom, isReady])

  const fitToView = useCallback(() => {
    if (!wsRef.current || !containerRef.current) return
    const dur = wsRef.current.getDuration()
    const w = containerRef.current.clientWidth
    setZoom(Math.max(MIN_Z, w / dur))
  }, [])

  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT') return
      if (e.code === 'Space') {
        e.preventDefault()
        wsRef.current?.playPause()
      }
      if (e.code === 'KeyM' && isReady) {
        addMarkerFnRef.current?.(wsRef.current?.getCurrentTime() ?? 0)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isReady])

  return (
    <section className="waveform-editor">
      <div className="waveform-scroll">
        <div ref={containerRef} />
      </div>

      <div className="controls-bar">
        <button
          className="btn-play"
          onClick={() => wsRef.current?.playPause()}
          disabled={!isReady}
          title="Play / Pause (Space)"
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        <div className="time-display">
          {formatTime(currentTime)}
          <span className="time-sep"> / </span>
          {formatTime(duration)}
        </div>

        <button
          className={`btn-marker-toggle ${isAddingMarker ? 'active' : ''}`}
          onClick={() => setIsAddingMarker(p => !p)}
          disabled={!isReady}
          title="Click waveform to place markers. Shortcut: M = add at playhead, right-click marker = remove"
        >
          {isAddingMarker ? '✕ Done Adding' : '✦ Add Markers'}
        </button>

        <div className="zoom-group">
          <button className="btn-fit" onClick={fitToView} disabled={!isReady} title="Fit whole track in view">⊡ Fit</button>
          <input
            type="range" min={0} max={100}
            value={zoom !== null ? zoomToSlider(zoom) : 0}
            onChange={e => setZoom(sliderToZoom(Number(e.target.value)))}
            disabled={!isReady}
            title="Zoom"
          />
          <span className="zoom-val">{zoom !== null ? (zoom < 1 ? `${zoom.toFixed(2)}` : `${zoom.toFixed(1)}`) : '—'} px/s</span>
        </div>
      </div>

      {markers.length > 0 && (
        <div className="marker-list-panel">
          <div className="mlp-header">
            <span>{markers.length} marker{markers.length !== 1 ? 's' : ''} → {markers.length + 1} track{markers.length + 1 !== 1 ? 's' : ''}</span>
            <button onClick={clearAllMarkers}>Clear all</button>
          </div>
          <div className="mlp-chips">
            {markers.map((m, i) => (
              <span key={m.id} className="mlp-chip">
                <span className="chip-idx">M{i + 1}</span>
                <span className="chip-time">{formatTime(m.time)}</span>
                <button className="chip-rm" onClick={() => removeMarkerById(m.id)} title="Remove">✕</button>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
