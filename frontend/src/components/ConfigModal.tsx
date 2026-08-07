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
    <div className="config-modal" role="dialog" aria-modal="true" aria-label="設定">
      <div className="settings-header">
        <div>
          <div className="eyebrow">SHIMATUBE NEO</div>
          <h1>設定</h1>
        </div>
        <button className="settings-close" onClick={onClose} aria-label="設定を閉じる">✕</button>
      </div>

      <div className="config-section">
        <div className="config-title">フィードのカテゴリ</div>
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
            placeholder="カテゴリを追加"
            value={catInput}
            onChange={e => setCatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addCategory() }}
          />
          <button className="btn" onClick={addCategory}>追加</button>
        </div>
      </div>

      <div className="config-section">
        <div className="config-title">非表示キーワード</div>
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
            placeholder="キーワードを追加"
            value={kwInput}
            onChange={e => setKwInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addBlockKeyword() }}
          />
          <button className="btn" onClick={addBlockKeyword}>非表示にする</button>
        </div>
      </div>

      <div className="config-section">
        <div className="config-title">非表示チャンネル</div>
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
          ↻ データを更新
        </button>
      </div>

      <div style={{ textAlign: 'center', color: '#555', fontSize: 11, marginTop: 15 }}>
        ShimaTube NEO v19.0
      </div>
    </div>
  )
}
