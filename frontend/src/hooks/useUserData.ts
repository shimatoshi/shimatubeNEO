import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import type { UserData, SubChannel, VideoItem } from '../api/client'

export function useUserData() {
  const [userData, setUserData] = useState<UserData | null>(null)

  const reload = useCallback(async () => {
    try {
      const data = await api.getUserData()
      setUserData(data)
    } catch (e) {
      console.error('Failed to load user data:', e)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  const isSubscribed = useCallback(
    (channelId: string) =>
      userData?.subscriptions.some(s => s.channelId === channelId) ?? false,
    [userData]
  )

  const toggleSub = useCallback(
    async (channel: SubChannel) => {
      const result = await api.toggleSubscribe(channel)
      if (result.subscribed) {
        setUserData(prev =>
          prev ? { ...prev, subscriptions: [...prev.subscriptions, channel] } : prev
        )
      } else {
        setUserData(prev =>
          prev
            ? { ...prev, subscriptions: prev.subscriptions.filter(s => s.channelId !== channel.channelId) }
            : prev
        )
      }
      return result.subscribed
    },
    []
  )

  const updateCategories = useCallback(
    async (cats: string[]) => {
      await api.postUserAction('update_categories', cats)
      setUserData(prev => (prev ? { ...prev, categories: cats } : prev))
    },
    []
  )

  const blockChannel = useCallback(
    async (id: string, name: string) => {
      await api.postUserAction('block_channel', { id, name })
      await reload()
    },
    [reload]
  )

  const unblockChannel = useCallback(
    async (id: string) => {
      await api.postUserAction('unblock_channel', { id })
      await reload()
    },
    [reload]
  )

  const blockKeyword = useCallback(
    async (kw: string) => {
      await api.postUserAction('block_keyword', kw)
      await reload()
    },
    [reload]
  )

  const unblockKeyword = useCallback(
    async (kw: string) => {
      await api.postUserAction('unblock_keyword', kw)
      await reload()
    },
    [reload]
  )

  const addToHistory = useCallback(
    async (video: Partial<VideoItem>) => {
      await api.addHistory(video)
      setUserData(prev => {
        if (!prev) return prev
        const filtered = prev.history.filter(v => v.videoId !== video.videoId)
        return {
          ...prev,
          history: [video as VideoItem, ...filtered].slice(0, 50),
        }
      })
    },
    []
  )

  return {
    userData,
    reload,
    isSubscribed,
    toggleSub,
    updateCategories,
    blockChannel,
    unblockChannel,
    blockKeyword,
    unblockKeyword,
    addToHistory,
  }
}
