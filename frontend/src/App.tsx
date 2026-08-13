import { useState, useCallback, useEffect, useRef } from 'react'
import { useUserData } from './hooks/useUserData'
import { useToast } from './hooks/useToast'
import type { VideoItem, VideoDetails } from './api/client'
import { extractPlaylistId } from './utils'
import SearchBar from './components/SearchBar'
import BottomNav from './components/BottomNav'
import MiniPlayer from './components/MiniPlayer'
import ConfigModal from './components/ConfigModal'
import Toast from './components/Toast'
import HomeScreen from './screens/HomeScreen'
import SearchScreen from './screens/SearchScreen'
import ChannelScreen from './screens/ChannelScreen'
import PlayerScreen from './screens/PlayerScreen'
import SubsScreen from './screens/SubsScreen'
import HistoryScreen from './screens/HistoryScreen'
import PlaylistScreen from './screens/PlaylistScreen'

type View =
  | { type: 'home' }
  | { type: 'search'; query: string }
  | { type: 'channel'; channelId: string }
  | { type: 'player'; videoId: string }
  | { type: 'subs' }
  | { type: 'history' }
  | { type: 'playlist'; playlistId: string }

interface PlaylistState {
  id: string
  title: string
  videos: VideoItem[]
}

export default function App() {
  const {
    userData, isSubscribed, toggleSub,
    updateCategories, blockChannel, unblockChannel,
    blockKeyword, unblockKeyword, addToHistory, reload,
  } = useUserData()
  const { message, visible, toast } = useToast()

  const [viewStack, setViewStack] = useState<View[]>([{ type: 'home' }])
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null)
  const [currentVideoTitle, setCurrentVideoTitle] = useState('')
  const [playlist, setPlaylist] = useState<PlaylistState | null>(null)
  const [configOpen, setConfigOpen] = useState(false)

  const currentView = viewStack[viewStack.length - 1]
  const activeTab = currentView.type === 'subs' ? 'subs'
    : currentView.type === 'history' ? 'history'
    : currentView.type === 'player' ? 'player'
    : 'home'

  // Androidの実機戻る操作(ハードキー/ジェスチャー)がアプリの画面スタックを無視して
  // PWA自体を終了/リロードしてしまい、再生中の動画に戻れなくなる問題への対処。
  // viewStackの増減をブラウザのhistoryエントリに同期させ、戻る操作をgoBack()にマップする。
  const poppedByBrowserRef = useRef(false)
  const prevLenRef = useRef(1)

  useEffect(() => {
    const len = viewStack.length
    const prevLen = prevLenRef.current
    prevLenRef.current = len
    if (len > prevLen) {
      window.history.pushState({ depth: len }, '')
    } else if (len < prevLen) {
      if (poppedByBrowserRef.current) {
        poppedByBrowserRef.current = false
      } else {
        window.history.back()
      }
    }
  }, [viewStack])

  useEffect(() => {
    const onPopState = () => {
      poppedByBrowserRef.current = true
      setViewStack(prev => (prev.length > 1 ? prev.slice(0, -1) : prev))
      setTimeout(() => { poppedByBrowserRef.current = false }, 0)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const push = useCallback((view: View) => {
    setViewStack(prev => [...prev, view])
  }, [])

  const goBack = useCallback(() => {
    setViewStack(prev => (prev.length > 1 ? prev.slice(0, -1) : prev))
  }, [])

  const navigateTab = useCallback((tab: string) => {
    if (tab === 'home') {
      setViewStack([{ type: 'home' }])
    } else if (tab === 'subs') {
      push({ type: 'subs' })
    } else if (tab === 'history') {
      push({ type: 'history' })
    }
  }, [push])

  const handleSearch = useCallback((query: string) => {
    const plId = extractPlaylistId(query)
    if (plId) {
      push({ type: 'playlist', playlistId: plId })
    } else {
      push({ type: 'search', query })
    }
  }, [push])

  const handlePlay = useCallback((videoId: string) => {
    setCurrentVideoId(videoId)
    // player画面が既にスタックにある場合は置き換え、なければ追加
    setViewStack(prev => {
      const withoutPlayer = prev.filter(v => v.type !== 'player')
      return [...withoutPlayer, { type: 'player' as const, videoId }]
    })
  }, [])

  const handleVideoLoaded = useCallback((meta: VideoDetails['metadata']) => {
    setCurrentVideoTitle(meta.title || 'Playing...')
    addToHistory({
      videoId: currentVideoId!,
      title: meta.title,
      thumbnail: meta.thumbnail,
      viewCount: meta.viewCount,
      type: 'video',
    })
  }, [currentVideoId, addToHistory])

  const handleOpenChannel = useCallback((channelId: string) => {
    push({ type: 'channel', channelId })
  }, [push])

  const handleOpenPlaylist = useCallback((playlistId: string) => {
    push({ type: 'playlist', playlistId })
  }, [push])

  const handleToggleSub = useCallback(async (channelId: string, title: string, thumbnail: string) => {
    const subbed = await toggleSub({ channelId, title, thumbnail })
    toast(subbed ? 'Subscribed' : 'Unsubscribed')
  }, [toggleSub, toast])

  const handleBlockChannel = useCallback(async (channelId: string, name: string) => {
    if (confirm(`Block channel "${name}"?`)) {
      await blockChannel(channelId, name)
      toast('Blocked')
    }
  }, [blockChannel, toast])

  const handlePlayAll = useCallback((videos: VideoItem[], title: string, playlistId: string) => {
    if (videos.length > 0) {
      setPlaylist({ id: playlistId, title, videos })
      setCurrentVideoId(videos[0].videoId)
      push({ type: 'player', videoId: videos[0].videoId })
    }
  }, [push])

  const handlePlayNext = useCallback((videoId: string) => {
    setCurrentVideoId(videoId)
    setViewStack(prev => {
      const newStack = prev.filter(v => v.type !== 'player')
      return [...newStack, { type: 'player' as const, videoId }]
    })
  }, [])

  const closeMiniPlayer = useCallback(() => {
    setCurrentVideoId(null)
    setCurrentVideoTitle('')
    setPlaylist(null)
  }, [])

  const restorePlayer = useCallback(() => {
    if (currentVideoId) {
      push({ type: 'player', videoId: currentVideoId })
    }
  }, [currentVideoId, push])

  const forceUpdate = useCallback(() => {
    if ('caches' in window) {
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()))
    }
    window.location.href = '/?t=' + Date.now()
  }, [])

  const showMini = currentVideoId !== null && currentView.type !== 'player'

  return (
    <>
      <SearchBar
        onSearch={handleSearch}
        onConfig={() => setConfigOpen(true)}
        showBack={viewStack.length > 1}
        onBack={goBack}
      />

      <div className="view-container">
        {currentView.type === 'home' && (
          <HomeScreen
            categories={userData?.categories || []}
            hasSubs={(userData?.subscriptions.length ?? 0) > 0}
            onPlay={handlePlay}
            onOpenChannel={handleOpenChannel}
            onOpenPlaylist={handleOpenPlaylist}
            isSubscribed={isSubscribed}
            onToggleSub={handleToggleSub}
            onBlockChannel={handleBlockChannel}
          />
        )}

        {currentView.type === 'search' && (
          <SearchScreen
            query={currentView.query}
            onPlay={handlePlay}
            onOpenChannel={handleOpenChannel}
            onOpenPlaylist={handleOpenPlaylist}
            isSubscribed={isSubscribed}
            onToggleSub={handleToggleSub}
            onBlockChannel={handleBlockChannel}
          />
        )}

        {currentView.type === 'channel' && (
          <ChannelScreen
            channelId={currentView.channelId}
            isSubscribed={isSubscribed}
            onToggleSub={handleToggleSub}
            onPlay={handlePlay}
            onOpenChannel={handleOpenChannel}
            onBlockChannel={handleBlockChannel}
          />
        )}

        {currentView.type === 'player' && (
          <PlayerScreen
            videoId={currentView.videoId}
            playlist={playlist}
            isSubscribed={isSubscribed}
            onToggleSub={handleToggleSub}
            onPlay={handlePlay}
            onOpenChannel={handleOpenChannel}
            onBlockChannel={handleBlockChannel}
            onVideoLoaded={handleVideoLoaded}
            onPlayNext={handlePlayNext}
          />
        )}

        {currentView.type === 'subs' && (
          <SubsScreen
            subs={userData?.subscriptions || []}
            onOpenChannel={handleOpenChannel}
            onToggleSub={handleToggleSub}
          />
        )}

        {currentView.type === 'history' && (
          <HistoryScreen
            history={userData?.history || []}
            onPlay={handlePlay}
            onOpenChannel={handleOpenChannel}
            onBlockChannel={handleBlockChannel}
          />
        )}

        {currentView.type === 'playlist' && (
          <PlaylistScreen
            playlistId={currentView.playlistId}
            onPlay={handlePlay}
            onPlayAll={handlePlayAll}
            onOpenChannel={handleOpenChannel}
            onBlockChannel={handleBlockChannel}
            currentVideoId={currentVideoId}
          />
        )}
      </div>

      <MiniPlayer
        title={currentVideoTitle}
        visible={showMini}
        onRestore={restorePlayer}
        onClose={closeMiniPlayer}
      />

      <BottomNav active={activeTab} onNavigate={navigateTab} />

      <ConfigModal
        visible={configOpen}
        userData={userData}
        onClose={() => { setConfigOpen(false); reload() }}
        onUpdateCategories={updateCategories}
        onBlockKeyword={blockKeyword}
        onUnblockKeyword={unblockKeyword}
        onUnblockChannel={unblockChannel}
        onForceUpdate={forceUpdate}
      />

      <Toast message={message} visible={visible} />
    </>
  )
}
