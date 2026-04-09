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
  const [title, setTitle] = useState('Loading Playlist...')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.getPlaylist(playlistId).then(res => {
      setTitle(res.title)
      setVideos(res.videos)
      setLoading(false)
    }).catch(() => {
      setTitle('Error loading playlist.')
      setLoading(false)
    })
  }, [playlistId])

  if (loading) {
    return <div style={{ padding: 20 }}>Loading Playlist...</div>
  }

  return (
    <div>
      <div className="cat-header" style={{ fontSize: 16 }}>
        <span>{title}</span>
        <button
          className="btn"
          style={{ fontSize: 11, padding: '4px 10px' }}
          onClick={() => onPlayAll(videos, title, playlistId)}
        >
          ▶ Play All
        </button>
      </div>
      <div style={{ padding: '4px 10px', fontSize: 12, color: '#888' }}>
        {videos.length} videos
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
