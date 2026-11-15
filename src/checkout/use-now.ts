'use client'

import { useEffect, useState } from 'react'

/** The current time in milliseconds, refreshed every second while `isActive`. */
export function useNow(isActive: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!isActive) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [isActive])
  return now
}
