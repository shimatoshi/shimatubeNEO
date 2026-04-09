export function formatDuration(sec?: number): string {
  if (!sec) return '0:00'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatViews(num?: number): string {
  if (!num) return ''
  if (num > 1_000_000) return (num / 1_000_000).toFixed(1) + 'M'
  if (num > 1_000) return (num / 1_000).toFixed(1) + 'K'
  return String(num)
}

export function extractPlaylistId(input: string): string | null {
  const m = input.match(/[?&]list=([a-zA-Z0-9_-]+)/)
  if (m) return m[1]
  if (/^PL[a-zA-Z0-9_-]{10,}$/.test(input.trim())) return input.trim()
  return null
}
