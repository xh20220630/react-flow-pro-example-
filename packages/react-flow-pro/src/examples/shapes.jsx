import * as React from 'react'
import {
  Position,
  ConnectionMode,
  MarkerType,
  ConnectionLineType,
  useInternalNode,
  useReactFlow,
  useKeyPress,
  ReactFlow,
  MiniMap,
  ReactFlowProvider,
  Panel,
  NodeToolbar,
  Controls,
  NodeResizer,
  Background,
  Handle,
} from '@xyflow/react'
function createExampleScope() {
  const initialShapeNodes = [
    {
      id: '1',
      type: 'shape',
      position: {
        x: 0,
        y: 0,
      },
      style: {
        width: 120,
        height: 60,
      },
      data: {
        type: 'round-rectangle',
        color: '#3F8AE2',
      },
    },
    {
      id: '2',
      type: 'shape',
      position: {
        x: 10,
        y: 120,
      },
      style: {
        width: 100,
        height: 100,
      },
      data: {
        type: 'diamond',
        color: '#EA9C41',
      },
    },
    {
      id: '3',
      type: 'shape',
      position: {
        x: -160,
        y: 130,
      },
      style: {
        width: 80,
        height: 80,
      },
      data: {
        type: 'circle',
        color: '#438D57',
      },
    },
    {
      id: '4',
      type: 'shape',
      position: {
        x: 200,
        y: 140,
      },
      style: {
        width: 120,
        height: 60,
      },
      data: {
        type: 'hexagon',
        color: '#CF4C2C',
      },
    },
    {
      id: '5',
      type: 'shape',
      position: {
        x: 380,
        y: 280,
      },
      style: {
        width: 100,
        height: 100,
      },
      data: {
        type: 'rectangle',
        color: '#438D57',
      },
    },
    {
      id: '6',
      type: 'shape',
      position: {
        x: -260,
        y: 320,
      },
      style: {
        width: 140,
        height: 60,
      },
      data: {
        type: 'arrow-rectangle',
        color: '#803DEC',
      },
    },
    {
      id: '7',
      type: 'shape',
      position: {
        x: 10,
        y: 300,
      },
      style: {
        width: 100,
        height: 100,
      },
      data: {
        type: 'cylinder',
        color: '#EBC347',
      },
      selected: true,
    },
    {
      id: '8',
      type: 'shape',
      position: {
        x: 10,
        y: 500,
      },
      style: {
        width: 100,
        height: 80,
      },
      data: {
        type: 'triangle',
        color: '#3F8AE2',
      },
    },
    {
      id: '9',
      type: 'shape',
      position: {
        x: 180,
        y: 420,
      },
      style: {
        width: 140,
        height: 60,
      },
      data: {
        type: 'parallelogram',
        color: '#803DEC',
      },
    },
    {
      id: '10',
      type: 'shape',
      position: {
        x: -230,
        y: 460,
      },
      style: {
        width: 80,
        height: 80,
      },
      data: {
        type: 'plus',
        color: '#CF4C2C',
      },
    },
  ]
  const initialShapeEdges = [
    {
      id: '1->2',
      source: '1',
      target: '2',
      sourceHandle: 'bottom',
      targetHandle: 'top',
    },
    {
      id: '2->3',
      source: '2',
      target: '3',
      sourceHandle: 'left',
      targetHandle: 'right',
    },
    {
      id: '2->4',
      source: '2',
      target: '4',
      sourceHandle: 'right',
      targetHandle: 'left',
    },
    {
      id: '4->5',
      source: '4',
      target: '5',
      sourceHandle: 'right',
      targetHandle: 'top',
    },
    {
      id: '3->6',
      source: '3',
      target: '6',
      sourceHandle: 'bottom',
      targetHandle: 'top',
    },
    {
      id: '6->7',
      source: '6',
      target: '7',
      sourceHandle: 'right',
      targetHandle: 'left',
    },
    {
      id: '4->7',
      source: '4',
      target: '7',
      sourceHandle: 'bottom',
      targetHandle: 'top',
    },
    {
      id: '7->8',
      source: '7',
      target: '8',
      sourceHandle: 'bottom',
      targetHandle: 'top',
    },
    {
      id: '5->9',
      source: '5',
      target: '9',
      sourceHandle: 'left',
      targetHandle: 'top',
    },
    {
      id: '6->10',
      source: '6',
      target: '10',
      sourceHandle: 'bottom',
      targetHandle: 'top',
    },
    {
      id: '10->8',
      source: '10',
      target: '8',
      sourceHandle: 'right',
      targetHandle: 'left',
    },
  ]
  function EllipseShape({ width, height, ...svgProps }) {
    return <ellipse cx={width / 2} cy={height / 2} rx={width / 2} ry={height / 2} {...svgProps} />
  }
  function RoundedRectangleShape({ width, height, ...svgProps }) {
    return (
      <rect
        x={0}
        y={0}
        rx={Math.min(12, 0.2 * Math.min(width, height))}
        width={width}
        height={height}
        {...svgProps}
      />
    )
  }
  function RectangleShape({ width, height, ...svgProps }) {
    return <rect x={0} y={0} width={width} height={height} {...svgProps} />
  }
  /* 将顶点序列转换成闭合 SVG 路径；各多边形复用同一套宽高坐标。 */
  function closedPolygonPath(vertices) {
    return `M${vertices.map(([x, y]) => `${x},${y}`).join(' L')} Z`
  }
  function HexagonShape({ width, height, ...svgProps }) {
    const sideInset = width * 0.1
    return (
      <path
        d={closedPolygonPath([
          [0, height / 2],
          [sideInset, 0],
          [width - sideInset, 0],
          [width, height / 2],
          [width - sideInset, height],
          [sideInset, height],
        ])}
        {...svgProps}
      />
    )
  }
  function DiamondShape({ width, height, ...svgProps }) {
    return (
      <path
        d={closedPolygonPath([
          [0, height / 2],
          [width / 2, 0],
          [width, height / 2],
          [width / 2, height],
        ])}
        {...svgProps}
      />
    )
  }
  function ArrowRectangleShape({ width, height, ...svgProps }) {
    const arrowDepth = width * 0.1
    return (
      <path
        d={closedPolygonPath([
          [0, 0],
          [width - arrowDepth, 0],
          [width, height / 2],
          [width - arrowDepth, height],
          [0, height],
        ])}
        {...svgProps}
      />
    )
  }
  function CylinderShape({ width, height, ...svgProps }) {
    const capRadiusY = height * 0.125
    return (
      <path
        d={`M0,${capRadiusY}  L 0,${height - capRadiusY} A ${width / 2} ${capRadiusY} 0 1 0 ${width} ${height - capRadiusY} L ${width},${capRadiusY} A ${width / 2} ${capRadiusY} 0 1 1 0 ${capRadiusY} A ${width / 2} ${capRadiusY} 0 1 1 ${width} ${capRadiusY} A ${width / 2} ${capRadiusY} 0 1 1 0 ${capRadiusY} z`}
        {...svgProps}
      />
    )
  }
  function TriangleShape({ width, height, ...svgProps }) {
    return (
      <path
        d={closedPolygonPath([
          [0, height],
          [width / 2, 0],
          [width, height],
        ])}
        {...svgProps}
      />
    )
  }
  function ParallelogramShape({ width, height, ...svgProps }) {
    const skewInset = width * 0.25
    return (
      <path
        d={closedPolygonPath([
          [0, height],
          [skewInset, 0],
          [width, 0],
          [width - skewInset, height],
        ])}
        {...svgProps}
      />
    )
  }
  function PlusShape({ width, height, ...svgProps }) {
    return (
      <path
        d={closedPolygonPath([
          [width / 3, 0],
          [(2 / 3) * width, 0],
          [(2 / 3) * width, height / 3],
          [width, height / 3],
          [width, (2 / 3) * height],
          [width, (2 / 3) * height],
          [(2 / 3) * width, (2 / 3) * height],
          [(2 / 3) * width, height],
          [(2 / 3) * width, height],
          [width / 3, height],
          [width / 3, (2 / 3) * height],
          [0, (2 / 3) * height],
          [0, height / 3],
          [width / 3, height / 3],
        ])}
        {...svgProps}
      />
    )
  }
  const shapeComponents = {
    circle: EllipseShape,
    'round-rectangle': RoundedRectangleShape,
    rectangle: RectangleShape,
    hexagon: HexagonShape,
    diamond: DiamondShape,
    'arrow-rectangle': ArrowRectangleShape,
    cylinder: CylinderShape,
    triangle: TriangleShape,
    parallelogram: ParallelogramShape,
    plus: PlusShape,
  }
  /* 从外部尺寸扣除描边占用的空间，再平移绘制形状，避免描边被 SVG 边界裁切。 */
  function ShapeSvg({ type: shapeType, width, height, ...svgProps }) {
    const ShapeComponent = shapeComponents[shapeType]
    if (!ShapeComponent || !width || !height) {
      return null
    }
    const strokeInset = svgProps.strokeWidth ? +svgProps.strokeWidth : 0
    const innerWidth = width - 2 * strokeInset
    const innerHeight = height - 2 * strokeInset
    return (
      <svg width={width} height={height} className="shape-svg">
        <g transform={`translate(${svgProps.strokeWidth ?? 0}, ${svgProps.strokeWidth ?? 0})`}>
          <ShapeComponent width={innerWidth} height={innerHeight} {...svgProps} />
        </g>
      </svg>
    )
  }
  const shapeColors = ['#CF4C2C', '#EA9C41', '#EBC347', '#438D57', '#3F8AE2', '#803DEC']
  function ShapeColorToolbar({ onColorChange = () => false, activeColor }) {
    return (
      <NodeToolbar className="nodrag" offset={32}>
        {shapeColors.map((color) => (
          <button
            key={color}
            style={{
              backgroundColor: color,
            }}
            onClick={() => onColorChange(color)}
            className={`color-swatch ${color === activeColor ? 'active' : ''}`}
          />
        ))}
      </NodeToolbar>
    )
  }
  const shapeHandlePositions = [Position.Top, Position.Right, Position.Bottom, Position.Left]
  /* 形状节点共享颜色工具栏、尺寸控制和四向连接点；按住 Shift 时保持宽高比例。 */
  function ShapeNode({ id: nodeId, selected, data, width, height }) {
    const { color, type: shapeType } = data
    const { updateNodeData } = useReactFlow()
    const shiftPressed = useKeyPress('Shift')
    return (
      <React.Fragment>
        <ShapeColorToolbar
          onColorChange={React.useCallback(
            (nextColor) => {
              updateNodeData(nodeId, {
                color: nextColor,
              })
            },
            [nodeId, updateNodeData],
          )}
          activeColor={color}
        />
        <NodeResizer color={color} keepAspectRatio={shiftPressed} isVisible={selected} />
        <ShapeSvg
          type={shapeType}
          width={width}
          height={height}
          fill={color}
          strokeWidth={2}
          stroke={color}
          fillOpacity={0.8}
        />
        <input type="text" className="node-label" placeholder={shapeType} />
        {shapeHandlePositions.map((position) => (
          <Handle
            id={position}
            style={{
              backgroundColor: color,
            }}
            type="source"
            position={position}
          />
        ))}
      </React.Fragment>
    )
  }
  /* 拖拽时把形状类型写入 DataTransfer，并使用隐藏的 SVG 预览作为拖拽图像。 */
  function ShapeSidebarItem({ type: shapeType }) {
    const dragImageRef = React.useRef(null)
    return (
      <div
        className="sidebar-item"
        draggable
        onDragStart={(dragEvent) => {
          dragEvent.dataTransfer?.setData('application/reactflow', shapeType)
          if (dragImageRef.current) {
            dragEvent.dataTransfer.setDragImage(dragImageRef.current, 0, 0)
          }
        }}
      >
        <ShapeSvg type={shapeType} fill="transparent" strokeWidth={1} width={28} height={28} />
        <div className="sidebar-item-drag-image" ref={dragImageRef}>
          <ShapeSvg
            type={shapeType}
            width={80}
            height={80}
            fill="#3F8AE2"
            fillOpacity={0.7}
            stroke="#3F8AE2"
            strokeWidth={2}
          />
        </div>
      </div>
    )
  }
  function ShapeSidebar() {
    return (
      <div className="sidebar">
        <div className="sidebar-label">{'Drag shapes to the canvas'}</div>
        <div className="sidebar-items">
          {Object.keys(shapeComponents).map((shapeType) => (
            <ShapeSidebarItem key={shapeType} type={shapeType} />
          ))}
        </div>
      </div>
    )
  }
  function ShapeMiniMapNode({ id: nodeId, width, height, x, y, selected }) {
    const internalNode = useInternalNode(nodeId)
    if (!internalNode) {
      return
    }
    const { color, type: shapeType } = internalNode.internals.userNode.data
    if (!color || !shapeType) {
      return null
    }
    const ShapeComponent = shapeComponents[shapeType]
    return (
      <g
        transform={`translate(${x}, ${y})`}
        className={selected ? 'react-flow__minimap-node selected' : 'react-flow__minimap-node'}
      >
        <ShapeComponent width={width} height={height} fill={color} strokeWidth={selected ? 6 : 0} />
      </g>
    )
  }
  const shapeNodeTypes = {
    shape: ShapeNode,
  }
  const shapeDefaultEdgeOptions = {
    type: 'smoothstep',
    markerEnd: {
      type: MarkerType.ArrowClosed,
    },
    style: {
      strokeWidth: 2,
    },
  }
  const shapeProOptions = {
    account: 'paid-pro',
    hideAttribution: true,
  }
  const shapeSnapGrid = [10, 10]
  /* 将屏幕落点转换到画布坐标，取消已有节点的选中状态，再插入并选中新形状节点。 */
  function ShapesFlow() {
    const { screenToFlowPosition, setNodes } = useReactFlow()
    return (
      <ReactFlow
        defaultNodes={initialShapeNodes}
        defaultEdges={initialShapeEdges}
        nodeTypes={shapeNodeTypes}
        defaultEdgeOptions={shapeDefaultEdgeOptions}
        connectionLineType={ConnectionLineType.SmoothStep}
        fitView
        connectionMode={ConnectionMode.Loose}
        onDrop={(dropEvent) => {
          dropEvent.preventDefault()
          const shapeType = dropEvent.dataTransfer.getData('application/reactflow')
          const position = screenToFlowPosition({
            x: dropEvent.clientX,
            y: dropEvent.clientY,
          })
          const newNode = {
            id: Date.now().toString(),
            type: 'shape',
            position,
            style: {
              width: 100,
              height: 100,
            },
            data: {
              type: shapeType,
              color: '#3F8AE2',
            },
            selected: true,
          }
          setNodes((nodes) =>
            nodes
              .map((node) => ({
                ...node,
                selected: false,
              }))
              .concat([newNode]),
          )
        }}
        snapGrid={shapeSnapGrid}
        onDragOver={(dragEvent) => {
          dragEvent.preventDefault()
          dragEvent.dataTransfer.dropEffect = 'move'
        }}
        proOptions={shapeProOptions}
        colorMode="system"
      >
        <Background />
        <Panel position="top-left" className="panel-shapes">
          <ShapeSidebar />
        </Panel>
        <Controls />
        <MiniMap zoomable draggable nodeComponent={ShapeMiniMapNode} />
      </ReactFlow>
    )
  }
  function ShapesExample() {
    return (
      <ReactFlowProvider>
        <ShapesFlow />
      </ReactFlowProvider>
    )
  }
  const initialElement = (
    <React.StrictMode>
      <ShapesExample />
    </React.StrictMode>
  )
  return function ExampleRoot() {
    return initialElement
  }
}
function ShapesCanvas() {
  const [Example] = React.useState(createExampleScope)
  return <Example />
}
export { ShapesCanvas as default }
