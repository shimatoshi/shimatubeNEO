import type { VideoItem } from '../api/client'
import VideoList from '../components/VideoList'

interface Props {
  history: VideoItem[]
  onPlay: (videoId: string) => void
  onOpenChannel: (channelId: string) => void
  onBlockChannel: (channelId: string, name: string) => void
}

export default function HistoryScreen({ history, onPlay, onOpenChannel, onBlockChannel }: Props) {
  return (
    <div>
      <div style={{ padding: 10, fontWeight: 'bold', borderBottom: '1px solid #333' }}>
        Watch History
      </div>
      <div className="list-container">
        <VideoList
          items={history}
          onPlay={onPlay}
          onOpenChannel={onOpenChannel}
          onBlockChannel={onBlockChannel}
          emptyMessage="No history yet."
        />
      </div>
    </div>
  )
}
