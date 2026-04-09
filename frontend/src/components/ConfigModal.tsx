import { useState } from 'react'
import type { UserData } from '../api/client'

interface Props {
  visible: boolean
  userData: UserData | null
  onClose: () => void
  onUpdateCategories: (cats: string[]) => void
  onBlockKeyword: (kw: string) => void
  onUnblockKeyword: (kw: string) => void
  onUnblockChannel: (id: string) => void
  onForceUpdate: () => void
}

export default function ConfigModal({
  visible,
  userData,
  onClose,
  onUpdateCategories,
  onBlockKeyword,
  onUnblockKeyword,
  onUnblockChannel,
  onForceUpdate,
}: Props) {
  const [catInput, setCatInput] = useState('')
  const [kwInput, setKwInput] = useState('')

  if (!visible || !userData) return null

  const addCategory = () => {
    if (catInput && !userData.categories.includes(catInput)) {
      onUpdateCategories([...userData.categories, catInput])
      setCatInput('')
    }
  }

  const removeCategory = (cat: string) => {
    onUpdateCategories(userData.categories.filter(c => c !== cat))
  }

  const addBlockKeyword = () => {
    if (kwInput) {
      onBlockKeyword(kwInput)
      setKwInput('')
    }
  }

  return (
    <div className="config-modal">
      <div style={{ textAlign: 'right', marginBottom: 10 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 20 }}>✕</button>
      </div>

      <div className="config-section">
        <div className="config-title">Categories</div>
        <div className="tag-list">
          {userData.categories.map(cat => (
            <div key={cat} className="tag">
              <span>{cat}</span>
              <span className="tag-del" onClick={() => removeCategory(cat)}>✕</span>
            </div>
          ))}
        </div>
        <div className="input-row">
          <input
            type="text"
            placeholder="Add Category"
            value={catInput}
            onChange={e => setCatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addCategory() }}
          />
          <button className="btn" onClick={addCategory}>Add</button>
        </div>
      </div>

      <div className="config-section">
        <div className="config-title">Blocked Keywords</div>
        <div className="tag-list">
          {userData.blocked_keywords.map(kw => (
            <div key={kw} className="tag">
              <span>{kw}</span>
              <span className="tag-del" onClick={() => onUnblockKeyword(kw)}>✕</span>
            </div>
          ))}
        </div>
        <div className="input-row">
          <input
            type="text"
            placeholder="Block Keyword"
            value={kwInput}
            onChange={e => setKwInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addBlockKeyword() }}
          />
          <button className="btn" onClick={addBlockKeyword}>Block</button>
        </div>
      </div>

      <div className="config-section">
        <div className="config-title">Blocked Channels</div>
        <div className="tag-list">
          {userData.blocked_channels.map(c => (
            <div key={c.id} className="tag">
              <span>{c.name}</span>
              <span className="tag-del" onClick={() => onUnblockChannel(c.id)}>✕</span>
            </div>
          ))}
        </div>
      </div>

      <div className="config-section" style={{ borderBottom: 'none', marginTop: 20 }}>
        <button
          className="btn"
          style={{ width: '100%', background: '#3ea6ff', padding: 12 }}
          onClick={onForceUpdate}
        >
          ↻ Update App
        </button>
      </div>

      <div style={{ textAlign: 'center', color: '#555', fontSize: 11, marginTop: 15 }}>
        ShimaTube NEO v19.0
      </div>
    </div>
  )
}
