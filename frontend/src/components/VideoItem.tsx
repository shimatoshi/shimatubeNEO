import { useCallback } from 'react'
import { api } from '../api/client'
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
  const download = useCallback(async (videoId: string, format: 'video' | 'audio') => {
    // 合成<a>.click()はWebViewのDownloadListener(onDownloadStart)に届かないことが判明済み。
    // location.assignによるナビゲーションでのみ確実に発火する。
    const href = await api.streamUrl(videoId, format)
    window.location.assign(href)
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
    <div className={`video-item ${isPlaying ? 'now-playing' : ''}`}>
      <div className="thumb" onClick={() => onPlay?.(v.videoId)}>
        <img src={v.thumbnail} loading="lazy" />
        <span className="duration">{formatDuration(v.lengthSeconds)}</span>
      </div>
      <div className="details">
        <div className="v-title" onClick={() => onPlay?.(v.videoId)}>{v.title}</div>
          <div className="v-meta">{v.author} {v.viewCount ? `• ${formatViews(v.viewCount)}` : ''}</div>
          <div className="item-actions" onClick={e => e.stopPropagation()}>
            <button className="quiet-action" onClick={() => download(v.videoId, 'video')}>動画保存</button>
            <button className="quiet-action" onClick={() => download(v.videoId, 'audio')}>音声保存</button>
            {v.channelId && (
              <button
                className="quiet-action danger-action"
                onClick={() => onBlockChannel?.(v.channelId!, v.author || '')}
              >
                チャンネルを非表示
              </button>
            )}
          </div>
      </div>
    </div>
  )
}
