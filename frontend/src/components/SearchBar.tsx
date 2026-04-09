import { useState } from 'react'

interface Props {
  onSearch: (query: string) => void
  onConfig: () => void
  showBack: boolean
  onBack: () => void
}

export default function SearchBar({ onSearch, onConfig, showBack, onBack }: Props) {
  const [query, setQuery] = useState('')

  const handleSearch = () => {
    if (query.trim()) onSearch(query.trim())
  }

  return (
    <div className="header">
      {showBack && (
        <button className="back-btn" onClick={onBack}>←</button>
      )}
      <button className="btn-icon" onClick={onConfig}>⚙️</button>
      <input
        type="text"
        className="search-input"
        placeholder="Search or paste playlist URL"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
      />
      <button className="btn-go" onClick={handleSearch}>Go</button>
    </div>
  )
}
