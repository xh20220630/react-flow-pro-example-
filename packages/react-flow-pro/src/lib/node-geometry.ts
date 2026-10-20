import { getNodesBounds, type InternalNode, type Node } from '@xyflow/react'

/** Absolute box used by alignment guides; geometry comes from the host React Flow. */
export function getNodeBox(node: Node | InternalNode) {
  const { x, y, width, height } = getNodesBounds([node])
  return { x, y, x2: x + width, y2: y + height }
}
