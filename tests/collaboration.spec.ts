import { randomUUID } from 'node:crypto'
import { test, expect, type Page } from '@playwright/test'

const text = (page: Page) => page.getByPlaceholder('Enter text...', { exact: true })
const nodes = (page: Page) => page.locator('.react-flow__node')
const connectionStatus = (page: Page) => page.getByRole('status', { name: '协作连接状态' })

test('独立浏览器会话共享图、表单、光标和连接草稿，退出后移除在线状态', async ({
  browser,
  baseURL,
}) => {
  if (!baseURL) throw new Error('缺少应用访问地址')
  const first = await browser.newContext({ baseURL })
  const second = await browser.newContext({ baseURL })
  try {
    const a = await first.newPage()
    const b = await second.newPage()
    const errors: string[] = []
    a.on('pageerror', (error) => errors.push(error.message))
    b.on('pageerror', (error) => errors.push(error.message))
    await a.goto('/#collaborative')
    await a.getByRole('button', { name: 'Create new flow', exact: true }).click()
    await expect(text(a)).toBeVisible()
    await b.goto(a.url())
    await expect(connectionStatus(a)).toContainText('2 人在线')
    await expect(connectionStatus(b)).toContainText('2 人在线')

    // Context 之间不共享 BroadcastChannel，只有服务端房间传输能够使这里的编辑同步。
    await text(a).fill('来自独立浏览器 A')
    await expect(text(b)).toHaveValue('来自独立浏览器 A')
    await text(b).fill('来自独立浏览器 B')
    await expect(text(a)).toHaveValue('来自独立浏览器 B')
    await a.getByRole('checkbox').check()
    await expect(b.getByRole('checkbox')).toBeChecked()

    const nodeA = a.locator('.react-flow__node[data-id="text-1"]')
    const nodeB = b.locator('.react-flow__node[data-id="text-1"]')
    await nodeA.click({ position: { x: 20, y: 20 } })
    const grip = await nodeA.locator('.cursor-grab').boundingBox()
    if (!grip) throw new Error('缺少节点拖动手柄')
    const oldPosition = await nodeA.evaluate((node) => node.style.transform)
    await a.mouse.move(grip.x + 4, grip.y + 4)
    await a.mouse.down()
    await a.mouse.move(grip.x + 94, grip.y + 64, { steps: 8 })
    await a.mouse.up()
    await expect.poll(() => nodeA.evaluate((node) => node.style.transform)).not.toBe(oldPosition)
    await expect
      .poll(() => nodeB.evaluate((node) => node.style.transform))
      .toBe(await nodeA.evaluate((node) => node.style.transform))

    const source = await a.locator('.react-flow__node[data-id="checkbox-1"] .source').boundingBox()
    const target = await a.locator('.react-flow__node[data-id="text-1"] .target').boundingBox()
    if (!source || !target) throw new Error('缺少连线端口')
    await a.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
    await a.mouse.down()
    await a.mouse.move(target.x + 60, target.y - 60, { steps: 6 })
    await expect(b.getByLabel('远端用户连线', { exact: true })).toHaveCount(1)
    await a.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 6 })
    await a.mouse.up()
    await expect(b.locator('.react-flow__edge')).toHaveCount(1)
    await expect(b.getByLabel('远端用户连线', { exact: true })).toHaveCount(0)

    await a.locator('.react-flow__pane').click({ button: 'right', position: { x: 200, y: 260 } })
    await a.getByRole('button', { name: 'Add Text', exact: true }).click()
    await expect(nodes(b)).toHaveCount(3)
    const added = a
      .locator('.react-flow__node')
      .filter({ has: a.getByPlaceholder('Enter text...') })
      .last()
    await added.click({ position: { x: 20, y: 20 } })
    await added.locator('.cursor-grab').click()
    await a.keyboard.press('Backspace')
    await expect(nodes(b)).toHaveCount(2)

    await a.mouse.move(source.x + 35, source.y + 35)
    await expect(b.getByLabel('远端用户光标', { exact: true })).toHaveCount(1)
    await a.getByRole('button', { name: 'Exit', exact: true }).click()
    await expect(connectionStatus(b)).toContainText('1 人在线')
    await expect(b.getByLabel('远端用户光标', { exact: true })).toHaveCount(0)
    expect(errors).toEqual([])
  } finally {
    await Promise.all([first.close(), second.close()])
  }
})

test('同时加入只初始化一次，房间隔离且刷新后恢复服务端文档', async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error('缺少应用访问地址')
  const first = await browser.newContext({ baseURL })
  const second = await browser.newContext({ baseURL })
  const separate = await browser.newContext({ baseURL })
  try {
    const a = await first.newPage()
    const b = await second.newPage()
    const other = await separate.newPage()
    const room = `/?flow=${randomUUID()}#collaborative`
    await Promise.all([a.goto(room), b.goto(room)])
    await expect(nodes(a)).toHaveCount(2)
    await expect(nodes(b)).toHaveCount(2)
    await text(a).fill('只属于当前房间')
    await expect(text(b)).toHaveValue('只属于当前房间')
    await other.goto(`/?flow=${randomUUID()}#collaborative`)
    await expect(nodes(other)).toHaveCount(2)
    await expect(text(other)).toHaveValue('')
    await expect(connectionStatus(other)).toContainText('1 人在线')
    await a.close()
    await b.close()
    const rejoined = await first.newPage()
    await rejoined.goto(room)
    await expect(nodes(rejoined)).toHaveCount(2)
    await expect(text(rejoined)).toHaveValue('只属于当前房间')
    await rejoined.reload()
    await expect(text(rejoined)).toHaveValue('只属于当前房间')
  } finally {
    await Promise.all([first.close(), second.close(), separate.close()])
  }
})

test('失联会显示错误并允许重试，断线后自动重连同步离线编辑', async ({ page }) => {
  let refuseConnections = true
  let closeConnection = () => {}
  await page.routeWebSocket('**/collaboration/**', (route) => {
    if (refuseConnections) {
      route.close({ code: 1012, reason: 'temporarily unavailable' })
    } else {
      route.connectToServer()
      closeConnection = () => route.close({ code: 1012, reason: 'reconnect probe' })
    }
  })
  await page.goto('/#collaborative')
  await page.getByRole('button', { name: 'Create new flow', exact: true }).click()
  await expect(page.getByText('加入房间超时，请检查连接后重试。', { exact: true })).toBeVisible({
    timeout: 15000,
  })
  refuseConnections = false
  await page.getByRole('button', { name: 'Create new flow', exact: true }).click()
  await expect(text(page)).toBeVisible()
  refuseConnections = true
  closeConnection()
  await expect(connectionStatus(page)).toContainText('重连')
  await text(page).fill('重新连接后仍然保留')
  refuseConnections = false
  await expect(connectionStatus(page)).toContainText('已连接')
  await page.reload()
  await expect(text(page)).toHaveValue('重新连接后仍然保留')
})
