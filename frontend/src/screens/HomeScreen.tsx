import { useState, useEffect } from 'react'
import { api } from '../api/client'
import type { SearchItem, VideoItem } from '../api/client'
import VideoList from '../components/VideoList'

interface Props {
  categories: string[]
  hasSubs: boolean
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
  hasSubs,
  onPlay,
  onOpenChannel,
  onOpenPlaylist,
  isSubscribed,
  onToggleSub,
  onBlockChannel,
}: Props) {
  const [feed, setFeed] = useState<VideoItem[]>([])
  const [feedLoading, setFeedLoading] = useState(false)
  const [feedCollapsed, setFeedCollapsed] = useState(false)
  const [catData, setCatData] = useState<CategoryData[]>([])

  // 購読フィード取得
  useEffect(() => {
    if (!hasSubs) return
    setFeedLoading(true)
    api.getFeed().then(items => {
      setFeed(items)
      setFeedLoading(false)
    }).catch(() => setFeedLoading(false))
  }, [hasSubs])

  // カテゴリ取得
  useEffect(() => {
    if (!categories.length) return
    const initial = categories.map((name) => ({
      name,
      items: [] as SearchItem[],
      loading: true,
      collapsed: true,
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

  if (!categories.length && !hasSubs) {
    return <div style={{ padding: 20 }}>Loading settings...</div>
  }

  return (
    <div className="list-container">
      {/* 購読チャンネルの新着フィード */}
      {hasSubs && (
        <div>
          <div className="cat-header feed-header" onClick={() => setFeedCollapsed(p => !p)}>
            <span>New from Subscriptions</span>
            <span className={`cat-toggle ${feedCollapsed ? 'closed' : ''}`}>▼</span>
          </div>
          {!feedCollapsed && (
            <div className="cat-content">
              {feedLoading ? (
                <div className="scroll-sentinel"><div className="loader" /></div>
              ) : feed.length === 0 ? (
                <div style={{ padding: 15, fontSize: 13, color: '#666' }}>No new videos</div>
              ) : (
                <VideoList
                  items={feed}
                  onPlay={onPlay}
                  onOpenChannel={onOpenChannel}
                  onBlockChannel={onBlockChannel}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* カテゴリ別 */}
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
