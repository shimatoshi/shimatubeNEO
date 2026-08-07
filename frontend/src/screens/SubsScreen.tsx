import type { SubChannel } from '../api/client'

interface Props {
  subs: SubChannel[]
  onOpenChannel: (channelId: string) => void
  onToggleSub: (channelId: string, title: string, thumbnail: string) => void
}

export default function SubsScreen({ subs, onOpenChannel, onToggleSub }: Props) {
  return (
    <div>
      <div className="screen-heading">
        <div className="eyebrow">LIBRARY</div>
        <h1>購読チャンネル</h1>
      </div>
      <div className="list-container">
        {!subs.length ? (
          <div className="empty-state">購読中のチャンネルはありません</div>
        ) : (
          subs.map(c => (
            <div key={c.channelId} className="channel-item" onClick={() => onOpenChannel(c.channelId)}>
              <img
                src={c.thumbnail}
                className="c-thumb"
                onError={e => {
                  (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(c.title)}`
                }}
              />
              <div className="c-name">{c.title}</div>
              <button
                className="c-sub-btn subscribed"
                onClick={e => { e.stopPropagation(); onToggleSub(c.channelId, c.title, c.thumbnail) }}
              >
                購読中
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
