import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../api/client'
import type { VideoItem } from '../api/client'
import VideoList from '../components/VideoList'
import FilterBar from '../components/FilterBar'

interface Props {
  channelId: string
  onPlay: (videoId: string) => void
  onOpenChannel: (channelId: string) => void
  onBlockChannel: (channelId: string, name: string) => void
}

export default function ChannelScreen({ channelId, onPlay, onOpenChannel, onBlockChannel }: Props) {
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [title, setTitle] = useState('Loading...')
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const loadPage = useCallback(async (p: number, f: string, append: boolean) => {
    setLoading(true)
    try {
      const res = await api.getChannelVideos(channelId, p, f)
      setTitle(res.channel.title)
      if (res.videos.length < 20) setHasMore(false)
      setVideos(prev => append ? [...prev, ...res.videos] : res.videos)
    } catch {
      if (!append) setVideos([])
    }
    setLoading(false)
  }, [channelId])

  useEffect(() => {
    setVideos([])
    setPage(1)
    setHasMore(true)
    loadPage(1, filter, false)
  }, [channelId, filter, loadPage])

  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !loading && hasMore) {
        setPage(prev => {
          const next = prev + 1
          loadPage(next, filter, true)
          return next
        })
      }
    }, { rootMargin: '300px' })
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasMore, loading, filter, loadPage])

  return (
    <div>
      <div className="cat-header" style={{ fontSize: 16 }}>{title}</div>
      <FilterBar
        current={filter}
        filters={[
          { value: '', label: 'Videos' },
          { value: 'live', label: 'Live' },
        ]}
        onChange={f => { setFilter(f); setPage(1); setHasMore(true) }}
      />
      <div className="list-container">
        <VideoList
          items={videos}
          onPlay={onPlay}
          onOpenChannel={onOpenChannel}
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
