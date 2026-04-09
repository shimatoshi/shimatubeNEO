import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import type { SearchItem, VideoItem, ChannelFeed } from '../api/client'
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

const ITEMS_PER_PAGE = 5

interface ChannelState {
  feed: ChannelFeed
  page: number        // 現在のページ（0始まり）
  phase: 'unwatched' | 'watched' | 'loop'
  collapsed: boolean
  refreshing: boolean
}

function getPageItems(state: ChannelState): VideoItem[] {
  const { feed, page, phase } = state
  const start = page * ITEMS_PER_PAGE

  if (phase === 'unwatched') {
    return feed.unwatched.slice(start, start + ITEMS_PER_PAGE)
  } else if (phase === 'watched') {
    return feed.watched.slice(start, start + ITEMS_PER_PAGE)
  } else {
    // loop: 全動画を結合して循環
    const all = [...feed.unwatched, ...feed.watched]
    if (all.length === 0) return []
    const loopStart = (start % all.length)
    // 端を超える場合はラップ
    const items: VideoItem[] = []
    for (let i = 0; i < ITEMS_PER_PAGE; i++) {
      items.push(all[(loopStart + i) % all.length])
    }
    return items
  }
}

function advancePage(state: ChannelState): ChannelState {
  const { feed, page, phase } = state
  const nextStart = (page + 1) * ITEMS_PER_PAGE

  if (phase === 'unwatched') {
    if (nextStart < feed.unwatched.length) {
      return { ...state, page: page + 1 }
    }
    // 未視聴が尽きた → 視聴済みへ
    if (feed.watched.length > 0) {
      return { ...state, phase: 'watched', page: 0 }
    }
    // 視聴済みもない → ループ
    return { ...state, phase: 'loop', page: page + 1 }
  } else if (phase === 'watched') {
    if (nextStart < feed.watched.length) {
      return { ...state, page: page + 1 }
    }
    // 視聴済みも尽きた → ループ
    return { ...state, phase: 'loop', page: 0 }
  } else {
    // loop: 常にページ進行
    return { ...state, page: page + 1 }
  }
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
  const [channels, setChannels] = useState<ChannelState[]>([])
  const [feedLoading, setFeedLoading] = useState(false)
  const [catData, setCatData] = useState<CategoryData[]>([])

  // 購読フィード取得
  useEffect(() => {
    if (!hasSubs) return
    setFeedLoading(true)
    api.getFeed().then(res => {
      setChannels(res.channels.map(feed => ({
        feed,
        page: 0,
        phase: feed.unwatched.length > 0 ? 'unwatched' as const : 'watched' as const,
        collapsed: false,
        refreshing: false,
      })))
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

  const toggleChannelCollapse = useCallback((index: number) => {
    setChannels(prev =>
      prev.map((c, i) => (i === index ? { ...c, collapsed: !c.collapsed } : c))
    )
  }, [])

  const refreshChannel = useCallback((index: number) => {
    setChannels(prev =>
      prev.map((c, i) => (i === index ? advancePage({ ...c, refreshing: false }) : c))
    )
  }, [])

  const hardRefreshChannel = useCallback((index: number) => {
    const ch = channels[index]
    if (!ch) return
    setChannels(prev =>
      prev.map((c, i) => (i === index ? { ...c, refreshing: true } : c))
    )
    api.refreshChannelFeed(ch.feed.channelId).then(feed => {
      setChannels(prev =>
        prev.map((c, i) => (i === index ? {
          feed,
          page: 0,
          phase: feed.unwatched.length > 0 ? 'unwatched' as const : 'watched' as const,
          collapsed: false,
          refreshing: false,
        } : c))
      )
    }).catch(() => {
      setChannels(prev =>
        prev.map((c, i) => (i === index ? { ...c, refreshing: false } : c))
      )
    })
  }, [channels])

  const toggleCatCollapse = useCallback((index: number) => {
    setCatData(prev =>
      prev.map((c, i) => (i === index ? { ...c, collapsed: !c.collapsed } : c))
    )
  }, [])

  if (!categories.length && !hasSubs) {
    return <div style={{ padding: 20 }}>Loading settings...</div>
  }

  return (
    <div className="list-container">
      {/* 購読チャンネル別フィード */}
      {feedLoading && (
        <div className="scroll-sentinel"><div className="loader" /></div>
      )}

      {channels.map((ch, i) => {
        const items = getPageItems(ch)
        const phaseLabel = ch.phase === 'unwatched' ? 'NEW'
          : ch.phase === 'watched' ? 'WATCHED' : 'LOOP'

        return (
          <div key={ch.feed.channelId}>
            <div
              className="cat-header feed-header"
              onClick={() => toggleChannelCollapse(i)}
            >
              <div className="feed-ch-info">
                <img
                  src={ch.feed.thumbnail}
                  className="feed-ch-thumb"
                  onError={e => {
                    (e.target as HTMLImageElement).src =
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(ch.feed.title)}`
                  }}
                />
                <span>{ch.feed.title}</span>
                <span className={`feed-phase ${ch.phase}`}>{phaseLabel}</span>
              </div>
              <span className={`cat-toggle ${ch.collapsed ? 'closed' : ''}`}>▼</span>
            </div>
            {!ch.collapsed && (
              <div className="cat-content">
                <div className="feed-actions">
                  <button
                    className="feed-refresh-btn"
                    onClick={e => { e.stopPropagation(); refreshChannel(i) }}
                  >
                    ↻ Next
                  </button>
                  <button
                    className="feed-refresh-btn hard"
                    onClick={e => { e.stopPropagation(); hardRefreshChannel(i) }}
                    disabled={ch.refreshing}
                  >
                    {ch.refreshing ? '...' : '🔄 Reload'}
                  </button>
                  <span className="feed-count">
                    {ch.feed.unwatched.length} new / {ch.feed.totalFetched} total
                  </span>
                </div>
                {items.length === 0 ? (
                  <div style={{ padding: 15, fontSize: 13, color: '#666' }}>No videos</div>
                ) : (
                  <VideoList
                    items={items}
                    onPlay={onPlay}
                    onOpenChannel={onOpenChannel}
                    onBlockChannel={onBlockChannel}
                  />
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* カテゴリ別 */}
      {catData.map((cat, i) => (
        <div key={cat.name}>
          <div className="cat-header" onClick={() => toggleCatCollapse(i)}>
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
