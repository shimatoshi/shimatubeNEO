const API_BASE = '/api_proxy/api/v1'
const URL_BOARD = 'https://url-board.vercel.app/api/resolve/shimatube'
let backend = ''
let backendReady: Promise<void> | null = null

function getUid() {
  if (typeof window === 'undefined') return ''
  const cookie = document.cookie.match(/(?:^|;\s*)st_uid=([A-Za-z0-9_-]{8,64})/)?.[1]
  let uid = localStorage.getItem('shimatube_uid') || cookie
  if (!uid) uid = crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  localStorage.setItem('shimatube_uid', uid)
  document.cookie = `st_uid=${uid}; Path=/; Max-Age=315360000; SameSite=Lax`
  return uid
}

async function fetchLatestBackend() {
  try {
    const res = await fetch(URL_BOARD, { cache: 'no-store' })
    if (!res.ok) throw new Error(String(res.status))
    const data = await res.json() as { url?: string }
    if (data.url) {
      backend = data.url.replace(/\/$/, '')
      localStorage.setItem('shimatube_backend', backend)
    }
  } catch {
    // ローカル開発ではVite proxy、本番ではキャッシュ済みURLにフォールバックする。
  }
}

async function resolveBackend(force = false) {
  if (typeof window === 'undefined') return
  const cached = localStorage.getItem('shimatube_backend')
  if (cached) backend = cached.replace(/\/$/, '')
  if (cached && !force) {
    // キャッシュ済みURLで即座に描画を始め、最新化は裏で行う(url-board往復で全画面が待たされないように)
    fetchLatestBackend()
    return
  }
  await fetchLatestBackend()
}

function ensureBackend() {
  if (!backendReady) backendReady = resolveBackend()
  return backendReady
}

function backendUrl(path: string) {
  const sep = path.includes('?') ? '&' : '?'
  return `${backend}${path}${sep}uid=${encodeURIComponent(getUid())}`
}

function backendAssetUrl(path: string | null) {
  if (!path || /^https?:\/\//i.test(path)) return path
  return `${backend}${path.startsWith('/') ? path : `/${path}`}`
}

async function apiFetch<T>(path: string, retried = false): Promise<T> {
  await ensureBackend()
  let res: Response
  try {
    res = await fetch(backendUrl(path))
  } catch (error) {
    if (!retried) {
      backendReady = resolveBackend(true)
      await backendReady
      return apiFetch(path, true)
    }
    throw error
  }
  if (!res.ok) {
    if (!retried && (res.status === 404 || res.status >= 500)) {
      backendReady = resolveBackend(true)
      await backendReady
      return apiFetch(path, true)
    }
    throw new Error(`API ${res.status}: ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

async function apiSend<T>(path: string, body: unknown): Promise<T> {
  await ensureBackend()
  const res = await fetch(backendUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`)
  return res.json() as Promise<T>
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
  is_live: boolean
  hls_url: string | null
  hls: number[]
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

export interface ChannelFeed {
  channelId: string
  title: string
  thumbnail: string
  unwatched: VideoItem[]
  watched: VideoItem[]
  totalFetched: number
}

export interface FeedResponse {
  channels: ChannelFeed[]
}

export const api = {
  search: (query: string, page = 1, filter = '') => {
    let url = `${API_BASE}/search?q=${encodeURIComponent(query)}&page=${page}`
    if (filter) url += `&filter=${filter}`
    return apiFetch<SearchItem[]>(url)
  },

  getVideo: async (videoId: string) => {
    const details = await apiFetch<VideoDetails>(`${API_BASE}/videos/${videoId}?quality=720`)
    return { ...details, url: backendAssetUrl(details.url) }
  },

  getComments: (videoId: string) =>
    apiFetch<Comment[]>(`${API_BASE}/comments/${videoId}`),

  getChannelVideos: (channelId: string, page = 1, filter = '') => {
    let url = `${API_BASE}/channels/${channelId}?page=${page}`
    if (filter) url += `&filter=${filter}`
    return apiFetch<ChannelResponse>(url)
  },

  getPlaylist: (playlistId: string) =>
    apiFetch<PlaylistResponse>(`${API_BASE}/playlists/${playlistId}`),

  getFeed: () => apiFetch<FeedResponse>('/api/feed'),

  refreshChannelFeed: (channelId: string) =>
    apiFetch<ChannelFeed>(`/api/feed/refresh/${channelId}`),

  getUserData: () => apiFetch<UserData>('/api/user_data'),

  postUserAction: async (action: string, payload: unknown) => {
    return apiSend('/', { action, payload })
  },

  toggleSubscribe: async (channel: SubChannel) => {
    return apiSend<{ subscribed: boolean }>('/api/subscribe', channel)
  },

  addHistory: (video: Partial<VideoItem>) =>
    apiSend('/api/history', video),

  streamUrl: async (videoId: string, format: 'video' | 'audio' = 'video') => {
    await ensureBackend()
    return backendUrl(`/stream/${videoId}?dl=1&format=${format}`)
  },

  hlsUrl: (videoId: string, quality: number) => backendUrl(`/hls/${videoId}?q=${quality}`),
}
