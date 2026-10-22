/**
 * 辅助线与吸附：索引节点锚线，按距离选择对齐目标，并合并拖动及缩放产生的节点变更。
 * 每个画布实例通过 createExampleScope 创建独立作用域，避免缓存、store 和可变初始数据跨实例共享。
 */
import * as React from 'react'
import {
  useReactFlow,
  useStore,
  useNodesInitialized,
  ReactFlow,
  applyNodeChanges,
  ReactFlowProvider,
  Controls,
  Background,
  addEdge,
  applyEdgeChanges,
} from '@xyflow/react'
import { shallow as shallowEqual } from 'zustand/shallow'
import { getNodeBox } from '../lib/node-geometry'
import type {
  Connection,
  Edge,
  InternalNode,
  Node,
  NodeChange,
  NodeDimensionChange,
  NodePositionChange,
  ReactFlowInstance,
  ReactFlowState,
} from '@xyflow/react'

/** 所有对齐计算使用画布绝对坐标；仅最终输出时转换为父节点的局部坐标。 */
type GuideNode = Node<{ label: string }>
type NodeBox = ReturnType<typeof getNodeBox>
type Orientation = 'horizontal' | 'vertical'
interface Anchor {
  orientation: Orientation
  resolve: (node: GuideNode, box: NodeBox) => number
}
interface AnchorLine {
  nodeBox: NodeBox
  node: GuideNode
  orientation: Orientation
  position: number
  color: string | undefined
  anchorName: string
}
interface Alignment {
  anchorName: string
  sourcePosition: number
  anchor: Anchor
  line: AnchorLine
}
type Alignments = Record<Orientation, Alignment | undefined>
interface GuideProps {
  horizontal: AnchorLine | undefined
  vertical: AnchorLine | undefined
}

/** 创建本示例的组件、算法和局部状态；根组件惰性初始化后在本次挂载中复用。 */
function createExampleScope() {
  const INITIAL_NODES: GuideNode[] = [
    {
      id: '1',
      position: {
        x: 0,
        y: 0,
      },
      style: {
        width: 200,
        height: 100,
        backgroundColor: '#00d7ca',
      },
      data: {
        label: 'Node 1: Move me around',
      },
    },
    {
      id: '2',
      position: {
        x: 380,
        y: 125,
      },
      style: {
        width: 220,
        height: 400,
        backgroundColor: '#6ede87',
      },
      data: {
        label: 'Node 2: Move me around',
      },
    },
    {
      id: '3',
      position: {
        x: -100,
        y: 220,
      },
      style: {
        width: 125,
        height: 220,
        backgroundColor: '#ff6700',
      },
      data: {
        label: 'Node 3: Move me around',
      },
    },
    {
      id: '4',
      position: {
        x: 250,
        y: -160,
      },
      style: {
        width: 180,
        height: 180,
        backgroundColor: '#ff0071',
      },
      data: {
        label: 'Node 4: Move me around',
      },
    },
    {
      id: '5',
      position: {
        x: -20,
        y: 500,
      },
      style: {
        width: 300,
        height: 120,
        backgroundColor: '#784be8',
      },
      data: {
        label: 'Node 5: Move me around',
      },
    },
    {
      id: '6',
      data: {
        label: 'Group A',
      },
      position: {
        x: 100,
        y: 160,
      },
      style: {
        width: 200,
        height: 200,
      },
      type: 'group',
    },
    {
      id: '6a',
      data: {
        label: 'Node A.1',
      },
      position: {
        x: 10,
        y: 50,
      },
      style: {
        width: 80,
        height: 80,
        backgroundColor: '#784be8',
      },
      parentId: '6',
      extent: 'parent',
    },
  ]
  const INITIAL_EDGES: Edge[] = []
  const selectCanvasState = (flowState: ReactFlowState) => ({
    width: flowState.width,
    height: flowState.height,
    transform: flowState.transform,
  })
  const DEFAULT_GUIDE_COLOR = '#0041d0'
  /* 将画布坐标乘缩放比例并叠加视口平移后绘制辅助线；按设备像素比扩展 Canvas，中心锚点使用虚线。 */
  function HelperLinesCanvas({ horizontal: horizontalLine, vertical: verticalLine }: GuideProps) {
    const {
      width: canvasWidth,
      height: canvasHeight,
      transform: viewportTransform,
    } = useStore(selectCanvasState)
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
    React.useEffect(() => {
      const canvas = canvasRef.current
      const context = canvas?.getContext('2d')
      if (!context || !canvas) {
        return
      }
      const pixelRatio = window.devicePixelRatio
      canvas.width = canvasWidth * pixelRatio
      canvas.height = canvasHeight * pixelRatio
      context.scale(pixelRatio, pixelRatio)
      context.strokeStyle = DEFAULT_GUIDE_COLOR
      if (verticalLine) {
        context.beginPath()
        if (verticalLine.anchorName === 'centerX') {
          context.setLineDash([5, 5])
        }
        context.strokeStyle = verticalLine.color || DEFAULT_GUIDE_COLOR
        context.moveTo(verticalLine.position * viewportTransform[2] + viewportTransform[0], 0)
        context.lineTo(
          verticalLine.position * viewportTransform[2] + viewportTransform[0],
          canvasHeight,
        )
        context.stroke()
      }
      if (horizontalLine) {
        context.beginPath()
        if (horizontalLine.anchorName === 'centerY') {
          context.setLineDash([5, 5])
        }
        context.strokeStyle = horizontalLine.color || DEFAULT_GUIDE_COLOR
        context.moveTo(0, horizontalLine.position * viewportTransform[2] + viewportTransform[1])
        context.lineTo(
          canvasWidth,
          horizontalLine.position * viewportTransform[2] + viewportTransform[1],
        )
        context.stroke()
      }
    }, [canvasWidth, canvasHeight, viewportTransform, horizontalLine, verticalLine])
    return <canvas ref={canvasRef} className="react-flow__canvas" />
  }
  const DEFAULT_ANCHORS: Record<string, Anchor> = {
    top: {
      orientation: 'horizontal',
      resolve: (_node, nodeBox) => nodeBox.y,
    },
    bottom: {
      orientation: 'horizontal',
      resolve: (_node, nodeBox) => nodeBox.y2,
    },
    left: {
      orientation: 'vertical',
      resolve: (_node, nodeBox) => nodeBox.x,
    },
    right: {
      orientation: 'vertical',
      resolve: (_node, nodeBox) => nodeBox.x2,
    },
    centerX: {
      orientation: 'vertical',
      resolve: (_node, nodeBox) => (nodeBox.x + nodeBox.x2) / 2,
    },
    centerY: {
      orientation: 'horizontal',
      resolve: (_node, nodeBox) => (nodeBox.y + nodeBox.y2) / 2,
    },
  }
  const boxesIntersect = (firstBox: NodeBox, secondBox: NodeBox) =>
    firstBox.x < secondBox.x2 &&
    firstBox.x2 > secondBox.x &&
    firstBox.y < secondBox.y2 &&
    firstBox.y2 > secondBox.y
  function intersectionArea(firstBox: NodeBox, secondBox: NodeBox) {
    return (
      Math.max(0, Math.min(firstBox.x2, secondBox.x2) - Math.max(firstBox.x, secondBox.x)) *
      Math.max(0, Math.min(firstBox.y2, secondBox.y2) - Math.max(firstBox.y, secondBox.y))
    )
  }
  function boxDistance(firstBox: NodeBox, secondBox: NodeBox) {
    const horizontalGap = Math.max(
      0,
      Math.max(firstBox.x - secondBox.x2, secondBox.x - firstBox.x2),
    )
    const verticalGap = Math.max(0, Math.max(firstBox.y - secondBox.y2, secondBox.y - firstBox.y2))
    return Math.sqrt(horizontalGap * horizontalGap + verticalGap * verticalGap)
  }
  /**
   * 把节点的六种锚线拆成水平/垂直两个有序索引，支持拖动与缩放共享查询。
   * 查询限定在可见区域内，并排除移动节点自己及其直接子节点。
   * 候选线需距移动锚点不超过 10；距离接近时用节点间距决定优先级。
   * 记住上一轮命中的线，优先复用以减少近距离候选之间来回跳动。
   */
  const HelperLineIndex = class {
    xLines: AnchorLine[] = []
    yLines: AnchorLine[] = []
    lastHorizontalLine: AnchorLine | undefined
    lastVerticalLine: AnchorLine | undefined
    /* 把节点锚线按水平、垂直分别排序，便于按可视范围提前跳过或终止检索。 */
    initialize(anchorLines: AnchorLine[]) {
      this.xLines = anchorLines.filter((line) => line.orientation === 'vertical')
      this.yLines = anchorLines.filter((line) => line.orientation === 'horizontal')
      this.xLines.sort((firstLine, secondLine) => firstLine.position - secondLine.position)
      this.yLines.sort((firstLine, secondLine) => firstLine.position - secondLine.position)
      this.lastHorizontalLine = undefined
      this.lastVerticalLine = undefined
    }
    /* 仅搜索可视范围内且距离锚点不超过 10 的候选线；优先保持上次命中以抑制抖动，再按线距与节点间距排序。 */
    search(
      orientation: Orientation,
      anchorPosition: number,
      movingNode: GuideNode,
      searchBounds: NodeBox,
    ) {
      const sortedLines = orientation === 'horizontal' ? this.yLines : this.xLines
      const [visibleStart, visibleEnd] =
        orientation === 'horizontal'
          ? [searchBounds.y, searchBounds.y2]
          : [searchBounds.x, searchBounds.x2]
      const candidates = []
      for (const line of sortedLines) {
        if (line.position < visibleStart) {
          continue
        }
        if (line.position > visibleEnd) {
          break
        }
        if (
          line.node.id === movingNode.id ||
          line.node.parentId === movingNode.id ||
          !boxesIntersect(line.nodeBox, searchBounds)
        ) {
          continue
        }
        const lineDistance = Math.abs(line.position - anchorPosition)
        if (lineDistance > 10) {
          continue
        }
        const nodeDistance =
          intersectionArea(line.nodeBox, getNodeBox(movingNode)) > 0
            ? 0
            : boxDistance(line.nodeBox, getNodeBox(movingNode))
        candidates.push({
          line,
          lineDist: lineDistance,
          nodeDist: nodeDistance,
        })
      }
      const previousLine =
        orientation === 'horizontal' ? this.lastHorizontalLine : this.lastVerticalLine
      candidates.sort((firstCandidate, secondCandidate) => {
        if (previousLine) {
          if (firstCandidate.line === previousLine && secondCandidate.line !== previousLine) {
            return -1
          }
          if (secondCandidate.line === previousLine && firstCandidate.line !== previousLine) {
            return 1
          }
        }
        if (Math.abs(firstCandidate.lineDist - secondCandidate.lineDist) <= 0.5) {
          return firstCandidate.nodeDist - secondCandidate.nodeDist
        } else {
          return firstCandidate.lineDist - secondCandidate.lineDist
        }
      })
      const bestLine = candidates.length > 0 ? candidates[0]!.line : undefined
      if (bestLine) {
        if (orientation === 'horizontal') {
          this.lastHorizontalLine = bestLine
        } else {
          this.lastVerticalLine = bestLine
        }
      }
      return bestLine
    }
  }
  /* 为每个节点解析上、下、左、右与两个中心锚点，并保留节点包围盒、方向和背景色。 */
  function buildAnchorLines(
    nodes: GuideNode[],
    anchors = DEFAULT_ANCHORS,
    getInternalNode: ReactFlowInstance<GuideNode>['getInternalNode'],
  ) {
    const anchorLines: AnchorLine[] = []
    nodes.forEach((node) => {
      const internalNode = getInternalNode(node.id)
      if (!internalNode) {
        throw Error(`Node with id ${node.id} not found in internal nodes.`)
      }
      const nodeBox = getNodeBox(internalNode)
      Object.entries(anchors).forEach(([anchorName, anchor]) => {
        anchorLines.push({
          nodeBox,
          node,
          orientation: anchor.orientation,
          position: anchor.resolve(node, nodeBox),
          color: node.style?.backgroundColor,
          anchorName,
        })
      })
    })
    return anchorLines
  }
  /**
   * 分别解析移动节点的候选锚点，并查询对应方向的最近参考线。
   * 每个方向只保留一组距离最小的 Alignment，供吸附和辅助线绘制共同使用。
   * 拖动可以比较全部锚点；缩放只比较正在变化的边，防止固定边被错误移动。
   */
  function findBestAlignments(
    lineIndex: InstanceType<typeof HelperLineIndex>,
    searchBounds: NodeBox,
    movingNode: GuideNode,
    movingBox: NodeBox,
    anchorNames = Object.keys(DEFAULT_ANCHORS),
  ) {
    const alignments = []
    for (const anchorName of anchorNames) {
      const anchor = DEFAULT_ANCHORS[anchorName]!
      const anchorPosition = anchor.resolve(movingNode, movingBox)
      const line = lineIndex.search(anchor.orientation, anchorPosition, movingNode, searchBounds)
      if (line) {
        alignments.push({
          anchorName,
          sourcePosition: anchorPosition,
          anchor,
          line,
        })
      }
    }
    const bestAlignments: Alignments = {
      horizontal: undefined,
      vertical: undefined,
    }
    for (const alignment of alignments) {
      const previousAlignment = bestAlignments[alignment.anchor.orientation]
      const alignmentDistance = Math.abs(alignment.sourcePosition - alignment.line.position)
      if (
        !previousAlignment ||
        alignmentDistance <
          Math.abs(previousAlignment.sourcePosition - previousAlignment.line.position)
      ) {
        bestAlignments[alignment.anchor.orientation] = alignment
      }
    }
    return bestAlignments
  }
  /**
   * 把求得的对齐关系合并到 position/dimensions 变更对象，而不是直接修改画布节点。
   * 所有距离判断在画布绝对坐标中完成，水平线修正 y，垂直线修正 x。
   * 缩放时同时维护另一侧边界：拖动左上角需保留原右下角，右下角缩放保留原点。
   * 对父节点内的节点，最终再转为相对坐标；返回 snappedX/snappedY 决定显示哪些线。
   * 此函数会原地修改本轮变更对象，调用方随后统一交给 applyNodeChanges 应用。
   */
  function applySnap(
    node: GuideNode,
    internalNode: InternalNode<GuideNode>,
    absolutePositionChange: NodePositionChange,
    positionChange: NodePositionChange | undefined,
    dimensionChange: NodeDimensionChange | undefined,
    parentInternalNode: InternalNode<GuideNode> | undefined,
    horizontalAlignment: Alignment | undefined,
    verticalAlignment: Alignment | undefined,
  ) {
    if (!absolutePositionChange?.position) {
      return {
        snappedX: false,
        snappedY: false,
      }
    }
    let snappedX = false
    let snappedY = false
    const proposedBox = {
      x: absolutePositionChange.position.x,
      y: absolutePositionChange.position.y,
      x2: absolutePositionChange.position.x + (node.measured?.width ?? 0),
      y2: absolutePositionChange.position.y + (node.measured?.height ?? 0),
    }
    if (horizontalAlignment) {
      const verticalOffset =
        horizontalAlignment.anchor.resolve(node, proposedBox) - horizontalAlignment.line.position
      if (Math.abs(verticalOffset) <= 10) {
        absolutePositionChange.position.y -= verticalOffset
        if (dimensionChange?.dimensions) {
          if (positionChange) {
            const originalBottom =
              internalNode.internals.positionAbsolute.y + (node.measured?.height ?? 0)
            dimensionChange.dimensions.height = originalBottom - horizontalAlignment.line.position
          } else {
            dimensionChange.dimensions.height =
              horizontalAlignment.line.position - internalNode.internals.positionAbsolute.y
          }
        }
        snappedY = true
      }
    }
    if (verticalAlignment) {
      const horizontalOffset =
        verticalAlignment.anchor.resolve(node, proposedBox) - verticalAlignment.line.position
      if (Math.abs(horizontalOffset) <= 10) {
        absolutePositionChange.position.x -= horizontalOffset
        if (dimensionChange?.dimensions) {
          if (positionChange) {
            const originalRight =
              internalNode.internals.positionAbsolute.x + (node.measured?.width ?? 0)
            dimensionChange.dimensions.width = originalRight - verticalAlignment.line.position
          } else {
            dimensionChange.dimensions.width =
              verticalAlignment.line.position - internalNode.internals.positionAbsolute.x
          }
        }
        snappedX = true
      }
    }
    if (parentInternalNode && (snappedX || snappedY)) {
      absolutePositionChange.position.x -= parentInternalNode.position.x
      absolutePositionChange.position.y -= parentInternalNode.position.y
    }
    return {
      snappedX,
      snappedY,
    }
  }
  /**
   * 节点测量完成后建立锚线索引；拖动或缩放停止时由画布事件重新建立。
   * updateHelperLines 只处理单个 position、单个 dimensions 或二者成对的变更。
   * 先从屏幕四角反算可见画布范围，再求参考线、修正本轮变更、更新辅助线状态。
   * 新增、删除、选择或批量节点变更直接交回 React Flow，保持标准图状态处理。
   */
  function useHelperLines() {
    const [horizontalLine, setHorizontalLine] = React.useState<AnchorLine | undefined>(undefined)
    const [verticalLine, setVerticalLine] = React.useState<AnchorLine | undefined>(undefined)
    const { width: viewportWidth, height: viewportHeight } = useStore(
      (flowState: ReactFlowState) => ({
        width: flowState.width,
        height: flowState.height,
      }),
      shallowEqual,
    )
    const nodesInitialized = useNodesInitialized()
    const { getNodes } = useReactFlow<GuideNode, Edge>()
    const lineIndexRef = React.useRef(new HelperLineIndex())
    const { screenToFlowPosition, getInternalNode } = useReactFlow<GuideNode, Edge>()
    const clearHelperLines = React.useCallback(() => {
      setHorizontalLine(undefined)
      setVerticalLine(undefined)
    }, [])
    const rebuildIndex = React.useCallback(
      (nodes: GuideNode[]) => {
        clearHelperLines()
        const anchorLines = buildAnchorLines(nodes, DEFAULT_ANCHORS, getInternalNode)
        lineIndexRef.current.initialize(anchorLines)
      },
      [getInternalNode, clearHelperLines],
    )
    React.useEffect(() => {
      if (nodesInitialized) {
        rebuildIndex(getNodes())
      }
    }, [nodesInitialized, rebuildIndex, getNodes])
    return {
      rebuildIndex,
      updateHelperLines: React.useCallback(
        /* 区分单独拖动、右下角缩放与左上角缩放，按对应锚点求对齐，输出吸附后的 position/dimensions 变更。 */ (
          changes: NodeChange<GuideNode>[],
          currentNodes: GuideNode[],
        ) => {
          if (!lineIndexRef.current || changes.length === 0 || changes.length > 2) {
            return changes
          }
          clearHelperLines()
          let positionChange: NodePositionChange | undefined
          let dimensionChange: NodeDimensionChange | undefined
          let anchorNames = Object.keys(DEFAULT_ANCHORS)
          if (changes.length === 1) {
            if (changes[0]!.type === 'position') {
              positionChange = changes[0]
            } else {
              if (changes[0]!.type === 'dimensions') {
                dimensionChange = changes[0]
                anchorNames = ['right', 'bottom']
              }
            }
          } else {
            if (
              changes[0]!.type === 'position' &&
              changes[1]!.type === 'dimensions' &&
              changes[1]!.dimensions
            ) {
              positionChange = changes[0]
              dimensionChange = changes[1]
              anchorNames = ['top', 'left']
            }
          }
          // add 变更携带 item 而非 id；这类变更无需计算几何吸附。
          const firstChange = changes[0]!
          if (!('id' in firstChange)) return changes
          const changedNode = currentNodes.find((node) => node.id === firstChange.id)
          if (!changedNode) {
            return changes
          }
          const internalNode = getInternalNode(changedNode.id)
          if (!internalNode) {
            throw Error(`Node with id ${changedNode.id} not found in internal nodes`)
          }
          const parentInternalNode = getInternalNode(internalNode.parentId ?? '')
          const proposedBox = getNodeBox(internalNode)
          if (dimensionChange?.dimensions) {
            proposedBox.x2 = proposedBox.x + dimensionChange.dimensions.width
            proposedBox.y2 = proposedBox.y + dimensionChange.dimensions.height
          }
          const { x: visibleLeft, y: visibleTop } = screenToFlowPosition({
            x: 0,
            y: 0,
          })
          const { x: visibleRight, y: visibleBottom } = screenToFlowPosition({
            x: viewportWidth,
            y: viewportHeight,
          })
          const visibleBounds = {
            x: visibleLeft,
            y: visibleTop,
            x2: visibleRight,
            y2: visibleBottom,
          }
          const { horizontal: horizontalAlignment, vertical: verticalAlignment } =
            findBestAlignments(
              lineIndexRef.current,
              visibleBounds,
              changedNode,
              proposedBox,
              anchorNames,
            )
          const absolutePositionChange: NodePositionChange = {
            id: changedNode.id,
            type: 'position',
            position: {
              x: internalNode.internals.positionAbsolute.x,
              y: internalNode.internals.positionAbsolute.y,
            },
            dragging: false,
          }
          if (positionChange?.position && absolutePositionChange.position) {
            if (parentInternalNode) {
              absolutePositionChange.position.x =
                positionChange.position.x + (parentInternalNode?.position?.x ?? 0)
              absolutePositionChange.position.y =
                positionChange.position.y + (parentInternalNode?.position?.y ?? 0)
            } else {
              absolutePositionChange.position.x = positionChange.position.x
              absolutePositionChange.position.y = positionChange.position.y
            }
          }
          const { snappedX, snappedY } = applySnap(
            changedNode,
            internalNode,
            absolutePositionChange,
            positionChange,
            dimensionChange,
            parentInternalNode,
            horizontalAlignment,
            verticalAlignment,
          )
          if (snappedX || snappedY) {
            if (dimensionChange?.resizing || positionChange?.dragging) {
              if (snappedX) {
                setVerticalLine(verticalAlignment?.line)
              }
              if (snappedY) {
                setHorizontalLine(horizontalAlignment?.line)
              }
            }
            if (dimensionChange && positionChange) {
              return [absolutePositionChange, dimensionChange]
            }
            if (positionChange) {
              return [absolutePositionChange]
            }
            if (dimensionChange) {
              return [dimensionChange]
            }
          }
          return changes
        },
        [
          screenToFlowPosition,
          getInternalNode,
          viewportWidth,
          viewportHeight,
          setHorizontalLine,
          setVerticalLine,
          clearHelperLines,
        ],
      ),
      helperLineHorizontal: horizontalLine,
      helperLineVertical: verticalLine,
      HelperLines: React.useCallback(
        () => <HelperLinesCanvas horizontal={horizontalLine} vertical={verticalLine} />,
        [horizontalLine, verticalLine],
      ),
    }
  }
  const PRO_OPTIONS = {
    hideAttribution: true,
  }
  function HelperLinesFlow() {
    const [nodes, setNodes] = React.useState(INITIAL_NODES)
    const [edges, setEdges] = React.useState(INITIAL_EDGES)
    const { rebuildIndex, updateHelperLines, HelperLines } = useHelperLines()
    const { getNodes } = useReactFlow<GuideNode, Edge>()
    return (
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={React.useCallback(
          (changes: NodeChange<GuideNode>[]) => {
            setNodes((currentNodes) =>
              applyNodeChanges(updateHelperLines(changes, currentNodes), currentNodes),
            )
          },
          [setNodes, updateHelperLines],
        )}
        onEdgesChange={React.useCallback(
          (changes) => setEdges((currentEdges) => applyEdgeChanges(changes, currentEdges)),
          [],
        )}
        onConnect={React.useCallback(
          (connection: Connection) => setEdges((currentEdges) => addEdge(connection, currentEdges)),
          [],
        )}
        onNodeDragStop={React.useCallback(() => {
          rebuildIndex(getNodes())
        }, [getNodes, rebuildIndex])}
        fitView
        elevateEdgesOnSelect
        elevateNodesOnSelect
        proOptions={PRO_OPTIONS}
        colorMode="system"
      >
        <Background />
        <Controls />
        <HelperLines />
      </ReactFlow>
    )
  }
  function HelperLinesExample() {
    return (
      <ReactFlowProvider>
        <HelperLinesFlow />
      </ReactFlowProvider>
    )
  }
  const initialElement = (
    <React.StrictMode>
      <HelperLinesExample />
    </React.StrictMode>
  )
  return function ExampleRoot() {
    return initialElement
  }
}
function HelperLinesCanvas() {
  // 惰性保存组件类型，使普通重渲染沿用同一份图状态；工作台重置时重新挂载。
  const [Example] = React.useState(createExampleScope)
  return <Example />
}
export { HelperLinesCanvas as default }
