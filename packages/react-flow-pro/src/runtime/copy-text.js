export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // A host served over HTTP or browser policy can require the DOM fallback.
    }
  }
  const input = document.createElement('textarea')
  input.value = text
  input.readOnly = true
  input.style.cssText =
    'position:fixed;left:16px;bottom:16px;z-index:2147483647;width:360px;max-width:90vw;padding:12px;background:white;color:black;border:1px solid #ccc'
  input.setAttribute('aria-label', '房间链接，按 Ctrl 或 Command + C 复制')
  document.body.append(input)
  input.select()
  if (document.execCommand('copy')) {
    input.remove()
    return
  }
  input.addEventListener('blur', () => input.remove(), { once: true })
}
