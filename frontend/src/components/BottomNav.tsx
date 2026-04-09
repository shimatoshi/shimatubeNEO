interface Props {
  active: string
  onNavigate: (tab: string) => void
}

const tabs = [
  { id: 'home', icon: '🏠', label: 'Home' },
  { id: 'subs', icon: '📺', label: 'Subs' },
  { id: 'history', icon: '🕓', label: 'History' },
]

export default function BottomNav({ active, onNavigate }: Props) {
  return (
    <div className="bottom-nav">
      {tabs.map(t => (
        <div
          key={t.id}
          className={`nav-item ${active === t.id ? 'active' : ''}`}
          onClick={() => onNavigate(t.id)}
        >
          <span className="nav-icon">{t.icon}</span>
          <span>{t.label}</span>
        </div>
      ))}
    </div>
  )
}
