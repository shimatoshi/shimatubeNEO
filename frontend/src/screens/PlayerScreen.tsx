import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api/client'
import type { VideoItem, VideoDetails, Comment } from '../api/client'
import VideoList from '../components/VideoList'
import { formatViews } from '../utils'

interface PlaylistState {
  id: string
  title: string
  videos: VideoItem[]
}

interface Props {
  videoId: string
  playlist: PlaylistState | null
  isSubscribed: (channelId: string) => boolean
  onToggleSub: (channelId: string, title: string, thumbnail: string) => void
  onPlay: (videoId: string) => void
  onOpenChannel: (channelId: string) => void
  onBlockChannel: (channelId: string, name: string) => void
  onVideoLoaded: (meta: VideoDetails['metadata']) => void
  onPlayNext: (videoId: string) => void
}

export default function PlayerScreen({
  videoId,
  playlist,
  isSubscribed,
  onToggleSub,
  onPlay,
  onOpenChannel,
  onBlockChannel,
  onVideoLoaded,
  onPlayNext,
}: Props) {
  const [meta, setMeta] = useState<VideoDetails['metadata']>({})
  const [streamUrl, setStreamUrl] = useState<string | null>(null)
  const [tab, setTab] = useState<'related' | 'comments'>('related')
  const [related, setRelated] = useState<VideoItem[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [showDesc, setShowDesc] = useState(false)
  const [loadingComments, setLoadingComments] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (!videoId) return

    setStreamUrl(null)
    setComments([])
    setShowDesc(false)

    api.getVideo(videoId).then(data => {
      setMeta(data.metadata)
      onVideoLoaded(data.metadata)
      if (data.status === 'ready' && data.url) {
        setStreamUrl(data.url)
      } else {
        setStreamUrl(null)
      }
      setTab('related')
      setShowDesc(false)

      // Load related
      if (playlist) {
        setRelated(playlist.videos)
      } else if (data.metadata.channelId) {
        api.getChannelVideos(data.metadata.channelId).then(res => {
          setRelated(res.videos.filter(v => v.videoId !== videoId))
        }).catch(() => setRelated([]))
      }
    }).catch(console.error)
  }, [videoId])

  useEffect(() => {
    const el = videoRef.current
    if (!el || !streamUrl) return
    el.src = streamUrl
    el.play().catch(() => {})
  }, [streamUrl])

  // Auto-play next in playlist
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    const handleEnded = () => {
      if (!playlist) return
      const idx = playlist.videos.findIndex(v => v.videoId === videoId)
      if (idx >= 0 && idx < playlist.videos.length - 1) {
        onPlayNext(playlist.videos[idx + 1].videoId)
      }
    }
    el.addEventListener('ended', handleEnded)
    return () => el.removeEventListener('ended', handleEnded)
  }, [videoId, playlist, onPlayNext])

  const loadComments = useCallback(async () => {
    setTab('comments')
    setLoadingComments(true)
    try {
      const cmts = await api.getComments(videoId)
      setComments(cmts)
    } catch {
      setComments([])
    }
    setLoadingComments(false)
  }, [videoId])

  const shareVideo = async () => {
    const url = `https://youtu.be/${videoId}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = url
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
  }

  const togglePip = () => {
    const v = videoRef.current
    if (v?.requestPictureInPicture) v.requestPictureInPicture()
  }

  const subbed = meta.channelId ? isSubscribed(meta.channelId) : false

  return (
    <div className="player-view">
      <video ref={videoRef} controls playsInline preload="metadata" />
      <div className="info-area">
        <div className="video-title">{meta.title || '動画を読み込み中…'}</div>
        <div className="meta-row">
          <span>{formatViews(meta.viewCount)} 回再生</span>
          <span>{meta.uploadDate || ''}</span>
        </div>

        <div className="action-bar">
          <div className="action-item">
            {streamUrl ? (
              <div className="dl-player-wrap">
                <a href={`${streamUrl}?dl=1`} className="dl-ready" download>動画保存</a>
                <a href={`${streamUrl}?dl=1&format=audio`} className="dl-ready dl-audio" download>音声保存</a>
              </div>
            ) : (
              <span className="dl-wait">保存準備中…</span>
            )}
          </div>
          <div className="action-item" onClick={shareVideo}>
            <span className="action-icon">↗</span><span>共有</span>
          </div>
          <div className="action-item" onClick={() => setShowDesc(p => !p)}>
            <span className="action-icon">≡</span><span>説明</span>
          </div>
          <div className="action-item" onClick={togglePip}>
            <span className="action-icon">▣</span><span>小窓</span>
          </div>
          <div className="action-item" onClick={() => {
            if (meta.channelId) onToggleSub(meta.channelId, meta.author || '', meta.thumbnail || '')
          }}>
            <span className="action-icon" style={{ color: subbed ? 'yellow' : '#fff' }}>
              {subbed ? '★' : '☆'}
            </span>
            <span>{subbed ? '購読中' : '購読'}</span>
          </div>
        </div>

        <div
          className="channel-item"
          onClick={() => meta.channelId && onOpenChannel(meta.channelId)}
        >
          <img
            className="c-thumb"
            src={meta.thumbnail || `https://ui-avatars.com/api/?name=${encodeURIComponent(meta.author || 'U')}`}
            onError={e => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=U` }}
          />
          <div className="c-name">
            {meta.author || 'チャンネル不明'}
            {meta.channelId && (
              <span
                className="block-btn"
                onClick={e => { e.stopPropagation(); onBlockChannel(meta.channelId!, meta.author || '') }}
              >
                非表示
              </span>
            )}
          </div>
        </div>

        {showDesc && (
          <div className="desc-box" style={{ display: 'block' }}>
            {meta.description || ''}
          </div>
        )}

        <div className="tabs">
          <div
            className={`tab ${tab === 'related' ? 'active' : ''}`}
            onClick={() => setTab('related')}
          >
            {playlist ? 'プレイリスト' : '関連動画'}
          </div>
          <div
            className={`tab ${tab === 'comments' ? 'active' : ''}`}
            onClick={loadComments}
          >
            コメント
          </div>
        </div>

        <div className="list-container">
          {tab === 'related' ? (
            <VideoList
              items={related}
              currentVideoId={videoId}
              onPlay={onPlay}
              onOpenChannel={onOpenChannel}
              onBlockChannel={onBlockChannel}
            />
          ) : loadingComments ? (
            <div className="empty-state">コメントを読み込み中…</div>
          ) : comments.length === 0 ? (
            <div className="empty-state">コメントはありません</div>
          ) : (
            comments.map((c, i) => (
              <div key={i} style={{ marginBottom: 15, fontSize: 13 }}>
                <div style={{ fontWeight: 'bold', color: '#aaa', fontSize: 11 }}>{c.author}</div>
                <div>{c.text}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
