import { useEffect, useRef, useState } from 'react'

/**
 * Crops any image to an exact W×H: drag to move, slider to zoom.
 * Reports a JPEG/PNG data URL at full target size whenever the crop settles.
 */
export function Cropper({ file, width, height, png = false, onCrop }: { file: File; width: number; height: number; png?: boolean; onCrop: (dataUrl: string) => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [off, setOff] = useState({ x: 0, y: 0 })
  const stage = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const [cw, setCw] = useState(400)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    const im = new Image()
    im.onload = () => {
      setImg(im)
      setZoom(1)
      const s = Math.max(width / im.naturalWidth, height / im.naturalHeight)
      setOff({ x: (width - im.naturalWidth * s) / 2, y: (height - im.naturalHeight * s) / 2 })
    }
    im.src = url
    return () => URL.revokeObjectURL(url)
  }, [file, width, height])

  useEffect(() => {
    const el = stage.current
    if (!el) return
    const ro = new ResizeObserver(() => setCw(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scale = img ? Math.max(width / img.naturalWidth, height / img.naturalHeight) * zoom : 1
  const clamp = (x: number, y: number) =>
    img
      ? {
          x: Math.min(0, Math.max(width - img.naturalWidth * scale, x)),
          y: Math.min(0, Math.max(height - img.naturalHeight * scale, y)),
        }
      : { x, y }

  // keep the crop valid when zoom changes
  useEffect(() => {
    setOff((o) => clamp(o.x, o.y))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, img])

  // export, debounced
  useEffect(() => {
    if (!img) return
    const t = setTimeout(() => {
      const c = document.createElement('canvas')
      c.width = width
      c.height = height
      const ctx = c.getContext('2d')!
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, off.x, off.y, img.naturalWidth * scale, img.naturalHeight * scale)
      onCrop(png ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.88))
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, off, scale])

  const f = cw / width
  return (
    <div>
      <div
        ref={stage}
        className="crop-stage"
        style={{ aspectRatio: `${width} / ${height}` }}
        onPointerDown={(e) => {
          ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
          drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d) return
          setOff(clamp(d.ox + (e.clientX - d.x) / f, d.oy + (e.clientY - d.y) / f))
        }}
        onPointerUp={() => (drag.current = null)}
      >
        {img && <img src={img.src} alt="" style={{ left: off.x * f, top: off.y * f, width: img.naturalWidth * scale * f }} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#8f98a0', marginTop: 4 }}>
        확대
        <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} style={{ flex: 1 }} />
        {width}×{height} · 끌어서 위치 조정
      </div>
    </div>
  )
}
