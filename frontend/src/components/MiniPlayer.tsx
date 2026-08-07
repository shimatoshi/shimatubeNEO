interface Props {
  title: string
  visible: boolean
  onRestore: () => void
  onClose: () => void
}

export default function MiniPlayer({ title, visible, onRestore, onClose }: Props) {
  if (!visible) return null

  return (
    <div
      className="mini-player"
      onClick={onRestore}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRestore() } }}
      role="button"
      tabIndex={0}
      aria-label="再生画面に戻る"
    >
      <div className="mini-play" aria-hidden="true">▶</div>
      <div className="mini-info">{title}</div>
      <button className="mini-close" aria-label="ミニプレイヤーを閉じる" onClick={e => { e.stopPropagation(); onClose() }}>✕</button>
    </div>
  )
}
