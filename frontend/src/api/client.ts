const API_BASE = '/api_proxy/api/v1'

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`)
  return res.json()
}

export interface VideoItem {
  type: 'video'
  videoId: string
  title: string
  author?: string
  channelId?: string
  lengthSeconds?: number
  viewCount?: number
  uploadDate?: string
  thumbnail?: string
}

export interface ChannelItem {
  type: 'channel'
  channelId: string
  title: string
  thumbnail?: string
}

export interface PlaylistItem {
  type: 'playlist'
  playlistId: string
  title: string
  thumbnail?: string
}

export type SearchItem = VideoItem | ChannelItem | PlaylistItem

export interface VideoDetails {
  status: 'ready' | 'error'
  url: string | null
  metadata: {
    title?: string
    description?: string
    author?: string
    channelId?: string
    viewCount?: number
    uploadDate?: string
    thumbnail?: string
  }
}

export interface ChannelResponse {
  channel: { title: string }
  videos: VideoItem[]
}

export interface PlaylistResponse {
  title: string
  videos: VideoItem[]
}

export interface Comment {
  author: string
  text: string
}

export interface SubChannel {
  channelId: string
  title: string
  thumbnail: string
}

export interface UserData {
  categories: string[]
  blocked_channels: { id: string; name: string }[]
  blocked_keywords: string[]
  subscriptions: SubChannel[]
  history: VideoItem[]
}

export const api = {
  search: (query: string, page = 1, filter = '') => {
    let url = `${API_BASE}/search?q=${encodeURIComponent(query)}&page=${page}`
    if (filter) url += `&filter=${filter}`
    return apiFetch<SearchItem[]>(url)
  },

  getVideo: (videoId: string) =>
    apiFetch<VideoDetails>(`${API_BASE}/videos/${videoId}?quality=720`),

  getComments: (videoId: string) =>
    apiFetch<Comment[]>(`${API_BASE}/comments/${videoId}`),

  getChannelVideos: (channelId: string, page = 1, filter = '') => {
    let url = `${API_BASE}/channels/${channelId}?page=${page}`
    if (filter) url += `&filter=${filter}`
    return apiFetch<ChannelResponse>(url)
  },

  getPlaylist: (playlistId: string) =>
    apiFetch<PlaylistResponse>(`${API_BASE}/playlists/${playlistId}`),

  getUserData: () => apiFetch<UserData>('/api/user_data'),

  postUserAction: async (action: string, payload: unknown) => {
    const res = await fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
    })
    return res.json()
  },

  toggleSubscribe: async (channel: SubChannel) => {
    const res = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(channel),
    })
    return res.json() as Promise<{ subscribed: boolean }>
  },

  addHistory: (video: Partial<VideoItem>) =>
    fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(video),
    }),
}
