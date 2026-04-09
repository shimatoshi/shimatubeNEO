import { useState, useEffect } from 'react'
import { api } from '../api/client'
import type { SearchItem } from '../api/client'
import VideoList from '../components/VideoList'

interface Props {
  categories: string[]
  onPlay: (videoId: string) => void
  onOpenChannel: (channelId: string) => void
  onOpenPlaylist: (playlistId: string) => void
  isSubscribed: (channelId: string) => boolean
  onToggleSub: (channelId: string, title: string, thumbnail: string) => void
  onBlockChannel: (channelId: string, name: string) => void
}

interface CategoryData {
  name: string
  items: SearchItem[]
  loading: boolean
  collapsed: boolean
}

export default function HomeScreen({
  categories,
  onPlay,
  onOpenChannel,
  onOpenPlaylist,
  isSubscribed,
  onToggleSub,
  onBlockChannel,
}: Props) {
  const [catData, setCatData] = useState<CategoryData[]>([])

  useEffect(() => {
    if (!categories.length) return
    const initial = categories.map((name, i) => ({
      name,
      items: [] as SearchItem[],
      loading: true,
      collapsed: i > 0,
    }))
    setCatData(initial)

    categories.forEach((cat, i) => {
      api.search(cat).then(items => {
        setCatData(prev =>
          prev.map((c, j) => (j === i ? { ...c, items, loading: false } : c))
        )
      }).catch(() => {
        setCatData(prev =>
          prev.map((c, j) => (j === i ? { ...c, loading: false } : c))
        )
      })
    })
  }, [categories])

  const toggleCollapse = (index: number) => {
    setCatData(prev =>
      prev.map((c, i) => (i === index ? { ...c, collapsed: !c.collapsed } : c))
    )
  }

  if (!categories.length) {
    return <div style={{ padding: 20 }}>Loading settings...</div>
  }

  return (
    <div className="list-container">
      {catData.map((cat, i) => (
        <div key={cat.name}>
          <div className="cat-header" onClick={() => toggleCollapse(i)}>
            <span>{cat.name}</span>
            <span className={`cat-toggle ${cat.collapsed ? 'closed' : ''}`}>▼</span>
          </div>
          {!cat.collapsed && (
            <div className="cat-content">
              {cat.loading ? (
                <div style={{ padding: 10, fontSize: 12, color: '#666' }}>Loading...</div>
              ) : (
                <VideoList
                  items={cat.items}
                  onPlay={onPlay}
                  onOpenChannel={onOpenChannel}
                  onOpenPlaylist={onOpenPlaylist}
                  isSubscribed={isSubscribed}
                  onToggleSub={onToggleSub}
                  onBlockChannel={onBlockChannel}
                />
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
