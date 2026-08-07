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
      <div className="screen-heading">
        <div className="eyebrow">LIBRARY</div>
        <h1>視聴履歴</h1>
      </div>
      <div className="list-container">
        <VideoList
          items={history}
          onPlay={onPlay}
          onOpenChannel={onOpenChannel}
          onBlockChannel={onBlockChannel}
          emptyMessage="まだ視聴履歴がありません"
        />
      </div>
    </div>
  )
}
