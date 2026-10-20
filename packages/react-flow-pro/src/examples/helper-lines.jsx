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
function createExampleScope() {
  const INITIAL_NODES = [
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
  const INITIAL_EDGES = []
  const selectCanvasState = (flowState) => ({
    width: flowState.width,
    height: flowState.height,
    transform: flowState.transform,
  })
  const DEFAULT_GUIDE_COLOR = '#0041d0'
  /* 将画布坐标乘缩放比例并叠加视口平移后绘制辅助线；按设备像素比扩展 Canvas，中心锚点使用虚线。 */
  function HelperLinesCanvas({ horizontal: horizontalLine, vertical: verticalLine }) {
    const {
      width: canvasWidth,
      height: canvasHeight,
      transform: viewportTransform,
    } = useStore(selectCanvasState)
    const canvasRef = React.useRef(null)
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
  const DEFAULT_ANCHORS = {
    top: {
      orientation: 'horizontal',
      resolve: (node, nodeBox) => nodeBox.y,
    },
    bottom: {
      orientation: 'horizontal',
      resolve: (node, nodeBox) => nodeBox.y2,
    },
    left: {
      orientation: 'vertical',
      resolve: (node, nodeBox) => nodeBox.x,
    },
    right: {
      orientation: 'vertical',
      resolve: (node, nodeBox) => nodeBox.x2,
    },
    centerX: {
      orientation: 'vertical',
      resolve: (node, nodeBox) => (nodeBox.x + nodeBox.x2) / 2,
    },
    centerY: {
      orientation: 'horizontal',
      resolve: (node, nodeBox) => (nodeBox.y + nodeBox.y2) / 2,
    },
  }
  const boxesIntersect = (firstBox, secondBox) =>
    firstBox.x < secondBox.x2 &&
    firstBox.x2 > secondBox.x &&
    firstBox.y < secondBox.y2 &&
    firstBox.y2 > secondBox.y
  function intersectionArea(firstBox, secondBox) {
    return (
      Math.max(0, Math.min(firstBox.x2, secondBox.x2) - Math.max(firstBox.x, secondBox.x)) *
      Math.max(0, Math.min(firstBox.y2, secondBox.y2) - Math.max(firstBox.y, secondBox.y))
    )
  }
  function boxDistance(firstBox, secondBox) {
    const horizontalGap = Math.max(
      0,
      Math.max(firstBox.x - secondBox.x2, secondBox.x - firstBox.x2),
    )
    const verticalGap = Math.max(0, Math.max(firstBox.y - secondBox.y2, secondBox.y - firstBox.y2))
    return Math.sqrt(horizontalGap * horizontalGap + verticalGap * verticalGap)
  }
  const HelperLineIndex = class {
    xLines = []
    yLines = []
    lastHorizontalLine
    lastVerticalLine
    /* 把节点锚线按水平、垂直分别排序，便于按可视范围提前跳过或终止检索。 */
    initialize(anchorLines) {
      this.xLines = anchorLines.filter((line) => line.orientation === 'vertical')
      this.yLines = anchorLines.filter((line) => line.orientation === 'horizontal')
      this.xLines.sort((firstLine, secondLine) => firstLine.position - secondLine.position)
      this.yLines.sort((firstLine, secondLine) => firstLine.position - secondLine.position)
      this.lastHorizontalLine = undefined
      this.lastVerticalLine = undefined
    }
    /* 仅搜索可视范围内且距离锚点不超过 10 的候选线；优先保持上次命中以抑制抖动，再按线距与节点间距排序。 */
    search(orientation, anchorPosition, movingNode, searchBounds) {
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
      const bestLine = candidates.length > 0 ? candidates[0].line : undefined
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
  function buildAnchorLines(nodes, anchors = DEFAULT_ANCHORS, getInternalNode) {
    const anchorLines = []
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
  /* 为移动节点的各个锚点寻找候选线，每个方向只保留距离最近的一组对齐关系。 */
  function findBestAlignments(
    lineIndex,
    searchBounds,
    movingNode,
    movingBox,
    anchorNames = Object.keys(DEFAULT_ANCHORS),
  ) {
    const alignments = []
    for (const anchorName of anchorNames) {
      const anchor = DEFAULT_ANCHORS[anchorName]
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
    const bestAlignments = {
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
  /* 在 10 个画布单位内修正节点绝对位置；缩放操作同时修正尺寸，父子节点再换回相对坐标。 */
  function applySnap(
    node,
    internalNode,
    absolutePositionChange,
    positionChange,
    dimensionChange,
    parentInternalNode,
    horizontalAlignment,
    verticalAlignment,
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
  /* 维护辅助线索引和显示状态；节点完成测量后建索引，拖动或缩放时在应用节点变更前计算吸附。 */
  function useHelperLines() {
    const [horizontalLine, setHorizontalLine] = React.useState(undefined)
    const [verticalLine, setVerticalLine] = React.useState(undefined)
    const { width: viewportWidth, height: viewportHeight } = useStore(
      (flowState) => ({
        width: flowState.width,
        height: flowState.height,
      }),
      shallowEqual,
    )
    const nodesInitialized = useNodesInitialized()
    const { getNodes } = useReactFlow()
    const lineIndexRef = React.useRef(new HelperLineIndex())
    const { screenToFlowPosition, getInternalNode } = useReactFlow()
    const clearHelperLines = React.useCallback(() => {
      setHorizontalLine(undefined)
      setVerticalLine(undefined)
    }, [])
    const rebuildIndex = React.useCallback(
      (nodes) => {
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
          changes,
          currentNodes,
        ) => {
          if (!lineIndexRef.current || changes.length === 0 || changes.length > 2) {
            return changes
          }
          clearHelperLines()
          let positionChange
          let dimensionChange
          let anchorNames = Object.keys(DEFAULT_ANCHORS)
          if (changes.length === 1) {
            if (changes[0].type === 'position') {
              positionChange = changes[0]
            } else {
              if (changes[0].type === 'dimensions') {
                dimensionChange = changes[0]
                anchorNames = ['right', 'bottom']
              }
            }
          } else {
            if (
              changes[0].type === 'position' &&
              changes[1].type === 'dimensions' &&
              changes[1].dimensions
            ) {
              positionChange = changes[0]
              dimensionChange = changes[1]
              anchorNames = ['top', 'left']
            }
          }
          const changedNode = currentNodes.find((node) => node.id === changes[0].id)
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
          const absolutePositionChange = {
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
    const { getNodes } = useReactFlow()
    return (
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={React.useCallback(
          (changes) => {
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
          (connection) => setEdges((currentEdges) => addEdge(connection, currentEdges)),
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
  const [Example] = React.useState(createExampleScope)
  return <Example />
}
export { HelperLinesCanvas as default }
