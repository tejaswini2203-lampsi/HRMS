import { useState, useRef, useEffect } from 'react'
import Button from './Button'
import './SignaturePad.css'

export default function SignaturePad({ onSave, onCancel, signerName = '' }) {
  const [mode, setMode] = useState('draw') // 'draw' | 'type'
  const [typedName, setTypedName] = useState(signerName)
  const canvasRef = useRef(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasDrawn, setHasDrawn] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#1e293b'
  }, [mode])

  const startDrawing = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const ctx = canvas.getContext('2d')
    ctx.beginPath()
    const clientX = e.clientX || e.touches?.[0]?.clientX
    const clientY = e.clientY || e.touches?.[0]?.clientY
    ctx.moveTo(clientX - rect.left, clientY - rect.top)
    setIsDrawing(true)
    setHasDrawn(true)
  }

  const draw = (e) => {
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const ctx = canvas.getContext('2d')
    const clientX = e.clientX || e.touches?.[0]?.clientX
    const clientY = e.clientY || e.touches?.[0]?.clientY
    ctx.lineTo(clientX - rect.left, clientY - rect.top)
    ctx.stroke()
  }

  const stopDrawing = () => {
    setIsDrawing(false)
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
  }

  const handleSave = () => {
    if (mode === 'draw') {
      const canvas = canvasRef.current
      if (!canvas || !hasDrawn) return
      const dataUrl = canvas.toDataURL('image/png')
      onSave(dataUrl)
    } else {
      if (!typedName.trim()) return
      // Create text on canvas and export
      const canvas = document.createElement('canvas')
      canvas.width = 400
      canvas.height = 120
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, 400, 120)
      ctx.font = 'italic 28px "Caveat", "Brush Script MT", cursive, sans-serif'
      ctx.fillStyle = '#1e3a8a'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(typedName, 200, 60)
      onSave(canvas.toDataURL('image/png'))
    }
  }

  return (
    <div className="signature-pad-container">
      <div className="signature-pad-tabs">
        <button
          type="button"
          className={`signature-tab ${mode === 'draw' ? 'is-active' : ''}`}
          onClick={() => setMode('draw')}
        >
          Draw Signature
        </button>
        <button
          type="button"
          className={`signature-tab ${mode === 'type' ? 'is-active' : ''}`}
          onClick={() => setMode('type')}
        >
          Type Name
        </button>
      </div>

      {mode === 'draw' ? (
        <div className="signature-canvas-wrap">
          <canvas
            ref={canvasRef}
            width={460}
            height={160}
            className="signature-canvas"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
          <div className="signature-guideline">Sign above the line</div>
          <button type="button" className="signature-clear-btn" onClick={clearCanvas}>
            Clear
          </button>
        </div>
      ) : (
        <div className="signature-type-wrap">
          <label className="signature-type-label">Type your formal signature</label>
          <input
            type="text"
            className="signature-type-input"
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            placeholder="e.g. John Doe"
          />
          <div className="signature-type-preview">
            <span style={{ fontFamily: 'italic cursive', fontSize: '24px', color: '#1e3a8a' }}>
              {typedName || 'Signature Preview'}
            </span>
          </div>
        </div>
      )}

      <div className="signature-actions">
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={mode === 'draw' ? !hasDrawn : !typedName.trim()}
        >
          Apply E-Signature
        </Button>
      </div>
    </div>
  )
}
