import * as React from 'react'
import { createDemoId } from '../runtime/create-id.js'
import {
  Position,
  useEdgesState,
  useReactFlow,
  useNodesState,
  ReactFlow,
  Panel,
  Controls,
  NodeResizer,
  Background,
  addEdge,
} from '@xyflow/react'
import { getStroke } from 'perfect-freehand'
function createExampleScope() {
  const freehandStrokeOptions = {
    size: 7,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    easing: (progress) => progress,
    start: {
      taper: 0,
      easing: (progress) => progress,
      cap: true,
    },
    end: {
      taper: 0.1,
      easing: (progress) => progress,
      cap: true,
    },
  }
  /* 用轮廓顶点和相邻点中点构造平滑的闭合二次贝塞尔路径，最后追加 Z 填充笔迹。 */
  function strokeOutlineToSvgPath(outlinePoints) {
    if (!outlinePoints.length) {
      return ''
    }
    const pathTokens = outlinePoints.reduce(
      (tokens, [x, y], pointIndex, points) => {
        const [nextX, nextY] = points[(pointIndex + 1) % points.length]
        tokens.push(x, y, ',', (x + nextX) / 2, (y + nextY) / 2)
        return tokens
      },
      ['M', ...outlinePoints[0], 'Q'],
    )
    pathTokens.push('Z')
    return pathTokens.join(' ')
  }
  /* perfect-freehand 根据采样坐标及压力生成笔迹轮廓；预览时按视口缩放补偿笔宽。 */
  function freehandStrokePath(points, strokeScale = 1) {
    return strokeOutlineToSvgPath(
      getStroke(points, {
        ...freehandStrokeOptions,
        size: freehandStrokeOptions.size * strokeScale,
      }),
    )
  }
  /* 始终保留初始采样点，按节点当前尺寸分别缩放横纵坐标，缩放节点时重算笔迹而不丢失压力。 */
  function FreehandNode({ data, width, height, selected, dragging }) {
    const scaleX = (width ?? 1) / data.initialSize.width
    const scaleY = (height ?? 1) / data.initialSize.height
    const scaledPoints = React.useMemo(
      () => data.points.map((point) => [point[0] * scaleX, point[1] * scaleY, point[2]]),
      [data.points, scaleX, scaleY],
    )
    return (
      <React.Fragment>
        <NodeResizer isVisible={selected && !dragging} />
        <svg
          width={width}
          height={height}
          style={{
            pointerEvents: selected ? 'auto' : 'none',
          }}
        >
          <path
            style={{
              pointerEvents: 'visiblePainted',
              cursor: 'pointer',
            }}
            d={freehandStrokePath(scaledPoints)}
          />
        </svg>
      </React.Fragment>
    )
  }
  /* 把屏幕采样点转成画布坐标，计算并扩展包围盒，再将点转换为节点内部的局部坐标。 */
  function freehandNodeFromScreenPoints(screenPoints, screenToFlowPosition) {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    const localPoints = []
    for (const screenPoint of screenPoints) {
      const { x: flowX, y: flowY } = screenToFlowPosition({
        x: screenPoint[0],
        y: screenPoint[1],
      })
      minX = Math.min(minX, flowX)
      minY = Math.min(minY, flowY)
      maxX = Math.max(maxX, flowX)
      maxY = Math.max(maxY, flowY)
      localPoints.push([flowX, flowY, screenPoint[2]])
    }
    const strokePadding = freehandStrokeOptions.size * 0.5
    minX -= strokePadding
    minY -= strokePadding
    maxX += strokePadding
    maxY += strokePadding
    for (const point of localPoints) {
      point[0] -= minX
      point[1] -= minY
    }
    const width = maxX - minX
    const height = maxY - minY
    return {
      position: {
        x: minX,
        y: minY,
      },
      width,
      height,
      data: {
        points: localPoints,
        initialSize: {
          width,
          height,
        },
      },
    }
  }
  /* 采样使用浏览器 client 坐标；预览换成覆盖层局部坐标，提交时通过官方 API 换成画布坐标。 */
  function FreehandDrawingOverlay() {
    const { screenToFlowPosition, getViewport, setNodes } = useReactFlow()
    const pointsRef = React.useRef([])
    const activePointerRef = React.useRef(null)
    const [previewPoints, setPreviewPoints] = React.useState([])

    function samplePoint(event) {
      return [event.clientX, event.clientY, event.pressure]
    }

    function updatePreview(element) {
      const bounds = element.getBoundingClientRect()
      setPreviewPoints(
        pointsRef.current.map(([x, y, pressure]) => [x - bounds.left, y - bounds.top, pressure]),
      )
    }

    function onPointerDown(event) {
      if (event.button !== 0 || activePointerRef.current !== null) return
      activePointerRef.current = event.pointerId
      event.currentTarget.setPointerCapture(event.pointerId)
      pointsRef.current = [samplePoint(event)]
      updatePreview(event.currentTarget)
    }

    function onPointerMove(event) {
      if (activePointerRef.current !== event.pointerId) return
      pointsRef.current.push(samplePoint(event))
      updatePreview(event.currentTarget)
    }

    function finishStroke(event, commit) {
      if (activePointerRef.current !== event.pointerId) return
      activePointerRef.current = null
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      if (commit && pointsRef.current.length) {
        const freehandNode = {
          id: createDemoId(),
          type: 'freehand',
          ...freehandNodeFromScreenPoints(pointsRef.current, screenToFlowPosition),
        }
        setNodes((nodes) => [...nodes, freehandNode])
      }
      pointsRef.current = []
      setPreviewPoints([])
    }

    return (
      <div
        className="freehand-overlay"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => finishStroke(event, true)}
        onPointerCancel={(event) => finishStroke(event, false)}
      >
        <svg>
          <path d={freehandStrokePath(previewPoints, getViewport().zoom)} />
        </svg>
      </div>
    )
  }
  const initialFreehandEdges = [
    {
      id: 'e1-2',
      source: '1',
      target: '2',
    },
  ]
  const initialFreehandNodes = [
    {
      id: '1',
      type: 'input',
      position: {
        x: 0,
        y: 0,
      },
      data: {
        label: 'Freehand',
      },
      sourcePosition: Position.Right,
    },
    {
      id: '2',
      type: 'output',
      position: {
        x: 500,
        y: 100,
      },
      data: {
        label: 'Drawing',
      },
      targetPosition: Position.Left,
    },
    {
      id: 'ddd8d011-ecaa-4262-a486-1c0d030f9426',
      type: 'freehand',
      position: {
        x: 492.48828125,
        y: -126.478515625,
      },
      width: 159.322265625,
      height: 135.498046875,
      data: {
        points: [
          [54.212890625, 131.998046875, 0.5],
          [53.599609375, 131.794921875, 0.5],
          [52.701171875, 131.197265625, 0.5],
          [49.19921875, 127.697265625, 0.5],
          [44.771484375, 123.271484375, 0.5],
          [37.33984375, 115.841796875, 0.5],
          [28.83203125, 106.484375, 0.5],
          [23.4609375, 101.115234375, 0.5],
          [15.712890625, 90.787109375, 0.5],
          [9.755859375, 79.728515625, 0.5],
          [6.802734375, 73.826171875, 0.5],
          [3.5, 63.919921875, 0.5],
          [3.5, 58.017578125, 0.5],
          [3.5, 52.115234375, 0.5],
          [4.30859375, 43.208984375, 0.5],
          [6.408203125, 38.30859375, 0.5],
          [9.4765625, 31.40625, 0.5],
          [13.310546875, 25.26953125, 0.5],
          [20.0234375, 16.0390625, 0.5],
          [24.44921875, 11.61328125, 0.5],
          [28.650390625, 8.8125, 0.5],
          [33.55078125, 6.712890625, 0.5],
          [37.451171875, 6.712890625, 0.5],
          [40.349609375, 7.29296875, 0.5],
          [44.55078125, 10.095703125, 0.5],
          [48.05078125, 14.298828125, 0.5],
          [52.001953125, 21.4140625, 0.5],
          [55.0703125, 28.318359375, 0.5],
          [59.197265625, 37.40234375, 0.5],
          [61.146484375, 41.3046875, 0.5],
          [62.09375, 43.203125, 0.5],
          [62.392578125, 44.1015625, 0.5],
          [62.595703125, 44.509765625, 0.5],
          [62.595703125, 44.71484375, 0.5],
          [62.798828125, 44.71484375, 0.5],
          [63.001953125, 44.30859375, 0.5],
          [67.744140625, 37.1953125, 0.5],
          [72.345703125, 31.826171875, 0.5],
          [77.87890625, 25.501953125, 0.5],
          [86.134765625, 19.72265625, 0.5],
          [98.18359375, 14.55859375, 0.5],
          [113.095703125, 10.173828125, 0.5],
          [123.001953125, 8.5234375, 0.5],
          [136.9140625, 5.916015625, 0.5],
          [146.8203125, 4.265625, 0.5],
          [153.72265625, 3.5, 0.5],
          [155.619140625, 3.5, 0.5],
          [155.619140625, 5.3984375, 0.5],
          [155.822265625, 5.806640625, 0.5],
          [155.822265625, 19.720703125, 0.5],
          [155.822265625, 32.6328125, 0.5],
          [153.212890625, 46.546875, 0.5],
          [149.91015625, 56.455078125, 0.5],
          [144.875, 66.525390625, 0.5],
          [133.298828125, 79.880859375, 0.5],
          [124.90625, 87.43359375, 0.5],
          [109.67578125, 98.185546875, 0.5],
          [95.52734375, 107.02734375, 0.5],
          [87.26953125, 112.80859375, 0.5],
          [80.943359375, 117.552734375, 0.5],
          [75.77734375, 121.2421875, 0.5],
          [70.611328125, 124.1953125, 0.5],
          [66.408203125, 126.998046875, 0.5],
          [64.087890625, 128.73828125, 0.5],
          [62.6640625, 130.162109375, 0.5],
          [62.064453125, 131.060546875, 0.5],
          [61.65625, 131.46875, 0.5],
          [61.65625, 131.673828125, 0.5],
        ],
        initialSize: {
          width: 159.322265625,
          height: 135.498046875,
        },
      },
      measured: {
        width: 159,
        height: 135,
      },
    },
    {
      id: 'de42b985-8af8-4c72-8e1a-46d620b42d6a',
      type: 'freehand',
      position: {
        x: 154.439453125,
        y: -34.9873046875,
      },
      width: 332.31640625,
      height: 53.755859375,
      data: {
        points: [
          [3.5, 50.255859375, 0.5],
          [3.703125, 50.255859375, 0.5],
          [4.599609375, 50.255859375, 0.5],
          [5.49609375, 50.255859375, 0.5],
          [9.396484375, 50.255859375, 0.5],
          [13.296875, 50.255859375, 0.5],
          [19.19921875, 50.255859375, 0.5],
          [24.099609375, 50.255859375, 0.5],
          [36.009765625, 49.40625, 0.5],
          [53.92578125, 45.82421875, 0.5],
          [67.837890625, 41.4765625, 0.5],
          [93.626953125, 33.541015625, 0.5],
          [114.634765625, 27.1484375, 0.5],
          [134.64453125, 20.78125, 0.5],
          [156.56640625, 16.21484375, 0.5],
          [179.48828125, 11.630859375, 0.5],
          [200.408203125, 7.994140625, 0.5],
          [220.326171875, 5.279296875, 0.5],
          [237.2421875, 3.5, 0.5],
          [249.15234375, 3.5, 0.5],
          [258.05859375, 3.5, 0.5],
          [265.962890625, 3.5, 0.5],
          [274.869140625, 4.310546875, 0.5],
          [285.77734375, 5.150390625, 0.5],
          [297.6875, 6.853515625, 0.5],
          [310.59765625, 7.71484375, 0.5],
          [322.5078125, 7.71484375, 0.5],
          [328.41015625, 8.453125, 0.5],
          [328.81640625, 8.453125, 0.5],
        ],
        initialSize: {
          width: 332.31640625,
          height: 53.755859375,
        },
      },
      measured: {
        width: 332,
        height: 54,
      },
    },
  ]
  const freehandNodeTypes = {
    freehand: FreehandNode,
  }
  /* 绘画模式让覆盖层接管指针，同时关闭画布平移与滚轮缩放；选择模式恢复画布操作。 */
  function FreehandDrawExample() {
    const [nodes, , onNodesChange] = useNodesState(initialFreehandNodes)
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialFreehandEdges)
    const [drawingMode, setDrawingMode] = React.useState(true)
    return (
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={React.useCallback(
          (connection) => setEdges((edges) => addEdge(connection, edges)),
          [setEdges],
        )}
        nodeTypes={freehandNodeTypes}
        panOnDrag={!drawingMode}
        zoomOnScroll={!drawingMode}
        panOnScroll={!drawingMode}
        selectNodesOnDrag={!drawingMode}
        fitView
        colorMode="system"
      >
        {drawingMode && <FreehandDrawingOverlay />}
        <Controls />
        <Background />
        <Panel position="top-left">
          <div className="xy-theme__button-group">
            <button
              className={`xy-theme__button ${drawingMode ? 'active' : ''}`}
              onClick={() => setDrawingMode(true)}
            >
              {'Drawing Mode'}
            </button>
            <button
              className={`xy-theme__button ${drawingMode ? '' : 'active'}`}
              onClick={() => setDrawingMode(false)}
            >
              {'Selection Mode'}
            </button>
          </div>
        </Panel>
      </ReactFlow>
    )
  }
  const initialElement = (
    <React.StrictMode>
      <FreehandDrawExample />
    </React.StrictMode>
  )
  return function ExampleRoot() {
    return initialElement
  }
}
function FreehandDrawCanvas() {
  const [Example] = React.useState(createExampleScope)
  return <Example />
}
export { FreehandDrawCanvas as default }
