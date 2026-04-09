interface Props {
  title: string
  visible: boolean
  onRestore: () => void
  onClose: () => void
}

export default function MiniPlayer({ title, visible, onRestore, onClose }: Props) {
  if (!visible) return null

  return (
    <div className="mini-player" onClick={onRestore}>
      <div style={{ marginRight: 10 }}>▶</div>
      <div className="mini-info">{title}</div>
      <div className="mini-close" onClick={e => { e.stopPropagation(); onClose() }}>✕</div>
    </div>
  )
}
