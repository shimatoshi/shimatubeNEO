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
    <header className="header">
      {showBack && (
        <button className="back-btn" onClick={onBack} aria-label="戻る">←</button>
      )}
      <button className="btn-icon" onClick={onConfig} aria-label="設定">⚙</button>
      <input
        type="text"
        className="search-input"
        placeholder="動画・チャンネル・プレイリストを検索"
        aria-label="検索"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
      />
      <button className="btn-go" onClick={handleSearch}>検索</button>
    </header>
  )
}
