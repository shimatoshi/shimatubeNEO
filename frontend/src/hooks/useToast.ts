import { useState, useCallback, useRef } from 'react'

export function useToast() {
  const [message, setMessage] = useState('')
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<number>(0)

  const toast = useCallback((msg: string, duration = 2000) => {
    setMessage(msg)
    setVisible(true)
    clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setVisible(false), duration)
  }, [])

  return { message, visible, toast }
}
