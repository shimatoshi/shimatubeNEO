interface Props {
  active: string
  onNavigate: (tab: string) => void
}

const tabs = [
  { id: 'home', icon: '⌂', label: 'ホーム' },
  { id: 'subs', icon: '▣', label: '購読' },
  { id: 'history', icon: '◷', label: '履歴' },
]

export default function BottomNav({ active, onNavigate }: Props) {
  return (
    <nav className="bottom-nav" aria-label="メインナビゲーション">
      {tabs.map(t => (
        <button
          key={t.id}
          className={`nav-item ${active === t.id ? 'active' : ''}`}
          aria-current={active === t.id ? 'page' : undefined}
          onClick={() => onNavigate(t.id)}
        >
          <span className="nav-icon">{t.icon}</span>
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
