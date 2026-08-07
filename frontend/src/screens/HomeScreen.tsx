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
  page: number
}

const ITEMS_PER_PAGE = 5

interface ChannelState {
  feed: ChannelFeed
  page: number
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
    const all = [...feed.unwatched, ...feed.watched]
    if (all.length === 0) return []
    const loopStart = (start % all.length)
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
    if (nextStart < feed.unwatched.length) return { ...state, page: page + 1 }
    if (feed.watched.length > 0) return { ...state, phase: 'watched', page: 0 }
    return { ...state, phase: 'loop', page: page + 1 }
  } else if (phase === 'watched') {
    if (nextStart < feed.watched.length) return { ...state, page: page + 1 }
    return { ...state, phase: 'loop', page: 0 }
  } else {
    return { ...state, page: page + 1 }
  }
}

function getCatPageItems(cat: CategoryData): SearchItem[] {
  const start = cat.page * ITEMS_PER_PAGE
  return cat.items.slice(start, start + ITEMS_PER_PAGE)
}

function advanceCatPage(cat: CategoryData): CategoryData {
  const nextStart = (cat.page + 1) * ITEMS_PER_PAGE
  if (nextStart >= cat.items.length) {
    // ループ: 最初に戻る
    return { ...cat, page: 0 }
  }
  return { ...cat, page: cat.page + 1 }
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
      collapsed: false,
      page: 0,
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

  // === Channel feed handlers ===
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

  // === Category handlers ===
  const toggleCatCollapse = useCallback((index: number) => {
    setCatData(prev =>
      prev.map((c, i) => (i === index ? { ...c, collapsed: !c.collapsed } : c))
    )
  }, [])

  const nextCatPage = useCallback((index: number) => {
    setCatData(prev =>
      prev.map((c, i) => (i === index ? advanceCatPage(c) : c))
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
          <div key={ch.feed.channelId} className="feed-section">
            <div className="cat-header feed-header" onClick={() => toggleChannelCollapse(i)} role="button" tabIndex={0}>
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
                  <button className="feed-refresh-btn" onClick={() => refreshChannel(i)}>
                    ↻ Next
                  </button>
                  <button
                    className="feed-refresh-btn hard"
                    onClick={() => hardRefreshChannel(i)}
                    disabled={ch.refreshing}
                  >
                    {ch.refreshing ? '更新中…' : '↻ 更新'}
                  </button>
                  <span className="feed-count">
                    未視聴 {ch.feed.unwatched.length} ・ 全 {ch.feed.totalFetched} 件
                  </span>
                </div>
                {items.length === 0 ? (
                  <div className="empty-state">このチャンネルに動画はありません</div>
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

      {/* カテゴリ別（Nextボタン付き） */}
      {catData.map((cat, i) => {
        const pageItems = getCatPageItems(cat)
        return (
          <div key={cat.name}>
            <div className="cat-header" onClick={() => toggleCatCollapse(i)}>
              <span>{cat.name}</span>
              <span className={`cat-toggle ${cat.collapsed ? 'closed' : ''}`}>▼</span>
            </div>
            {!cat.collapsed && (
              <div className="cat-content">
                {cat.loading ? (
                  <div className="scroll-sentinel"><div className="loader" /></div>
                ) : (
                  <>
                    <div className="feed-actions">
                      <button className="feed-refresh-btn" onClick={() => nextCatPage(i)}>
                        ↻ Next
                      </button>
                      <span className="feed-count">
                        {cat.page * ITEMS_PER_PAGE + 1}-{Math.min((cat.page + 1) * ITEMS_PER_PAGE, cat.items.length)} / {cat.items.length}
                      </span>
                    </div>
                    <VideoList
                      items={pageItems}
                      onPlay={onPlay}
                      onOpenChannel={onOpenChannel}
                      onOpenPlaylist={onOpenPlaylist}
                      isSubscribed={isSubscribed}
                      onToggleSub={onToggleSub}
                      onBlockChannel={onBlockChannel}
                    />
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
