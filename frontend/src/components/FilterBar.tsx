interface Props {
  current: string
  filters: { value: string; label: string }[]
  onChange: (filter: string) => void
}

export default function FilterBar({ current, filters, onChange }: Props) {
  return (
    <div className="filter-bar">
      {filters.map(f => (
        <button
          key={f.value}
          className={`filter-btn ${current === f.value ? 'active' : ''}`}
          onClick={() => onChange(f.value)}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}
