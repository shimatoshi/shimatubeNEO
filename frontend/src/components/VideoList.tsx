import type { SearchItem } from '../api/client'
import VideoItemComponent from './VideoItem'

interface Props {
  items: SearchItem[]
  currentVideoId?: string | null
  isSubscribed?: (channelId: string) => boolean
  onPlay?: (videoId: string) => void
  onOpenChannel?: (channelId: string) => void
  onOpenPlaylist?: (playlistId: string) => void
  onToggleSub?: (channelId: string, title: string, thumbnail: string) => void
  onBlockChannel?: (channelId: string, name: string) => void
  emptyMessage?: string
}

export default function VideoList({
  items,
  currentVideoId,
  isSubscribed,
  onPlay,
  onOpenChannel,
  onOpenPlaylist,
  onToggleSub,
  onBlockChannel,
  emptyMessage = 'No items',
}: Props) {
  if (!items || items.length === 0) {
    return <div style={{ padding: 20, textAlign: 'center', color: '#666' }}>{emptyMessage}</div>
  }

  return (
    <>
      {items.map((item, i) => {
        const key = item.type === 'video' ? item.videoId : item.type === 'channel' ? item.channelId : (item as any).playlistId || i
        return (
          <VideoItemComponent
            key={key}
            item={item}
            isPlaying={item.type === 'video' && item.videoId === currentVideoId}
            isSubscribed={item.type === 'channel' ? isSubscribed?.(item.channelId) : false}
            onPlay={onPlay}
            onOpenChannel={onOpenChannel}
            onOpenPlaylist={onOpenPlaylist}
            onToggleSub={onToggleSub}
            onBlockChannel={onBlockChannel}
          />
        )
      })}
    </>
  )
}
