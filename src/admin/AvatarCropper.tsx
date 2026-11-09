import { useCallback, useEffect, useState } from "react"
import Cropper, { type Area, type Point } from "react-easy-crop"
import { Loader2, X } from "lucide-react"

const RATIOS = [
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:4", value: 3 / 4 },
]

async function getCroppedBlob(imageSrc: string, area: Area, max = 512): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("图片加载失败"))
    image.src = imageSrc
  })
  const scale = Math.min(1, max / Math.max(area.width, area.height))
  const w = Math.max(1, Math.round(area.width * scale))
  const h = Math.max(1, Math.round(area.height * scale))
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("浏览器不支持图像处理")
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, w, h)
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("裁剪失败"))),
      "image/webp",
      0.85,
    )
  })
}

interface AvatarCropperProps {
  file: File
  onCancel: () => void
  onConfirm: (blob: Blob) => void
}

/** 上传前裁剪工具：可拖拽/缩放裁剪区域，切换 1:1 / 4:3 / 3:4 比例，确认后输出 WebP。 */
export function AvatarCropper({ file, onCancel, onConfirm }: AvatarCropperProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [aspect, setAspect] = useState(1)
  const [area, setArea] = useState<Area | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  // object URL 的创建与释放放进同一个 effect：每次挂载各自持有有效 URL，
  // 避免 React 18 StrictMode 下「挂载→卸载→再挂载」把唯一 URL 提前 revoke 导致图片无法加载。
  const [imageSrc, setImageSrc] = useState("")
  useEffect(() => {
    const url = URL.createObjectURL(file)
    setImageSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const onComplete = useCallback((_: Area, pixels: Area) => setArea(pixels), [])

  async function confirm() {
    if (!area) return
    setBusy(true)
    setError("")
    try {
      const blob = await getCroppedBlob(imageSrc, area)
      onConfirm(blob)
    } catch (err) {
      setError(err instanceof Error ? err.message : "裁剪失败")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 p-4">
      <div className="w-full max-w-[420px] rounded-[16px] bg-paper-50 shadow-float">
        <div className="flex items-center justify-between border-b border-paper-200 px-5 py-3.5">
          <h3 className="font-song text-[15px] tracking-[0.14em] text-ink-800">裁剪头像</h3>
          <button
            type="button"
            onClick={onCancel}
            className="text-muted-foreground transition-colors hover:text-ink-700"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="p-5">
          <div className="relative h-[300px] w-full overflow-hidden rounded-[10px] bg-ink-900/90">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onComplete}
              showGrid
              objectFit="contain"
            />
          </div>

          <div className="mt-4 flex items-center gap-2">
            {RATIOS.map((r) => (
              <button
                key={r.label}
                type="button"
                onClick={() => setAspect(r.value)}
                className={
                  "rounded-[8px] border px-3 py-1.5 text-[12px] tracking-[0.06em] transition-colors " +
                  (Math.abs(aspect - r.value) < 0.01
                    ? "border-ink-800 bg-ink-800 text-paper-50"
                    : "border-paper-300 bg-white text-ink-600 hover:border-ink-400")
                }
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <span className="text-[12px] text-muted-foreground">缩放</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="h-1.5 flex-1 accent-ink-800"
            />
          </div>

          {error ? <p className="mt-3 text-[11.5px] text-seal-700">{error}</p> : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-paper-200 px-5 py-3.5">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[8px] border border-paper-300 bg-paper-50 px-4 py-2 text-[12px] tracking-[0.12em] text-ink-600 transition-colors hover:border-ink-400"
          >
            取消
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="rounded-[8px] inline-flex items-center gap-1.5 bg-ink-800 px-5 py-2 text-[12px] tracking-[0.12em] text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
            确认裁剪
          </button>
        </div>
      </div>
    </div>
  )
}
