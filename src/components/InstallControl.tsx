import { useEffect, useState } from 'react'

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallControl() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)
  const [installing, setInstalling] = useState(false)
  const [message, setMessage] = useState('')
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches)

  useEffect(() => {
    const displayMode = window.matchMedia('(display-mode: standalone)')
    const capture = (event: Event) => {
      event.preventDefault()
      setPrompt(event as InstallPromptEvent)
      setMessage('')
    }
    const complete = () => {
      setInstalled(true)
      setPrompt(null)
    }
    const changeMode = () => setInstalled(displayMode.matches)
    window.addEventListener('beforeinstallprompt', capture)
    window.addEventListener('appinstalled', complete)
    displayMode.addEventListener('change', changeMode)
    return () => {
      window.removeEventListener('beforeinstallprompt', capture)
      window.removeEventListener('appinstalled', complete)
      displayMode.removeEventListener('change', changeMode)
    }
  }, [])

  async function install() {
    if (!prompt || installing) return
    setInstalling(true)
    try {
      await prompt.prompt()
      const { outcome } = await prompt.userChoice
      setMessage(outcome === 'accepted' ? 'Đã gửi yêu cầu cài đặt.' : 'Bạn có thể cài sau từ menu trình duyệt.')
    } catch {
      setMessage('Chưa mở được cửa sổ cài đặt. Hãy thử từ menu trình duyệt.')
    } finally {
      setPrompt(null)
      setInstalling(false)
    }
  }

  if (installed) return null
  return <aside className="install-panel" aria-label="Cài đặt KeyFlow">
    <details>
      <summary>Cài KeyFlow trên máy</summary>
      <p><strong>Chrome / Edge:</strong> chọn biểu tượng cài đặt trên thanh địa chỉ hoặc mục cài ứng dụng trong menu trình duyệt khi có sẵn.</p>
      <p><strong>Safari trên macOS Sonoma 14 trở lên:</strong> mở menu File → Add to Dock (Thêm vào Dock).</p>
      <p>Cài đặt giúp mở KeyFlow trong cửa sổ riêng. Chơi offline sau khi ứng dụng và đủ tiếng đàn đã được lưu trên trình duyệt này. Lần tải đầu cần mạng để tải tiếng đàn.</p>
    </details>
    {prompt && <button className="stop-button" disabled={installing} onClick={() => { void install() }}>Cài ứng dụng</button>}
    {message && <p role="status">{message}</p>}
  </aside>
}
