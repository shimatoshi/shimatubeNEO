import { useState, useEffect } from 'react'
import { api } from '../api/client'
import type { VideoItem } from '../api/client'
import VideoList from '../components/VideoList'

interface Props {
  playlistId: string
  onPlay: (videoId: string) => void
  onPlayAll: (videos: VideoItem[], title: string, playlistId: string) => void
  onOpenChannel: (channelId: string) => void
  onBlockChannel: (channelId: string, name: string) => void
  currentVideoId?: string | null
}

export default function PlaylistScreen({
  playlistId,
  onPlay,
  onPlayAll,
  onOpenChannel,
  onBlockChannel,
  currentVideoId,
}: Props) {
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [title, setTitle] = useState('プレイリストを読み込み中…')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.getPlaylist(playlistId).then(res => {
      setTitle(res.title)
      setVideos(res.videos)
      setLoading(false)
    }).catch(() => {
      setTitle('プレイリストを読み込めませんでした')
      setLoading(false)
    })
  }, [playlistId])

  if (loading) {
    return <div style={{ padding: 20 }}>Loading Playlist...</div>
  }

  return (
    <div>
      <div className="screen-heading playlist-heading">
        <span>{title}</span>
        <button
          className="btn"
          onClick={() => onPlayAll(videos, title, playlistId)}
        >
          ▶ すべて再生
        </button>
      </div>
      <div className="result-count">
        {videos.length} 件の動画
      </div>
      <div className="list-container">
        <VideoList
          items={videos}
          currentVideoId={currentVideoId}
          onPlay={onPlay}
          onOpenChannel={onOpenChannel}
          onBlockChannel={onBlockChannel}
        />
      </div>
    </div>
  )
}
