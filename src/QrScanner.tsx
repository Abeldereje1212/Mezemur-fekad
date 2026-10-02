import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { Camera, X } from 'lucide-react'

interface QrScannerProps {
  tx: (text: string) => string
  // Return true when the scanned text was accepted; scanning stops then.
  onResult: (text: string) => boolean
  onClose: () => void
  // Shown when the camera cannot be used, e.g. to open Telegram's own scanner instead.
  fallback?: { label: string; onClick: () => void }
}

type ScannerState = 'starting' | 'scanning' | 'denied' | 'unavailable'

// Frames are downscaled before decoding; QR codes on a screen decode fine at this size and it keeps older phones smooth.
const MAX_DECODE_SIZE = 480
const DECODE_INTERVAL_MS = 180

export default function QrScanner({ tx, onResult, onClose, fallback }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<ScannerState>('starting')
  // Keep the latest callback without restarting the camera on every render.
  const onResultRef = useRef(onResult)
  useEffect(() => { onResultRef.current = onResult }, [onResult])

  useEffect(() => {
    let stream: MediaStream | null = null
    let frame = 0
    let lastDecode = 0
    let stopped = false
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { willReadFrequently: true })

    function stop() {
      stopped = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((track) => track.stop())
    }

    function scanFrame(time: number) {
      if (stopped) return
      frame = requestAnimationFrame(scanFrame)
      const video = videoRef.current
      if (!video || !context || video.readyState < video.HAVE_ENOUGH_DATA || time - lastDecode < DECODE_INTERVAL_MS) return
      lastDecode = time

      const scale = Math.min(1, MAX_DECODE_SIZE / Math.max(video.videoWidth, video.videoHeight))
      canvas.width = Math.round(video.videoWidth * scale)
      canvas.height = Math.round(video.videoHeight * scale)
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      const image = context.getImageData(0, 0, canvas.width, canvas.height)
      const result = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })
      if (result?.data && onResultRef.current(result.data)) {
        navigator.vibrate?.(60)
        stop()
      }
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState('unavailable')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        setState('scanning')
        frame = requestAnimationFrame(scanFrame)
      } catch (error) {
        const name = error instanceof DOMException ? error.name : ''
        setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable')
      }
    }

    void start()
    return stop
  }, [])

  const failed = state === 'denied' || state === 'unavailable'

  return (
    <div className="qr-scanner">
      <div className="qr-scanner-view">
        <video ref={videoRef} playsInline muted className={state === 'scanning' ? 'qr-video ready' : 'qr-video'} />
        {state === 'scanning' && <div className="qr-frame" aria-hidden="true"><span /><span /><span /><span /><i /></div>}
        {state === 'starting' && <div className="qr-scanner-message"><Camera size={22} />{tx('Starting camera…')}</div>}
        {failed && (
          <div className="qr-scanner-message">
            <Camera size={22} />
            {tx(state === 'denied' ? 'Camera access was blocked. Allow the camera for Telegram, or enter the code below.' : 'The camera is not available here. Enter the code below.')}
            {fallback && <button type="button" className="submit-button" onClick={fallback.onClick}>{fallback.label}</button>}
          </div>
        )}
        <button type="button" className="qr-close" onClick={onClose} aria-label={tx('Close scanner')}><X size={18} /></button>
      </div>
      {state === 'scanning' && <p className="qr-hint">{tx('Point the camera at the QR code on the screen.')}</p>}
    </div>
  )
}
