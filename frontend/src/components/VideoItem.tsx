import { useState, useRef, useCallback } from 'react'
import type { VideoItem as VideoItemType, ChannelItem, PlaylistItem, SearchItem } from '../api/client'
import { formatDuration, formatViews } from '../utils'

interface Props {
  item: SearchItem
  isPlaying?: boolean
  isSubscribed?: boolean
  onPlay?: (videoId: string) => void
  onOpenChannel?: (channelId: string) => void
  onOpenPlaylist?: (playlistId: string) => void
  onToggleSub?: (channelId: string, title: string, thumbnail: string) => void
  onBlockChannel?: (channelId: string, name: string) => void
}

export default function VideoItemComponent({
  item,
  isPlaying,
  isSubscribed,
  onPlay,
  onOpenChannel,
  onOpenPlaylist,
  onToggleSub,
  onBlockChannel,
}: Props) {
  const [showDlMenu, setShowDlMenu] = useState(false)
  const timerRef = useRef<number>(0)

  const download = useCallback((videoId: string, format: 'video' | 'audio') => {
    const a = document.createElement('a')
    a.href = `/stream/${videoId}?dl=1&format=${format}`
    a.download = ''
    document.body.appendChild(a)
    a.click()
    a.remove()
    setShowDlMenu(false)
  }, [])

  if (item.type === 'channel') {
    const ch = item as ChannelItem
    return (
      <div className="channel-item" onClick={() => onOpenChannel?.(ch.channelId)}>
        <img
          src={ch.thumbnail}
          className="c-thumb"
          onError={e => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(ch.title)}` }}
        />
        <div className="c-name">{ch.title}</div>
        <button
          className={`c-sub-btn ${isSubscribed ? 'subscribed' : ''}`}
          onClick={e => { e.stopPropagation(); onToggleSub?.(ch.channelId, ch.title, ch.thumbnail || '') }}
        >
          {isSubscribed ? 'Subbed' : 'Subscribe'}
        </button>
      </div>
    )
  }

  if (item.type === 'playlist') {
    const pl = item as PlaylistItem
    return (
      <div className="video-item playlist-item" onClick={() => onOpenPlaylist?.(pl.playlistId)}>
        <div className="thumb">
          <img src={pl.thumbnail} loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          <span className="duration">LIST</span>
        </div>
        <div className="details">
          <div className="v-title">{pl.title}</div>
          <div className="v-meta">Playlist</div>
        </div>
      </div>
    )
  }

  const v = item as VideoItemType
  return (
    <div
      className={`video-item ${isPlaying ? 'now-playing' : ''}`}
      onTouchStart={() => { timerRef.current = window.setTimeout(() => setShowDlMenu(true), 600) }}
      onTouchEnd={() => clearTimeout(timerRef.current)}
      onTouchMove={() => { clearTimeout(timerRef.current); setShowDlMenu(false) }}
    >
      <div className="thumb" onClick={() => onPlay?.(v.videoId)}>
        <img src={v.thumbnail} loading="lazy" />
        <span className="duration">{formatDuration(v.lengthSeconds)}</span>
      </div>
      <div className="details">
        <div className="v-title" onClick={() => onPlay?.(v.videoId)}>{v.title}</div>
        <div className="v-meta">
          {v.author} {v.viewCount ? `• ${formatViews(v.viewCount)}` : ''}
          {v.channelId && (
            <span
              className="block-btn"
              onClick={e => { e.stopPropagation(); onBlockChannel?.(v.channelId!, v.author || '') }}
            >
              Block
            </span>
          )}
        </div>
      </div>
      <div className="dl-btn-wrap" onClick={e => e.stopPropagation()}>
        <div className="dl-btn" onClick={() => setShowDlMenu(prev => !prev)}>💾</div>
        {showDlMenu && (
          <div className="dl-menu">
            <div className="dl-menu-item" onClick={() => download(v.videoId, 'video')}>
              🎬 MP4
            </div>
            <div className="dl-menu-item" onClick={() => download(v.videoId, 'audio')}>
              🎵 MP3
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
