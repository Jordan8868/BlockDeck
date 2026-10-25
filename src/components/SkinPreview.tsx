import React from 'react'

export function SkinPreview({ skin, size = 210 }: { skin: string; size?: number }): React.JSX.Element {
  const ref = React.useRef<HTMLCanvasElement>(null)
  React.useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const image = new Image()
    image.onload = (): void => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const scale = 10
      canvas.width = 220
      canvas.height = 350
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.imageSmoothingEnabled = false

      const part = (sx: number, sy: number, sw: number, sh: number, dx: number, dy: number): void => {
        ctx.drawImage(image, sx, sy, sw, sh, dx, dy, sw * scale, sh * scale)
      }
      const overlay = (sx: number, sy: number, sw: number, sh: number, dx: number, dy: number): void => {
        if (image.width >= 64 && image.height >= 64) part(sx, sy, sw, sh, dx, dy)
      }

      // Soft ground shadow.
      const shadow = ctx.createRadialGradient(110, 330, 4, 110, 330, 78)
      shadow.addColorStop(0, 'rgba(0,0,0,.34)')
      shadow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = shadow
      ctx.fillRect(20, 300, 180, 40)

      const is64 = image.width >= 64 && image.height >= 64
      part(8, 8, 8, 8, 70, 20)
      overlay(40, 8, 8, 8, 70, 20)
      part(20, 20, 8, 12, 70, 100)
      overlay(20, 36, 8, 12, 70, 100)
      part(44, 20, 4, 12, 30, 100)
      overlay(44, 36, 4, 12, 30, 100)
      part(4, 20, 4, 12, 70, 220)
      overlay(4, 36, 4, 12, 70, 220)
      if (is64) {
        part(36, 52, 4, 12, 150, 100)
        overlay(52, 52, 4, 12, 150, 100)
        part(20, 52, 4, 12, 110, 220)
        overlay(4, 52, 4, 12, 110, 220)
      } else {
        part(44, 20, 4, 12, 150, 100)
        part(4, 20, 4, 12, 110, 220)
      }
    }
    image.src = skin
  }, [skin])

  return (
    <canvas
      ref={ref}
      width={220}
      height={350}
      className="skin-preview-canvas"
      style={{ width: size, height: (size / 220) * 350 }}
      aria-hidden
    />
  )
}
