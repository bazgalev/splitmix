import { Mp3Encoder } from '@breezystack/lamejs'

export function formatTime(s) {
  if (!s || isNaN(s)) return '0:00.0'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  const ds = Math.floor((s % 1) * 10)
  return `${m}:${String(sec).padStart(2, '0')}.${ds}`
}

// Resample a slice of audioBuffer to targetSampleRate using OfflineAudioContext
export async function resampleSegment(audioBuffer, startSec, endSec, targetRate) {
  const numChannels = audioBuffer.numberOfChannels
  const duration = endSec - startSec
  const offCtx = new OfflineAudioContext(numChannels, Math.ceil(duration * targetRate), targetRate)
  const src = offCtx.createBufferSource()
  src.buffer = audioBuffer
  src.connect(offCtx.destination)
  src.start(0, startSec, duration)
  return offCtx.startRendering()
}

// WAV 16-bit PCM
export function sliceToWAV16(audioBuffer, startSec, endSec) {
  const sampleRate = audioBuffer.sampleRate
  const numChannels = audioBuffer.numberOfChannels
  const startSample = Math.floor(startSec * sampleRate)
  const endSample = Math.min(Math.ceil(endSec * sampleRate), audioBuffer.length)
  const numFrames = endSample - startSample

  const pcmBytes = numFrames * numChannels * 2
  const buffer = new ArrayBuffer(44 + pcmBytes)
  const dv = new DataView(buffer)
  _writeWavHeader(dv, numChannels, sampleRate, 16, pcmBytes)

  const out = new Int16Array(buffer, 44)
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = audioBuffer.getChannelData(ch)[startSample + i]
      out[i * numChannels + ch] = Math.max(-0x8000, Math.min(0x7fff, Math.round(s * 0x7fff)))
    }
  }
  return buffer
}

// WAV 24-bit PCM
export function sliceToWAV24(audioBuffer, startSec, endSec) {
  const sampleRate = audioBuffer.sampleRate
  const numChannels = audioBuffer.numberOfChannels
  const startSample = Math.floor(startSec * sampleRate)
  const endSample = Math.min(Math.ceil(endSec * sampleRate), audioBuffer.length)
  const numFrames = endSample - startSample

  const pcmBytes = numFrames * numChannels * 3
  const buffer = new ArrayBuffer(44 + pcmBytes)
  const dv = new DataView(buffer)
  _writeWavHeader(dv, numChannels, sampleRate, 24, pcmBytes)

  const out = new Uint8Array(buffer, 44)
  let offset = 0
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = audioBuffer.getChannelData(ch)[startSample + i]
      const val = Math.max(-8388608, Math.min(8388607, Math.round(s * 8388607)))
      out[offset++] = val & 0xff
      out[offset++] = (val >> 8) & 0xff
      out[offset++] = (val >> 16) & 0xff
    }
  }
  return buffer
}

// MP3 at given bitrate (kbps). Returns Blob.
export function sliceToMP3(audioBuffer, startSec, endSec, bitrate = 320) {
  const sampleRate = audioBuffer.sampleRate
  const numChannels = Math.min(audioBuffer.numberOfChannels, 2)
  const startSample = Math.floor(startSec * sampleRate)
  const endSample = Math.min(Math.ceil(endSec * sampleRate), audioBuffer.length)
  const numFrames = endSample - startSample

  // Float32 → Int16
  const channels = []
  for (let ch = 0; ch < numChannels; ch++) {
    const src = audioBuffer.getChannelData(ch)
    const int16 = new Int16Array(numFrames)
    for (let i = 0; i < numFrames; i++) {
      int16[i] = Math.max(-0x8000, Math.min(0x7fff, Math.round(src[startSample + i] * 0x7fff)))
    }
    channels.push(int16)
  }

  const encoder = new Mp3Encoder(numChannels, sampleRate, bitrate)
  const BLOCK = 1152
  const chunks = []

  for (let i = 0; i < numFrames; i += BLOCK) {
    const L = channels[0].subarray(i, i + BLOCK)
    const encoded = numChannels === 1
      ? encoder.encodeBuffer(L)
      : encoder.encodeBuffer(L, channels[1].subarray(i, i + BLOCK))
    if (encoded.length > 0) chunks.push(encoded)
  }

  const tail = encoder.flush()
  if (tail.length > 0) chunks.push(tail)

  return new Blob(chunks, { type: 'audio/mpeg' })
}

function _writeWavHeader(dv, numChannels, sampleRate, bitDepth, pcmBytes) {
  const blockAlign = numChannels * bitDepth / 8
  const ws = (off, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)) }
  ws(0, 'RIFF'); dv.setUint32(4, 36 + pcmBytes, true)
  ws(8, 'WAVE'); ws(12, 'fmt ')
  dv.setUint32(16, 16, true)
  dv.setUint16(20, 1, true)
  dv.setUint16(22, numChannels, true)
  dv.setUint32(24, sampleRate, true)
  dv.setUint32(28, sampleRate * blockAlign, true)
  dv.setUint16(32, blockAlign, true)
  dv.setUint16(34, bitDepth, true)
  ws(36, 'data'); dv.setUint32(40, pcmBytes, true)
}
