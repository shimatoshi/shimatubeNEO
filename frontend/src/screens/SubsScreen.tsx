import type { SubChannel } from '../api/client'

interface Props {
  subs: SubChannel[]
  onOpenChannel: (channelId: string) => void
  onToggleSub: (channelId: string, title: string, thumbnail: string) => void
}

export default function SubsScreen({ subs, onOpenChannel, onToggleSub }: Props) {
  return (
    <div>
      <div style={{ padding: 10, fontWeight: 'bold', borderBottom: '1px solid #333' }}>
        Subscribed Channels
      </div>
      <div className="list-container">
        {!subs.length ? (
          <div style={{ padding: 20, color: '#aaa' }}>No subscriptions yet.</div>
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
                Subbed
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
