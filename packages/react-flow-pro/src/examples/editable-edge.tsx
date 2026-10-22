/**
 * 可编辑连线：由控制点生成多种路径，支持拖动控制点、移动折线段以及绘制连接草稿。
 * 每个画布实例通过 createExampleScope 创建独立作用域，避免缓存、store 和可变初始数据跨实例共享。
 */
import * as React from 'react'
import { createDemoId } from '../runtime/create-id'
import {
  Position,
  ConnectionMode,
  MarkerType,
  useEdgesState,
  useReactFlow,
  useStore,
  useNodesState,
  ReactFlow,
  ReactFlowProvider,
  Panel,
  BaseEdge,
  Background,
  Handle,
  addEdge,
} from '@xyflow/react'
import { create } from 'zustand'
import type {
  Connection,
  ConnectionLineComponentProps,
  Edge,
  EdgeProps,
  Node,
  XYPosition,
} from '@xyflow/react'

/** 端点没有 ID；已保存控制点和临时插入控制点都在坐标上附加编辑元数据。 */
interface PathPoint extends XYPosition {
  id?: string
  active?: boolean | undefined
  prev?: string | XYPosition | undefined
  direction?: StepDirection | undefined
}
interface IdentifiedControlPoint extends PathPoint {
  id: string
}
type StepDirection = 'horiztonal' | 'vertical'
type EdgeAlgorithmName = 'Catmull-Rom' | 'Bezier Catmull-Rom' | 'Step' | 'Linear'
interface HandleSides {
  fromSide: Position
  toSide: Position
}
/** points 只保存内部控制点，绘制时才拼接两端 Handle，避免把旧端点位置持久化。 */
type EditableEdgeModel = Edge<
  { points: PathPoint[]; algorithm?: EdgeAlgorithmName | undefined },
  'editable-edge'
>
type ControlPointUpdater = (points: PathPoint[]) => PathPoint[]
interface ControlPointProps extends IdentifiedControlPoint {
  index: number
  color: string
  setControlPoints: (update: ControlPointUpdater) => void
}
interface StepControlPointProps extends ControlPointProps {
  initialStepPoints: PathPoint[]
}
interface PathOptions {
  points: PathPoint[]
  algorithm?: EdgeAlgorithmName | undefined
  sides?: HandleSides
  initialStepPoints: PathPoint[]
}
interface StepPointsOptions {
  points: PathPoint[]
  initialStepPoints: PathPoint[]
}
interface InitialStepOptions {
  source: XYPosition
  target: XYPosition
  sourcePosition?: Position
  targetPosition?: Position
  center?: { x: number | undefined; y: number | undefined }
  offset?: number
}
interface ConnectionLineStore {
  connectionLinePath: XYPosition[]
  setConnectionLinePath: (points: XYPosition[]) => void
}

/** 创建本示例的组件、算法和局部状态；根组件惰性初始化后在本次挂载中复用。 */
function createExampleScope() {
  // 保留原方向值的拼写；方向只约束控制点移动的轴，不参与显示文字。
  const StepMoveDirection = { Horizontal: 'horiztonal', Vertical: 'vertical' } as const
  /**
   * 曲线控制点有两种状态：active 点已经保存在边数据中，空心中点只用于插入新点。
   * 移动 active 点按 ID 替换坐标；移动空心中点则按 controlIndex 插入一个新的 active 点。
   * 指针位置使用 screenToFlowPosition 转换为画布坐标，方向键按固定步长移动同一组数据。
   * 删除后尝试把焦点移到前一个实心控制点；拖动结束或组件卸载时解除 DOM 指针监听。
   */
  function CurveControlPoint({
    id: controlPointId,
    index: controlIndex,
    x,
    y,
    color,
    active,
    setControlPoints,
  }: ControlPointProps) {
    const flowDomNode = useStore((storeState) => storeState.domNode)
    const { screenToFlowPosition } = useReactFlow<Node, EditableEdgeModel>()
    const [dragging, setDragging] = React.useState(false)
    const circleRef = React.useRef<SVGCircleElement | null>(null)
    const moveControlPoint = React.useCallback(
      (position: XYPosition) => {
        setControlPoints((controlPoints) =>
          active
            ? controlPoints.map((controlPoint) =>
                controlPoint.id === controlPointId
                  ? {
                      ...controlPoint,
                      ...position,
                    }
                  : controlPoint,
              )
            : controlIndex === 0
              ? [
                  {
                    ...position,
                    id: controlPointId,
                    active: true,
                  },
                  ...controlPoints,
                ]
              : controlPoints.flatMap((controlPoint, pointIndex) =>
                  pointIndex === controlIndex * 0.5 - 1
                    ? [
                        controlPoint,
                        {
                          ...position,
                          id: controlPointId,
                          active: true,
                        },
                      ]
                    : controlPoint,
                ),
        )
      },
      [controlPointId, active, controlIndex, setControlPoints],
    )
    const removeControlPoint = React.useCallback(() => {
      setControlPoints((controlPoints) =>
        controlPoints.filter((controlPoint) => controlPoint.id !== controlPointId),
      )
      const previousActiveCircle = circleRef.current?.previousElementSibling?.previousElementSibling
      if (
        previousActiveCircle instanceof SVGCircleElement &&
        previousActiveCircle.classList.contains('active')
      ) {
        window.requestAnimationFrame(() => {
          previousActiveCircle.focus()
        })
      }
    }, [controlPointId, setControlPoints])
    const onKeyDown = React.useCallback(
      (keyboardEvent: React.KeyboardEvent<SVGCircleElement>) => {
        switch (keyboardEvent.key) {
          case 'Enter':
          case 'Space':
            if (!active) {
              keyboardEvent.preventDefault()
            }
            moveControlPoint({
              x,
              y,
            })
            break
          case 'Backspace':
          case 'Delete':
            keyboardEvent.stopPropagation()
            removeControlPoint()
            break
          case 'ArrowLeft':
            moveControlPoint({
              x: x - 5,
              y,
            })
            break
          case 'ArrowRight':
            moveControlPoint({
              x: x + 5,
              y,
            })
            break
          case 'ArrowUp':
            moveControlPoint({
              x,
              y: y - 5,
            })
            break
          case 'ArrowDown':
            moveControlPoint({
              x,
              y: y + 5,
            })
            break
          default:
            break
        }
      },
      [active, moveControlPoint, x, y, removeControlPoint],
    )
    React.useEffect(() => {
      if (!flowDomNode || !active || !dragging) {
        return
      }
      const onPointerMove = (pointerEvent: PointerEvent) => {
        moveControlPoint(
          screenToFlowPosition({
            x: pointerEvent.clientX,
            y: pointerEvent.clientY,
          }),
        )
      }
      const onPointerEnd = (pointerEvent: PointerEvent) => {
        flowDomNode.removeEventListener('pointermove', onPointerMove)
        if (!active) {
          pointerEvent.preventDefault()
        }
        setDragging(false)
        moveControlPoint(
          screenToFlowPosition({
            x: pointerEvent.clientX,
            y: pointerEvent.clientY,
          }),
        )
      }
      flowDomNode.addEventListener('pointermove', onPointerMove)
      flowDomNode.addEventListener('pointerup', onPointerEnd, {
        once: true,
      })
      flowDomNode.addEventListener('pointerleave', onPointerEnd, {
        once: true,
      })
      return () => {
        flowDomNode.removeEventListener('pointermove', onPointerMove)
        flowDomNode.removeEventListener('pointerup', onPointerEnd)
        flowDomNode.removeEventListener('pointerleave', onPointerEnd)
        setDragging(false)
      }
    }, [
      controlPointId,
      flowDomNode,
      dragging,
      active,
      screenToFlowPosition,
      setControlPoints,
      moveControlPoint,
    ])
    return (
      <circle
        ref={circleRef}
        tabIndex={0}
        id={controlPointId}
        className={'nopan nodrag' + (active ? ' active' : '')}
        cx={x}
        cy={y}
        r={active ? 4 : 3}
        strokeOpacity={active ? 1 : 0.3}
        stroke={color}
        fill={active ? color : 'white'}
        style={{
          pointerEvents: 'all',
        }}
        onContextMenu={(contextMenuEvent) => {
          contextMenuEvent.preventDefault()
          if (active) {
            removeControlPoint()
          }
        }}
        onPointerDown={(pointerEvent) => {
          if (pointerEvent.button !== 2) {
            moveControlPoint({
              x,
              y,
            })
            setDragging(true)
          }
        }}
        onKeyDown={onKeyDown}
        onPointerUp={() => setDragging(false)}
      />
    )
  }
  const isStoredControlPoint = (point: PathPoint): point is IdentifiedControlPoint => 'id' in point
  function linearPath(points: PathPoint[]) {
    if (points.length < 1) {
      return ''
    }
    let path = `M ${points[0]!.x} ${points[0]!.y}`
    for (let pointIndex = 0; pointIndex < points.length; pointIndex++)
      path += ` L ${points[pointIndex]!.x} ${points[pointIndex]!.y}`
    return path
  }
  /* 在每对相邻顶点之间生成一个非激活中点；保留已有控制点，允许用户从任意线段继续插点。 */
  function linearControlPoints(points: PathPoint[]): IdentifiedControlPoint[] {
    const controls: IdentifiedControlPoint[] = []
    for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex++) {
      const segmentStart = points[pointIndex]!
      const segmentEnd = points[pointIndex + 1]!
      if (isStoredControlPoint(segmentStart)) {
        controls.push(segmentStart)
      }
      controls.push({
        prev: 'id' in segmentStart ? segmentStart.id : undefined,
        id: `spline-${createDemoId()}`,
        active: false,
        x: (segmentStart.x + segmentEnd.x) / 2,
        y: (segmentStart.y + segmentEnd.y) / 2,
      })
    }
    return controls
  }
  function bezierControlOffset(distance: number, curvature: number) {
    if (distance >= 0) {
      return 0.5 * distance
    } else {
      return curvature * 25 * Math.sqrt(-distance)
    }
  }
  /* 根据连接点朝向设置贝塞尔端部控制坐标，反向连接时用曲率和距离平方根增加弯曲空间。 */
  function bezierHandleControl(
    side: Position,
    sourceX: number,
    sourceY: number,
    targetX: number,
    targetY: number,
    curvature: number,
  ): [number, number] {
    switch (side) {
      case Position.Left:
        return [sourceX - bezierControlOffset(sourceX - targetX, curvature), sourceY]
      case Position.Right:
        return [sourceX + bezierControlOffset(targetX - sourceX, curvature), sourceY]
      case Position.Top:
        return [sourceX, sourceY - bezierControlOffset(sourceY - targetY, curvature)]
      case Position.Bottom:
        return [sourceX, sourceY + bezierControlOffset(targetY - sourceY, curvature)]
    }
  }
  /**
   * 对每对相邻路径点计算一段三次贝塞尔曲线，使路径经过所有已保存控制点。
   * 每段使用前驱、起点、终点和后继四个点，按 Catmull-Rom 系数换算两端贝塞尔控制坐标。
   * 没有前驱或后继时默认复用端点；启用方向约束后，使用虚拟点匹配 Handle 出入方向。
   * 输出只包含 SVG 路径文本，不修改 points；同一组点另由控制点生成函数计算可插入中点。
   */
  function catmullRomPath(
    points: PathPoint[],
    respectHandleDirections = false,
    sides: HandleSides = {
      fromSide: Position.Left,
      toSide: Position.Right,
    },
  ) {
    if (points.length < 2) {
      return ''
    }
    let path = `M ${points[0]!.x} ${points[0]!.y}`
    for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex++) {
      const segmentStart = points[pointIndex]!
      const segmentEnd = points[pointIndex + 1]!
      const previousPoint =
        points[pointIndex - 1] ??
        (respectHandleDirections
          ? sourcePhantomPoint(segmentStart, segmentEnd, sides.fromSide)
          : segmentStart)
      const nextPoint =
        points[pointIndex + 2] ??
        (respectHandleDirections
          ? targetPhantomPoint(segmentStart, segmentEnd, sides.toSide)
          : segmentEnd)
      const startControl = {
        x: (-previousPoint.x + 6 * segmentStart.x + segmentEnd.x) / 6,
        y: (-previousPoint.y + 6 * segmentStart.y + segmentEnd.y) / 6,
      }
      const endControl = {
        x: (segmentStart.x + 6 * segmentEnd.x - nextPoint.x) / 6,
        y: (segmentStart.y + 6 * segmentEnd.y - nextPoint.y) / 6,
      }
      path += ` C ${startControl.x} ${startControl.y}, ${endControl.x} ${endControl.y}, ${segmentEnd.x} ${segmentEnd.y}`
    }
    return path
  }
  /* 沿 Catmull-Rom 曲线在每段中点生成插入控制点，已保存顶点继续作为激活控制点保留。 */
  function catmullRomControlPoints(
    points: PathPoint[],
    respectHandleDirections = false,
    sides: HandleSides = {
      fromSide: Position.Left,
      toSide: Position.Right,
    },
  ) {
    const controls: IdentifiedControlPoint[] = []
    for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex++) {
      const segmentStart = points[pointIndex]!
      const segmentEnd = points[pointIndex + 1]!
      const previousPoint =
        points[pointIndex - 1] ??
        (respectHandleDirections
          ? sourcePhantomPoint(segmentStart, segmentEnd, sides.fromSide)
          : segmentStart)
      const nextPoint =
        points[pointIndex + 2] ??
        (respectHandleDirections
          ? targetPhantomPoint(segmentStart, segmentEnd, sides.toSide)
          : segmentEnd)
      if (isStoredControlPoint(segmentStart)) {
        controls.push(segmentStart)
      }
      controls.push({
        id: '',
        active: false,
        x: catmullRomCoordinate(previousPoint.x, segmentStart.x, segmentEnd.x, nextPoint.x),
        y: catmullRomCoordinate(previousPoint.y, segmentStart.y, segmentEnd.y, nextPoint.y),
      })
    }
    return controls
  }
  /* 由起点连接柄的贝塞尔控制坐标反推一个虚拟前驱点，使曲线离开起点的方向与连接柄一致。 */
  function sourcePhantomPoint(sourcePoint: XYPosition, nextPoint: XYPosition, side: Position) {
    const handleControl = bezierHandleControl(
      side,
      sourcePoint.x,
      sourcePoint.y,
      nextPoint.x,
      nextPoint.y,
      0.25,
    )
    return {
      x: nextPoint.x + 6 * (sourcePoint.x - handleControl[0]),
      y: nextPoint.y + 6 * (sourcePoint.y - handleControl[1]),
    }
  }
  /* 由终点连接柄的贝塞尔控制坐标反推一个虚拟后继点，使曲线进入终点的方向与连接柄一致。 */
  function targetPhantomPoint(previousPoint: XYPosition, targetPoint: XYPosition, side: Position) {
    const handleControl = bezierHandleControl(
      side,
      targetPoint.x,
      targetPoint.y,
      previousPoint.x,
      previousPoint.y,
      0.25,
    )
    return {
      x: previousPoint.x + 6 * (targetPoint.x - handleControl[0]),
      y: previousPoint.y + 6 * (targetPoint.y - handleControl[1]),
    }
  }
  function catmullRomCoordinate(
    previousCoordinate: number,
    startCoordinate: number,
    endCoordinate: number,
    followingCoordinate: number,
    progress = 0.5,
  ) {
    const progressSquared = progress ** 2
    const progressCubed = progress ** 3
    return (
      0.5 *
      (2 * startCoordinate +
        (-previousCoordinate + endCoordinate) * progress +
        (2 * previousCoordinate - 5 * startCoordinate + 4 * endCoordinate - followingCoordinate) *
          progressSquared +
        (-previousCoordinate + 3 * startCoordinate - 3 * endCoordinate + followingCoordinate) *
          progressCubed)
    )
  }
  function edgeCenter({
    sourceX,
    sourceY,
    targetX,
    targetY,
  }: {
    sourceX: number
    sourceY: number
    targetX: number
    targetY: number
  }): [number, number, number, number] {
    const halfWidth = Math.abs(targetX - sourceX) / 2
    const centerX = targetX < sourceX ? targetX + halfWidth : targetX - halfWidth
    const halfHeight = Math.abs(targetY - sourceY) / 2
    return [
      centerX,
      targetY < sourceY ? targetY + halfHeight : targetY - halfHeight,
      halfWidth,
      halfHeight,
    ]
  }
  const handleDirections = {
    [Position.Left]: {
      x: -1,
      y: 0,
    },
    [Position.Right]: {
      x: 1,
      y: 0,
    },
    [Position.Top]: {
      x: 0,
      y: -1,
    },
    [Position.Bottom]: {
      x: 0,
      y: 1,
    },
  }
  const stepTravelDirection = ({
    source,
    sourcePosition = Position.Bottom,
    target,
  }: InitialStepOptions) =>
    sourcePosition === Position.Left || sourcePosition === Position.Right
      ? source.x < target.x
        ? {
            x: 1,
            y: 0,
          }
        : {
            x: -1,
            y: 0,
          }
      : source.y < target.y
        ? {
            x: 0,
            y: 1,
          }
        : {
            x: 0,
            y: -1,
          }
  const pointDistance = (sourcePoint: XYPosition, targetPoint: XYPosition) =>
    Math.sqrt((targetPoint.x - sourcePoint.x) ** 2 + (targetPoint.y - sourcePoint.y) ** 2)
  /**
   * 在未保存内部控制点时，为正交折线生成与 Handle 方向一致的初始路径。
   * 先按 offset 向外扩展两端，再用相对位置确定主轴和行进方向。
   * 相向 Handle 可按中心线分成三段；同向或垂直 Handle 使用相应拐点组合。
   * 端点距离较近时修正间隙，避免初始折线向节点内部折回。
   * 返回值包含起点、内部拐点和终点；持久化时只保留内部控制点。
   */
  function initialStepPoints({
    source,
    sourcePosition = Position.Bottom,
    target,
    targetPosition = Position.Top,
    center = {
      x: undefined,
      y: undefined,
    },
    offset = 20,
  }: InitialStepOptions): PathPoint[] {
    const sourceDirection = handleDirections[sourcePosition]
    const targetDirection = handleDirections[targetPosition]
    const sourceGap = {
      x: source.x + sourceDirection.x * offset,
      y: source.y + sourceDirection.y * offset,
    }
    const targetGap = {
      x: target.x + targetDirection.x * offset,
      y: target.y + targetDirection.y * offset,
    }
    const travelDirection = stepTravelDirection({
      source: sourceGap,
      sourcePosition,
      target: targetGap,
    })
    const primaryAxis = travelDirection.x === 0 ? 'y' : 'x'
    const travelSign = travelDirection[primaryAxis]
    let bendPoints
    const sourceGapOffset = {
      x: 0,
      y: 0,
    }
    const targetGapOffset = {
      x: 0,
      y: 0,
    }
    const [defaultCenterX, defaultCenterY] = edgeCenter({
      sourceX: source.x,
      sourceY: source.y,
      targetX: target.x,
      targetY: target.y,
    })
    if (sourceDirection[primaryAxis] * targetDirection[primaryAxis] === -1) {
      const centerX = center.x ?? defaultCenterX
      const centerY = center.y ?? defaultCenterY
      const verticalSplit = [
        {
          x: centerX,
          y: sourceGap.y,
        },
        {
          x: centerX,
          y: targetGap.y,
        },
      ]
      const horizontalSplit = [
        {
          x: sourceGap.x,
          y: centerY,
        },
        {
          x: targetGap.x,
          y: centerY,
        },
      ]
      bendPoints =
        sourceDirection[primaryAxis] === travelSign
          ? primaryAxis === 'x'
            ? verticalSplit
            : horizontalSplit
          : primaryAxis === 'x'
            ? horizontalSplit
            : verticalSplit
    } else {
      const sourceXTargetYBend = [
        {
          x: sourceGap.x,
          y: targetGap.y,
        },
      ]
      const targetXSourceYBend = [
        {
          x: targetGap.x,
          y: sourceGap.y,
        },
      ]
      bendPoints =
        primaryAxis === 'x'
          ? sourceDirection.x === travelSign
            ? targetXSourceYBend
            : sourceXTargetYBend
          : sourceDirection.y === travelSign
            ? sourceXTargetYBend
            : targetXSourceYBend
      if (sourcePosition === targetPosition) {
        const endpointAxisDistance = Math.abs(source[primaryAxis] - target[primaryAxis])
        if (endpointAxisDistance <= offset) {
          const gapAdjustment = Math.min(offset - 1, offset - endpointAxisDistance)
          if (sourceDirection[primaryAxis] === travelSign) {
            sourceGapOffset[primaryAxis] =
              (sourceGap[primaryAxis] > source[primaryAxis] ? -1 : 1) * gapAdjustment
          } else {
            targetGapOffset[primaryAxis] =
              (targetGap[primaryAxis] > target[primaryAxis] ? -1 : 1) * gapAdjustment
          }
        }
      }
      if (sourcePosition !== targetPosition) {
        const secondaryAxis = primaryAxis === 'x' ? 'y' : 'x'
        const matchingHandleSigns = sourceDirection[primaryAxis] === targetDirection[secondaryAxis]
        const sourceBeyondTarget = sourceGap[secondaryAxis] > targetGap[secondaryAxis]
        const sourceBeforeTarget = sourceGap[secondaryAxis] < targetGap[secondaryAxis]
        if (
          (sourceDirection[primaryAxis] === 1 &&
            ((!matchingHandleSigns && sourceBeyondTarget) ||
              (matchingHandleSigns && sourceBeforeTarget))) ||
          (sourceDirection[primaryAxis] !== 1 &&
            ((!matchingHandleSigns && sourceBeforeTarget) ||
              (matchingHandleSigns && sourceBeyondTarget)))
        ) {
          bendPoints = primaryAxis === 'x' ? sourceXTargetYBend : targetXSourceYBend
        }
      }
    }
    return [
      source,
      {
        x: sourceGap.x + sourceGapOffset.x,
        y: sourceGap.y + sourceGapOffset.y,
      },
      ...bendPoints,
      {
        x: targetGap.x + targetGapOffset.x,
        y: targetGap.y + targetGapOffset.y,
      },
      target,
    ]
  }
  /* 直线段直接输出 L；转弯处使用不超过相邻半段长度的圆角半径，避免短线段的圆角越界。 */
  function roundedStepBend(
    previousPoint: XYPosition,
    bendPoint: XYPosition,
    nextPoint: XYPosition,
    borderRadius: number,
  ) {
    const bendRadius = Math.min(
      pointDistance(previousPoint, bendPoint) / 2,
      pointDistance(bendPoint, nextPoint) / 2,
      borderRadius,
    )
    const { x, y } = bendPoint
    if (
      (previousPoint.x === x && x === nextPoint.x) ||
      (previousPoint.y === y && y === nextPoint.y)
    ) {
      return `L${x} ${y}`
    }
    if (previousPoint.y === y) {
      const horizontalApproachSign = previousPoint.x < nextPoint.x ? -1 : 1
      const verticalExitSign = previousPoint.y < nextPoint.y ? 1 : -1
      return `L ${x + bendRadius * horizontalApproachSign},${y}Q ${x},${y} ${x},${y + bendRadius * verticalExitSign}`
    }
    const horizontalExitSign = previousPoint.x < nextPoint.x ? 1 : -1
    return `L ${x},${y + bendRadius * (previousPoint.y < nextPoint.y ? -1 : 1)}Q ${x},${y} ${x + bendRadius * horizontalExitSign},${y}`
  }
  /* 节点移动后重对齐端部控制点：紧邻端点的线段保持与连接柄同向，并保留固定的向外间距。 */
  const alignStepEndpoint = ({
    points,
    side,
    handlePosition,
    isTarget = false,
  }: {
    points: PathPoint[]
    side: Position
    handlePosition: XYPosition
    isTarget?: boolean
  }) => {
    let alignmentAxis: 'x' | 'y' = 'x'
    let outwardAxis: 'x' | 'y' = 'y'
    if (side === Position.Left || side === Position.Right) {
      alignmentAxis = 'y'
      outwardAxis = 'x'
    }
    let endpointIndex = 0
    let neighborIndex = 1
    if (isTarget) {
      endpointIndex = points.length - 1
      neighborIndex = points.length - 2
    }
    if (
      points[neighborIndex] &&
      points[endpointIndex] &&
      points[neighborIndex]![alignmentAxis] !== points[endpointIndex]![alignmentAxis]
    ) {
      const handleDirection = handleDirections[side]
      points[endpointIndex] = {
        ...points[endpointIndex]!,
        [outwardAxis]: handleDirection[outwardAxis] * 20 + handlePosition[outwardAxis],
        [alignmentAxis]: handlePosition[alignmentAxis],
      }
      points[neighborIndex] = {
        ...points[neighborIndex]!,
        [outwardAxis]: handleDirection[outwardAxis] * 20 + handlePosition[outwardAxis],
      }
    }
    if (
      points[neighborIndex] &&
      points[endpointIndex] &&
      points[neighborIndex]![alignmentAxis] === points[endpointIndex]![alignmentAxis]
    ) {
      const handleDirection = handleDirections[side]
      points[endpointIndex] = {
        ...points[endpointIndex]!,
        [alignmentAxis]: handlePosition[alignmentAxis],
        [outwardAxis]: handleDirection[outwardAxis] * 20 + handlePosition[outwardAxis],
      }
      points[neighborIndex] = {
        ...points[neighborIndex]!,
        [alignmentAxis]: handlePosition[alignmentAxis],
      }
    }
  }
  /**
   * 节点移动后重新对齐已保存的折线端部，使线段继续从当前 Handle 向外延伸。
   * 复制点数组后分别调整首尾控制点及相邻点，不直接修改 edge.data.points。
   * 源端与目标端共享对齐逻辑，通过 isTarget 区分数组前后端，保持中间路径由用户控制。
   */
  const alignStepEndpoints = ({
    points,
    sides: { fromSide, toSide },
    source,
    target,
  }: {
    points: PathPoint[]
    sides: HandleSides
    source: XYPosition
    target: XYPosition
  }) => {
    const alignedPoints = [...(points || [])]
    alignStepEndpoint({
      points: alignedPoints,
      side: fromSide,
      handlePosition: source,
    })
    alignStepEndpoint({
      points: alignedPoints,
      side: toSide,
      isTarget: true,
      handlePosition: target,
    })
    return alignedPoints
  }
  const resolvedStepPoints = ({
    points,
    initialStepPoints: defaultStepPoints,
  }: StepPointsOptions) => (points.length === 2 ? defaultStepPoints : points)
  function stepPath({ points, initialStepPoints: defaultStepPoints }: StepPointsOptions) {
    const resolvedPoints = resolvedStepPoints({
      points,
      initialStepPoints: defaultStepPoints,
    })
    return (
      resolvedPoints.reduce((path, point, pointIndex) => {
        const segmentPath =
          pointIndex > 0 && pointIndex < resolvedPoints.length - 1
            ? roundedStepBend(
                resolvedPoints[pointIndex - 1]!,
                point,
                resolvedPoints[pointIndex + 1]!,
                5,
              )
            : `${pointIndex === 0 ? 'M' : 'L'}${point.x} ${point.y}`
        path += segmentPath
        return path
      }, '') || ''
    )
  }
  const isActiveStepSegment = ({ nextPoint }: { nextPoint: PathPoint }) => nextPoint.active
  /* 在内部正交线段的中点生成拖拽控制点；垂直段只能水平移动，水平段只能垂直移动。 */
  function stepSegmentControlPoints({
    points,
    initialStepPoints: defaultStepPoints,
  }: StepPointsOptions) {
    const controls: IdentifiedControlPoint[] = []
    const resolvedPoints = resolvedStepPoints({
      points,
      initialStepPoints: defaultStepPoints,
    })
    for (let pointIndex = 1; pointIndex < resolvedPoints.length - 2; pointIndex++) {
      const segmentStart = resolvedPoints[pointIndex]!
      const segmentEnd = resolvedPoints[pointIndex + 1]!
      if (!segmentStart && !segmentEnd) {
        continue
      }
      let isVerticalSegment = false
      if (segmentStart.x - segmentEnd.x === 0) {
        isVerticalSegment = true
      }
      let controlX
      let controlY
      if (isVerticalSegment) {
        controlX = segmentStart.x
        controlY = (segmentEnd.y - segmentStart.y) / 2 + segmentStart.y
      } else {
        controlX = (segmentEnd.x - segmentStart.x) / 2 + segmentStart.x
        controlY = segmentStart.y
      }
      controls.push({
        prev: 'id' in segmentStart ? segmentStart.id : undefined,
        id: `${segmentStart.id}-${segmentEnd.id}`,
        active: isActiveStepSegment({
          nextPoint: segmentEnd,
        }),
        x: controlX,
        y: controlY,
        direction: isVerticalSegment ? StepMoveDirection.Horizontal : StepMoveDirection.Vertical,
      })
    }
    return controls
  }
  /** 使用字面量联合约束算法名称，路径、控制点和颜色索引共享同一套取值。 */
  const EdgeAlgorithm = {
    CatmullRom: 'Catmull-Rom',
    BezierCatmullRom: 'Bezier Catmull-Rom',
    Step: 'Step',
    Linear: 'Linear',
  } as const
  const algorithmColors: Record<EdgeAlgorithmName, string> = {
    [EdgeAlgorithm.Linear]: '#0375ff',
    [EdgeAlgorithm.BezierCatmullRom]: '#68D391',
    [EdgeAlgorithm.CatmullRom]: '#FF0072',
    [EdgeAlgorithm.Step]: '#FF5733',
  }
  const newEdgeAlgorithm = EdgeAlgorithm.Step
  /* 按边算法分派控制点生成规则，路径绘制和控制点交互共享同一组顶点及端部方向。 */
  function edgeControlPoints({
    points,
    algorithm = EdgeAlgorithm.BezierCatmullRom,
    sides = {
      fromSide: Position.Left,
      toSide: Position.Right,
    },
    initialStepPoints: defaultStepPoints,
  }: PathOptions) {
    switch (algorithm) {
      case EdgeAlgorithm.Linear:
        return linearControlPoints(points)
      case EdgeAlgorithm.Step:
        return stepSegmentControlPoints({
          points,
          initialStepPoints: defaultStepPoints,
        })
      case EdgeAlgorithm.CatmullRom:
        return catmullRomControlPoints(points)
      case EdgeAlgorithm.BezierCatmullRom:
        return catmullRomControlPoints(points, true, sides)
    }
  }
  function editableEdgePath({
    points,
    algorithm = EdgeAlgorithm.BezierCatmullRom,
    sides = {
      fromSide: Position.Left,
      toSide: Position.Right,
    },
    initialStepPoints: defaultStepPoints,
  }: PathOptions) {
    switch (algorithm) {
      case EdgeAlgorithm.Linear:
        return linearPath(points)
      case EdgeAlgorithm.Step:
        return stepPath({
          points,
          initialStepPoints: defaultStepPoints,
        })
      case EdgeAlgorithm.CatmullRom:
        return catmullRomPath(points)
      case EdgeAlgorithm.BezierCatmullRom:
        return catmullRomPath(points, true, sides)
    }
  }
  const equalPointPosition = (
    previousPoint: PathPoint | undefined,
    nextPoint: PathPoint | undefined,
  ) => previousPoint?.x === nextPoint?.x && previousPoint?.y === nextPoint?.y
  /* 删除同一水平线上连续三个以上的冗余点，只保留首尾坐标，供删除正交线段后清理路径。 */
  function collapseHorizontalRuns(points: PathPoint[]): PathPoint[] {
    if (points.length < 3) {
      return points
    }
    const collapsedPoints: PathPoint[] = []
    let runStart = 0
    for (; runStart < points.length;) {
      const runY = points[runStart]!.y
      let runEnd = runStart + 1
      for (; runEnd < points.length && points[runEnd]!.y === runY;) runEnd++
      if (runEnd - runStart >= 3) {
        collapsedPoints.push(points[runStart]!)
        collapsedPoints.push(points[runEnd - 1]!)
      } else {
        for (let pointIndex = runStart; pointIndex < runEnd; pointIndex++)
          collapsedPoints.push(points[pointIndex]!)
      }
      runStart = runEnd
    }
    return collapsedPoints
  }
  /**
   * 折线的编辑入口位于内部线段中点，拖动时同时平移线段两端。
   * 垂直线段只能沿 x 轴移动，水平线段只能沿 y 轴移动，始终保持路径正交。
   * 初次拖动首尾内部线段会复制一个锚点，避免用户移动控制段时破坏 Handle 的固定出入方向。
   * 删除线段时用相邻拐点合并路径，再压缩水平冗余点；缺少所需顶点时保留原路径。
   * 空 points 使用默认内部路径作为起始值；控制点失效的旧指针事件不会写入缺失坐标。
   */
  function StepSegmentControlPoint({
    id: controlPointId,
    index: controlIndex,
    x,
    y,
    color,
    active,
    setControlPoints,
    direction: moveDirection = StepMoveDirection.Horizontal,
    initialStepPoints: defaultStepPoints,
  }: StepControlPointProps) {
    const flowDomNode = useStore((storeState) => storeState.domNode)
    const { screenToFlowPosition } = useReactFlow<Node, EditableEdgeModel>()
    const [dragging, setDragging] = React.useState(false)
    const circleRef = React.useRef<SVGCircleElement | null>(null)
    const constrainToMoveAxis = React.useCallback(
      ({
        prevControl: previousControl,
        pos: position,
      }: {
        prevControl: PathPoint
        pos: XYPosition
      }) => ({
        x: previousControl?.x,
        y: previousControl?.y,
        ...(moveDirection === StepMoveDirection.Vertical && {
          y: position.y,
        }),
        ...(moveDirection === StepMoveDirection.Horizontal && {
          x: position.x,
        }),
      }),
      [moveDirection],
    )
    const defaultInteriorPoints = React.useMemo(
      () => defaultStepPoints.slice(1, defaultStepPoints.length - 1),
      [defaultStepPoints],
    )
    const moveSegment = React.useCallback(
      (position: XYPosition) => {
        setControlPoints((controlPoints) => {
          const currentPoints = controlPoints?.length === 0 ? defaultInteriorPoints : controlPoints
          const firstPoint = currentPoints[0]
          const lastPoint = currentPoints[currentPoints.length - 1]
          const updatedPoints = [...currentPoints]
          const segmentStart = updatedPoints[controlIndex]
          const segmentEnd = updatedPoints[controlIndex + 1]
          // 拖动期间路径可能因节点移动而重建；旧控制点事件不应写入缺失的线段。
          if (!segmentStart || !segmentEnd) return controlPoints
          const movedStart = {
            ...segmentStart,
            ...constrainToMoveAxis({
              prevControl: segmentStart,
              pos: position,
            }),
          }
          const movedEnd = {
            ...segmentEnd,
            ...constrainToMoveAxis({
              prevControl: segmentEnd,
              pos: position,
            }),
            active: true,
          }
          updatedPoints[controlIndex] = movedStart
          updatedPoints[controlIndex + 1] = movedEnd
          const preserveEndAnchor =
            equalPointPosition(segmentEnd, lastPoint) && !active && !!lastPoint
          const preserveStartAnchor =
            equalPointPosition(segmentStart, firstPoint) && !active && !!firstPoint
          if (preserveEndAnchor) {
            updatedPoints.push({
              ...lastPoint,
              id: createDemoId(),
            })
          }
          if (preserveStartAnchor) {
            updatedPoints.unshift({
              ...firstPoint,
              id: createDemoId(),
            })
          }
          return updatedPoints
        })
      },
      [setControlPoints, defaultInteriorPoints, controlIndex, constrainToMoveAxis, active],
    )
    const removeSegment = React.useCallback(() => {
      setControlPoints((controlPoints) => {
        if (!controlPoints.length) {
          return controlPoints
        }
        const segmentStart = controlPoints[controlIndex]
        const segmentEnd = controlPoints[controlIndex + 1]
        if (
          !segmentStart ||
          !segmentEnd ||
          !isActiveStepSegment({
            nextPoint: segmentEnd,
          })
        ) {
          return controlPoints
        }
        let remainingPoints = [...controlPoints]
        let isHorizontalSegment = false
        if (segmentStart.y === segmentEnd.y) {
          isHorizontalSegment = true
        }
        const nextCorner = remainingPoints[controlIndex + 2]
        // 合并任何方向的线段都需要保留下一拐点，避免产生缺少 x 或 y 的顶点。
        if (!nextCorner) return controlPoints
        if (isHorizontalSegment) {
          remainingPoints[controlIndex] = {
            ...remainingPoints[controlIndex]!,
            y: nextCorner.y,
          }
          remainingPoints[controlIndex + 1] = {
            ...remainingPoints[controlIndex + 1]!,
            y: nextCorner.y,
          }
        } else {
          const previousCorner = segmentStart
          remainingPoints[controlIndex + 1] = {
            ...remainingPoints[controlIndex + 1]!,
            y: previousCorner.y,
          }
          remainingPoints[controlIndex + 2] = {
            ...remainingPoints[controlIndex + 2]!,
            y: previousCorner.y,
          }
        }
        remainingPoints = collapseHorizontalRuns(remainingPoints)
        remainingPoints[1] = {
          ...remainingPoints[1]!,
          active: false,
        }
        remainingPoints[remainingPoints.length - 1] = {
          ...remainingPoints[remainingPoints.length - 1]!,
          active: false,
        }
        if (remainingPoints.length < defaultInteriorPoints.length) {
          return []
        } else {
          return remainingPoints
        }
      })
    }, [controlIndex, setControlPoints, defaultInteriorPoints])
    const onKeyDown = React.useCallback(
      (keyboardEvent: React.KeyboardEvent<SVGCircleElement>) => {
        switch (keyboardEvent.key) {
          case 'Enter':
          case 'Space':
            if (!active) {
              keyboardEvent.preventDefault()
            }
            moveSegment({
              x,
              y,
            })
            break
          case 'Backspace':
          case 'Delete':
            keyboardEvent.stopPropagation()
            removeSegment()
            break
          case 'ArrowLeft':
            if (moveDirection === StepMoveDirection.Horizontal) {
              moveSegment({
                x: x - 5,
                y,
              })
            }
            break
          case 'ArrowRight':
            if (moveDirection === StepMoveDirection.Horizontal) {
              moveSegment({
                x: x + 5,
                y,
              })
            }
            break
          case 'ArrowUp':
            if (moveDirection === StepMoveDirection.Vertical) {
              moveSegment({
                x,
                y: y - 5,
              })
            }
            break
          case 'ArrowDown':
            if (moveDirection === StepMoveDirection.Vertical) {
              moveSegment({
                x,
                y: y + 5,
              })
            }
            break
          default:
            break
        }
      },
      [active, moveSegment, x, y, removeSegment, moveDirection],
    )
    React.useEffect(() => {
      if (!flowDomNode || !active || !dragging) {
        return
      }
      const onPointerMove = (pointerEvent: PointerEvent) => {
        moveSegment(
          screenToFlowPosition({
            x: pointerEvent.clientX,
            y: pointerEvent.clientY,
          }),
        )
      }
      const onPointerEnd = (pointerEvent: PointerEvent) => {
        flowDomNode.removeEventListener('pointermove', onPointerMove)
        if (!active) {
          pointerEvent.preventDefault()
        }
        setDragging(false)
        moveSegment(
          screenToFlowPosition({
            x: pointerEvent.clientX,
            y: pointerEvent.clientY,
          }),
        )
      }
      flowDomNode.addEventListener('pointermove', onPointerMove)
      flowDomNode.addEventListener('pointerup', onPointerEnd, {
        once: true,
      })
      flowDomNode.addEventListener('pointerleave', onPointerEnd, {
        once: true,
      })
      return () => {
        flowDomNode.removeEventListener('pointermove', onPointerMove)
        flowDomNode.removeEventListener('pointerup', onPointerEnd)
        flowDomNode.removeEventListener('pointerleave', onPointerEnd)
        setDragging(false)
      }
    }, [
      controlPointId,
      flowDomNode,
      dragging,
      active,
      screenToFlowPosition,
      setControlPoints,
      moveSegment,
    ])
    return (
      <circle
        ref={circleRef}
        tabIndex={0}
        id={controlPointId}
        className={'nopan nodrag' + (active ? ' active' : '')}
        cx={x}
        cy={y}
        r={active ? 4 : 3}
        strokeOpacity={active ? 1 : 0.3}
        stroke={color}
        fill={active ? color : 'white'}
        style={{
          pointerEvents: 'all',
        }}
        onContextMenu={(contextMenuEvent) => {
          contextMenuEvent.preventDefault()
          if (active) {
            removeSegment()
          }
        }}
        onPointerDown={(pointerEvent) => {
          if (pointerEvent.button !== 2) {
            moveSegment({
              x,
              y,
            })
            setDragging(true)
          }
        }}
        onKeyDown={onKeyDown}
        onPointerUp={() => setDragging(false)}
      />
    )
  }
  /**
   * 给路径算法生成的临时中点分配稳定 React key，并保留已保存控制点的原 ID。
   * 控制点数量相同时按索引复用上一轮 ID，避免每一帧路径更新都重新挂载圆点并丢失焦点。
   * 数量改变时重建临时 ID 表；这个表只属于当前边，不作为共享或持久化图数据。
   */
  const useStableControlPointIds = (
    controlPoints: IdentifiedControlPoint[],
  ): IdentifiedControlPoint[] => {
    const idsRef = React.useRef<string[]>([])
    if (idsRef.current.length === controlPoints.length) {
      return controlPoints.map((controlPoint, pointIndex) =>
        controlPoint.id
          ? controlPoint
          : {
              ...controlPoint,
              id: idsRef.current[pointIndex]!,
            },
      )
    } else {
      idsRef.current = []
      return controlPoints.map((controlPoint, pointIndex) => {
        if (controlPoint.id) {
          idsRef.current[pointIndex] = controlPoint.id
          return controlPoint
        }
        {
          const controlPointId = createDemoId()
          idsRef.current[pointIndex] = controlPointId
          return {
            ...controlPoint,
            id: controlPointId,
          }
        }
      })
    }
  }
  /**
   * 把当前 Handle 端点、已保存内部点和算法配置组合成路径及编辑控件。
   * 折线先对齐端部，再分派到 Step、Linear 或两种 Catmull-Rom 路径/中点算法。
   * 边本身或相连节点被选中时显示控制点；所有编辑通过函数式 setEdges 只更新当前边。
   * controlPointsRef 保存当前对齐结果，使连续拖动使用最新端部位置而不是旧闭包。
   * 颜色由算法统一决定，临时插入中点和已保存点共用同一组更新入口。
   */
  function EditableEdge({
    id: edgeId,
    selected,
    source: sourceId,
    sourceX,
    sourceY,
    sourcePosition,
    target: targetId,
    targetX,
    targetY,
    targetPosition,
    markerEnd,
    markerStart,
    style,
    data = {
      points: [],
    },
    ...edgeProps
  }: EdgeProps<EditableEdgeModel>) {
    const sourcePoint = {
      x: sourceX,
      y: sourceY,
    }
    const targetPoint = {
      x: targetX,
      y: targetY,
    }
    const edgeColor = algorithmColors[data.algorithm ?? EdgeAlgorithm.BezierCatmullRom]
    const { setEdges } = useReactFlow<Node, EditableEdgeModel>()
    const showControls = useStore((storeState) => {
      const sourceNode = storeState.nodeLookup.get(sourceId)
      const targetNode = storeState.nodeLookup.get(targetId)
      return selected || sourceNode!.selected || targetNode!.selected
    })
    const defaultStepPoints = React.useMemo(
      () =>
        initialStepPoints({
          source: {
            x: sourceX,
            y: sourceY,
          },
          target: {
            x: targetX,
            y: targetY,
          },
          offset: 20,
          sourcePosition,
          targetPosition,
        }).map((point, pointIndex) => ({
          ...point,
          id: `${pointIndex}`,
        })),
      [sourcePosition, sourceX, sourceY, targetPosition, targetX, targetY],
    )
    const isStepAlgorithm = data.algorithm === EdgeAlgorithm.Step
    const alignedControlPoints = React.useMemo(
      () =>
        isStepAlgorithm
          ? alignStepEndpoints({
              points: data.points,
              source: {
                x: sourceX,
                y: sourceY,
              },
              target: {
                x: targetX,
                y: targetY,
              },
              sides: {
                fromSide: sourcePosition,
                toSide: targetPosition,
              },
            })
          : data.points,
      [
        isStepAlgorithm,
        data.points,
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
      ],
    )
    const controlPointsRef = React.useRef<PathPoint[]>([])
    controlPointsRef.current = alignedControlPoints
    const setControlPoints = React.useCallback(
      (updateControlPoints: ControlPointUpdater) => {
        setEdges((edges) =>
          edges.map((edge) => {
            if (edge.id !== edgeId || !isEditableEdge(edge)) {
              return edge
            }
            const currentPoints = isStepAlgorithm
              ? controlPointsRef.current
              : (edge.data?.points ?? [])
            const nextData = {
              ...edge?.data,
              points: updateControlPoints(currentPoints),
            }
            return {
              ...edge,
              data: nextData,
            }
          }),
        )
      },
      [setEdges, edgeId, isStepAlgorithm],
    )
    const pathPoints = [sourcePoint, ...alignedControlPoints, targetPoint]
    const controls = edgeControlPoints({
      points: pathPoints,
      algorithm: data.algorithm,
      sides: {
        fromSide: sourcePosition,
        toSide: targetPosition,
      },
      initialStepPoints: defaultStepPoints,
    })
    const path = editableEdgePath({
      points: pathPoints,
      algorithm: data.algorithm,
      sides: {
        fromSide: sourcePosition,
        toSide: targetPosition,
      },
      initialStepPoints: defaultStepPoints,
    })
    const identifiedControls = useStableControlPointIds(controls)
    return (
      <React.Fragment>
        <BaseEdge
          id={edgeId}
          path={path}
          {...edgeProps}
          {...(markerStart === undefined ? {} : { markerStart })}
          {...(markerEnd === undefined ? {} : { markerEnd })}
          style={{
            ...style,
            strokeWidth: 2,
            stroke: edgeColor,
          }}
        />
        {showControls &&
          !isStepAlgorithm &&
          identifiedControls.map((controlPoint, controlIndex) => (
            <CurveControlPoint
              key={controlPoint.id}
              index={controlIndex}
              setControlPoints={setControlPoints}
              color={edgeColor}
              {...controlPoint}
            />
          ))}
        {showControls &&
          isStepAlgorithm &&
          identifiedControls.map((controlPoint, controlIndex) => (
            <StepSegmentControlPoint
              key={controlPoint.id}
              index={controlIndex}
              setControlPoints={setControlPoints}
              color={edgeColor}
              direction={controlPoint.direction}
              initialStepPoints={defaultStepPoints}
              {...controlPoint}
            />
          ))}
      </React.Fragment>
    )
  }
  const isEditableEdge = (edge: Edge): edge is EditableEdgeModel => edge.type === 'editable-edge'
  function EditableAnchorNode() {
    return (
      <React.Fragment>
        <Handle type="source" position={Position.Top} id="top" />
        <Handle type="source" position={Position.Left} id="left" />
        <Handle type="source" position={Position.Bottom} id="bottom" />
        <Handle type="source" position={Position.Right} id="right" />
      </React.Fragment>
    )
  }
  const editableNodeTypes = {
    custom: EditableAnchorNode,
  }
  const initialEditableNodes: Node[] = [
    {
      id: '1',
      type: 'custom',
      data: {},
      position: {
        x: 0,
        y: 0,
      },
    },
    {
      id: '2',
      type: 'custom',
      data: {},
      position: {
        x: 250,
        y: 0,
      },
    },
    {
      id: '3',
      type: 'custom',
      data: {},
      position: {
        x: 0,
        y: 175,
      },
    },
    {
      id: '4',
      type: 'custom',
      data: {},
      position: {
        x: 250,
        y: 100,
      },
    },
    {
      id: '5',
      type: 'custom',
      data: {},
      position: {
        x: 0,
        y: 350,
      },
    },
    {
      id: '6',
      type: 'custom',
      data: {},
      position: {
        x: 250,
        y: 250,
      },
    },
    {
      id: '7',
      type: 'custom',
      data: {},
      position: {
        x: 0,
        y: 550,
      },
    },
    {
      id: '8',
      type: 'custom',
      data: {},
      position: {
        x: 250,
        y: 450,
      },
    },
  ]
  const editableEdgeTypes = {
    'editable-edge': EditableEdge,
  }
  const initialEditableEdges: EditableEdgeModel[] = [
    {
      id: '1->2',
      type: 'editable-edge',
      source: '1',
      target: '2',
      sourceHandle: 'right',
      targetHandle: 'left',
      animated: true,
      data: {
        algorithm: EdgeAlgorithm.CatmullRom,
        points: [
          // {
          //   x: 92.5,
          //   y: 24.75,
          //   id: 'spline-d24e57b4-88ad-47af-8b4e-9ecec78e5066',
          //   active: true,
          // },
          // {
          //   x: 129.5,
          //   y: 16.25,
          //   id: 'spline-bec90e8b-2d76-4727-a4d6-9fabdf18aea5',
          //   active: true,
          // },
          // {
          //   x: 168,
          //   y: -19.25,
          //   id: 'spline-8d5f62cc-e9d7-4460-98fd-bd9b902bc671',
          //   active: true,
          // },
          // {
          //   x: 143,
          //   y: -45,
          //   id: 'spline-252e2875-a052-43fb-9f01-c4670fd3170c',
          //   active: true,
          // },
          // {
          //   x: 119.5,
          //   y: -20.75,
          //   id: 'spline-f37a3789-dfb7-46e7-abed-04374b274ce3',
          //   active: true,
          // },
          // {
          //   x: 159.5,
          //   y: 17.25,
          //   id: 'spline-724c522e-c90b-46c3-9e95-8b99d955cc70',
          //   active: true,
          // },
          // {
          //   x: 202.5,
          //   y: 23.25,
          //   id: 'spline-e97e7074-c028-4cf6-82dc-b6ed1690db2f',
          //   active: true,
          // },
        ],
      },
    },
    {
      id: '3->4',
      type: 'editable-edge',
      source: '3',
      target: '4',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: {
        algorithm: EdgeAlgorithm.BezierCatmullRom,
        points: [],
      },
    },
    {
      id: '5->6',
      type: 'editable-edge',
      source: '5',
      target: '6',
      sourceHandle: 'right',
      targetHandle: 'left',
      animated: true,
      data: {
        algorithm: EdgeAlgorithm.Step,
        points: [],
      },
    },
    {
      id: '7->8',
      type: 'editable-edge',
      source: '7',
      target: '8',
      sourceHandle: 'right',
      targetHandle: 'left',
      animated: false,
      data: {
        algorithm: EdgeAlgorithm.Linear,
        points: [
          {
            x: 100,
            y: 575,
            id: 'spline-964fc95f-2399-4a62-9dd1-3a5d66a5459a',
            active: true,
          },
          {
            x: 100,
            y: 525,
            id: 'spline-51c08f0b-3092-4e2e-834a-2d71d8d5c396',
            active: true,
          },
          {
            x: 150,
            y: 525,
            id: 'spline-d53c4828-09c0-4387-92d7-7d72e0ceda7a',
            active: true,
          },
          {
            x: 150,
            y: 625,
            id: 'spline-0c24fc20-d285-4868-a3d8-730a5f2c683d',
            active: true,
          },
          {
            x: 200,
            y: 625,
            id: 'spline-4349d5d7-62fc-4b66-99a4-f6760081c1a8',
            active: true,
          },
          {
            x: 200,
            y: 475,
            id: 'spline-f4cba410-811e-4620-894f-12804138f104',
            active: true,
          },
        ],
      },
    },
  ]
  const useConnectionLineStore = create<ConnectionLineStore>((setStore) => ({
    connectionLinePath: [],
    setConnectionLinePath: (connectionLinePath) => {
      setStore({
        connectionLinePath,
      })
    },
  }))
  const connectionSampleDistance =
    (newEdgeAlgorithm as EdgeAlgorithmName) === EdgeAlgorithm.BezierCatmullRom ? 50 : 25
  /**
   * 自定义连接草稿复用正式边的路径算法，绘制和提交使用相同的坐标协议。
   * 按住空格且指针离上次采样足够远时追加一个途经点，降低密集指针事件产生的点数。
   * 草稿途经点暂存在当前示例的 Zustand store，onConnect 再为每点分配 ID 和 active 标记。
   * 进入新一轮连接时清空旧草稿；空格键监听在预览卸载时解除。
   */
  function EditableConnectionLine({
    fromX,
    fromY,
    toX,
    toY,
    fromPosition,
    toPosition,
    connectionStatus,
  }: ConnectionLineComponentProps) {
    const { connectionLinePath, setConnectionLinePath } = useConnectionLineStore()
    const [spacePressed, setSpacePressed] = React.useState(false)
    const lastSample = connectionLinePath[connectionLinePath.length - 1] ?? {
      x: fromX,
      y: fromY,
    }
    const distanceFromLastSample = Math.hypot(lastSample.x - toX, lastSample.y - toY)
    const shouldSample = spacePressed && distanceFromLastSample > connectionSampleDistance
    React.useEffect(() => {
      if (shouldSample) {
        setConnectionLinePath([
          ...connectionLinePath,
          {
            x: toX,
            y: toY,
          },
        ])
      }
    }, [connectionLinePath, setConnectionLinePath, shouldSample, toX, toY])
    React.useEffect(() => {
      function onKeyDown(keyboardEvent: KeyboardEvent) {
        if (keyboardEvent.key === ' ') {
          setSpacePressed(true)
        }
      }
      function onKeyUp(keyboardEvent: KeyboardEvent) {
        if (keyboardEvent.key === ' ') {
          setSpacePressed(false)
        }
      }
      setConnectionLinePath([])
      window.addEventListener('keydown', onKeyDown)
      window.addEventListener('keyup', onKeyUp)
      return () => {
        window.removeEventListener('keydown', onKeyDown)
        window.removeEventListener('keyup', onKeyUp)
        setSpacePressed(false)
      }
    }, [setConnectionLinePath])
    const defaultStepPoints = React.useMemo(
      () =>
        initialStepPoints({
          source: {
            x: fromX,
            y: fromY,
          },
          target: {
            x: toX,
            y: toY,
          },
          offset: 20,
          sourcePosition: fromPosition,
          targetPosition: toPosition,
        }).map((point, pointIndex) => ({
          ...point,
          id: `${pointIndex}`,
        })),
      [fromPosition, fromX, fromY, toPosition, toX, toY],
    )
    const path = editableEdgePath({
      points: [
        {
          x: fromX,
          y: fromY,
        },
        ...connectionLinePath,
        {
          x: toX,
          y: toY,
        },
      ],
      algorithm: newEdgeAlgorithm,
      sides: {
        fromSide: fromPosition,
        toSide: toPosition,
      },
      initialStepPoints: defaultStepPoints,
    })
    return (
      <g>
        <path
          fill="none"
          stroke={algorithmColors[newEdgeAlgorithm]}
          strokeWidth={2}
          className={connectionStatus === 'valid' ? '' : 'animated'}
          d={path}
          markerStart={MarkerType.ArrowClosed}
          markerWidth={25}
          markerEnd={MarkerType.ArrowClosed}
        />
      </g>
    )
  }
  const editableFitViewOptions = {
    padding: 0.4,
  }
  /**
   * 画布保存受控节点和连线，使用自定义节点、正式边与连接草稿组件。
   * onConnect 读取当前草稿途经点，补齐稳定 ID 后创建采用默认算法的 editable-edge。
   * 各算法示例共享交互入口，面板颜色与边路径颜色保持一致。
   */
  function EditableEdgeExample() {
    const [nodes, , onNodesChange] = useNodesState(initialEditableNodes)
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEditableEdges)
    return (
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={React.useCallback(
          (connection: Connection) => {
            const { connectionLinePath } = useConnectionLineStore.getState()
            const newEdge: EditableEdgeModel = {
              ...connection,
              id: `${Date.now()}-${connection.source}-${connection.target}`,
              type: 'editable-edge',
              selected: true,
              data: {
                algorithm: newEdgeAlgorithm,
                points: connectionLinePath.map((point, pointIndex) => ({
                  ...point,
                  id: createDemoId(),
                  prev: pointIndex === 0 ? undefined : connectionLinePath[pointIndex - 1],
                  active: true,
                })),
              },
            }
            setEdges((edges) => addEdge(newEdge, edges))
          },
          [setEdges],
        )}
        nodeTypes={editableNodeTypes}
        edgeTypes={editableEdgeTypes}
        connectionMode={ConnectionMode.Loose}
        connectionLineComponent={EditableConnectionLine}
        fitView
        fitViewOptions={editableFitViewOptions}
        colorMode="system"
      >
        <Background />
        <Panel position="top-left">
          {Object.keys(EdgeAlgorithm).map((algorithmKey) => {
            const algorithm = EdgeAlgorithm[algorithmKey as keyof typeof EdgeAlgorithm]
            const color = algorithmColors[algorithm]
            return (
              <div
                style={{
                  color,
                  fontWeight: 700,
                }}
              >
                {algorithm}
              </div>
            )
          })}
        </Panel>
      </ReactFlow>
    )
  }
  const initialElement = (
    <React.StrictMode>
      <ReactFlowProvider>
        <EditableEdgeExample />
      </ReactFlowProvider>
    </React.StrictMode>
  )
  return function ExampleRoot() {
    return initialElement
  }
}
function EditableEdgeCanvas() {
  // 惰性保存组件类型，使普通重渲染沿用同一份图状态；工作台重置时重新挂载。
  const [Example] = React.useState(createExampleScope)
  return <Example />
}
export { EditableEdgeCanvas as default }
