interface Props {
  title: string
  visible: boolean
  onRestore: () => void
  onClose: () => void
}

export default function MiniPlayer({ title, visible, onRestore, onClose }: Props) {
  if (!visible) return null

  return (
    <div className="mini-player" onClick={onRestore} role="button" tabIndex={0}>
      <div className="mini-play" aria-hidden="true">▶</div>
      <div className="mini-info">{title}</div>
      <button className="mini-close" aria-label="ミニプレイヤーを閉じる" onClick={e => { e.stopPropagation(); onClose() }}>✕</button>
    </div>
  )
}
