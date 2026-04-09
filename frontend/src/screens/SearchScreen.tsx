import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../api/client'
import type { SearchItem } from '../api/client'
import VideoList from '../components/VideoList'
import FilterBar from '../components/FilterBar'

interface Props {
  query: string
  onPlay: (videoId: string) => void
  onOpenChannel: (channelId: string) => void
  onOpenPlaylist: (playlistId: string) => void
  isSubscribed: (channelId: string) => boolean
  onToggleSub: (channelId: string, title: string, thumbnail: string) => void
  onBlockChannel: (channelId: string, name: string) => void
}

export default function SearchScreen({
  query,
  onPlay,
  onOpenChannel,
  onOpenPlaylist,
  isSubscribed,
  onToggleSub,
  onBlockChannel,
}: Props) {
  const [items, setItems] = useState<SearchItem[]>([])
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const doSearch = useCallback(async (p: number, f: string, append: boolean) => {
    setLoading(true)
    try {
      const results = await api.search(query, p, f)
      if (results.length < 20) setHasMore(false)
      setItems(prev => append ? [...prev, ...results] : results)
    } catch {
      if (!append) setItems([])
    }
    setLoading(false)
  }, [query])

  useEffect(() => {
    setItems([])
    setPage(1)
    setHasMore(true)
    doSearch(1, filter, false)
  }, [query, filter, doSearch])

  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !loading && hasMore) {
        setPage(prev => {
          const next = prev + 1
          doSearch(next, filter, true)
          return next
        })
      }
    }, { rootMargin: '300px' })
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasMore, loading, filter, doSearch])

  return (
    <div>
      <div className="cat-header">Search: {query}</div>
      <FilterBar
        current={filter}
        filters={[
          { value: '', label: 'All' },
          { value: 'live', label: 'Live' },
        ]}
        onChange={f => { setFilter(f); setPage(1); setHasMore(true) }}
      />
      <div className="list-container">
        <VideoList
          items={items}
          onPlay={onPlay}
          onOpenChannel={onOpenChannel}
          onOpenPlaylist={onOpenPlaylist}
          isSubscribed={isSubscribed}
          onToggleSub={onToggleSub}
          onBlockChannel={onBlockChannel}
        />
      </div>
      {hasMore && (
        <div ref={sentinelRef} className="scroll-sentinel">
          <div className="loader" />
        </div>
      )}
    </div>
  )
}
