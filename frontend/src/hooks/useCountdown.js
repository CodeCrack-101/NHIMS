import { useState, useEffect, useCallback } from 'react'

export const useCountdown = (initialTargetIso) => {
  const calculateRemainingSeconds = useCallback((targetIso) => {
    if (!targetIso) return 0
    const diff = new Date(targetIso).getTime() - Date.now()
    return Math.max(0, Math.ceil(diff / 1000))
  }, [])

  const [targetIso, setTargetIso] = useState(initialTargetIso)
  const [secondsLeft, setSecondsLeft] = useState(() =>
    calculateRemainingSeconds(initialTargetIso)
  )

  useEffect(() => {
    setSecondsLeft(calculateRemainingSeconds(targetIso))
    if (!targetIso) return

    const timer = setInterval(() => {
      const next = calculateRemainingSeconds(targetIso)
      setSecondsLeft(next)
      if (next <= 0) {
        clearInterval(timer)
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [targetIso, calculateRemainingSeconds])

  const resetTarget = useCallback((newIso) => {
    setTargetIso(newIso)
  }, [])

  const formatted = `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(
    secondsLeft % 60
  ).padStart(2, '0')}`

  return {
    secondsLeft,
    formatted,
    isExpired: secondsLeft <= 0,
    resetTarget,
  }
}
