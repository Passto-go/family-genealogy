import { useEffect, useRef } from "react"
import { useReactFlow, useStore } from "@xyflow/react"
import { NODE_HEIGHT, NODE_WIDTH, type MemberFlowNode } from "@/components/tree/layout"
import { computeFitViewport } from "@/lib/tree-viewport"

/**
 * 首次进入时全览族谱；URL 带 generation 参数时定位到对应世代。
 * 容器尺寸就绪后自行计算视口，不依赖 React Flow 的 fitView 内部时序。
 */
export function InitialView({
  nodes,
  bounds,
  searchParams,
}: {
  nodes: MemberFlowNode[]
  bounds: { width: number; height: number }
  searchParams: URLSearchParams
}) {
  const width = useStore((state) => state.width)
  const height = useStore((state) => state.height)
  const { setViewport } = useReactFlow()
  const done = useRef(false)

  useEffect(() => {
    if (done.current || width === 0 || height === 0 || nodes.length === 0) return
    done.current = true

    const target = Number(searchParams.get("generation"))
    const first =
      Number.isFinite(target) && target > 0
        ? nodes.find((node) => node.data.member.generation === target)
        : undefined

    const narrow = width < 640

    if (first) {
      const zoom = narrow ? 0.6 : 0.85
      void setViewport({
        x: width / 2 - (first.position.x + NODE_WIDTH / 2) * zoom,
        y: height / 2 - (first.position.y + NODE_HEIGHT / 2) * zoom,
        zoom,
      })
      return
    }

    // 小屏：整树全览会被压缩，改为可读缩放并定位到顶层起点，供手势平移查阅
    if (narrow && bounds.height > 0) {
      const topNode = nodes.reduce((best, node) =>
        node.position.y < best.position.y ||
        (node.position.y === best.position.y && node.position.x < best.position.x)
          ? node
          : best,
      )
      const zoom = 0.6
      void setViewport({
        x: width / 2 - (topNode.position.x + NODE_WIDTH / 2) * zoom,
        y: 150 - topNode.position.y * zoom,
        zoom,
      })
      return
    }

    void setViewport(computeFitViewport(bounds, { width, height }))
  }, [width, height, nodes, bounds, searchParams, setViewport])

  return null
}
