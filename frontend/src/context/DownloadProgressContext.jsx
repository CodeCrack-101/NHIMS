import { createContext, useContext, useState, useCallback, useRef } from 'react'
import '../styles/DownloadProgress.css'

const DownloadProgressContext = createContext(null)

export function DownloadProgressProvider({ children }) {
  // Map of buttonId -> { progress: number, isDownloading: boolean }
  const [downloads, setDownloads] = useState({})
  const intervalMapRef = useRef({})

  /**
   * Run a task with progress tracked on a specific buttonId
   * @param {string} id Unique button identifier (e.g. 'export-all-users', 'inv-pdf-123')
   * @param {() => Promise<any>} taskFunction
   */
  const trackDownload = useCallback(async (id, taskFunction) => {
    if (!id) return taskFunction()

    if (intervalMapRef.current[id]) {
      clearInterval(intervalMapRef.current[id])
    }

    setDownloads((prev) => ({
      ...prev,
      [id]: { progress: 18, isDownloading: true },
    }))

    let current = 18
    intervalMapRef.current[id] = setInterval(() => {
      current += Math.floor(Math.random() * 14) + 8
      if (current > 88) {
        current = 88
        clearInterval(intervalMapRef.current[id])
      }
      setDownloads((prev) => ({
        ...prev,
        [id]: { progress: current, isDownloading: true },
      }))
    }, 110)

    try {
      const result = await taskFunction()
      if (intervalMapRef.current[id]) {
        clearInterval(intervalMapRef.current[id])
      }

      setDownloads((prev) => ({
        ...prev,
        [id]: { progress: 100, isDownloading: true },
      }))

      setTimeout(() => {
        setDownloads((prev) => {
          const next = { ...prev }
          delete next[id]
          return next
        })
      }, 1000)

      return result
    } catch (err) {
      if (intervalMapRef.current[id]) {
        clearInterval(intervalMapRef.current[id])
      }
      setDownloads((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      throw err
    }
  }, [])

  const getDownloadState = useCallback(
    (id) => {
      return downloads[id] || { progress: 0, isDownloading: false }
    },
    [downloads]
  )

  return (
    <DownloadProgressContext.Provider value={{ trackDownload, getDownloadState }}>
      {children}
    </DownloadProgressContext.Provider>
  )
}

export function useDownloadProgress() {
  const context = useContext(DownloadProgressContext)
  if (!context) {
    throw new Error('useDownloadProgress must be used within a DownloadProgressProvider')
  }
  return context
}

/**
 * Reusable ProgressButton that renders a progress bar inside the button itself
 */
export function ProgressButton({
  id,
  children,
  onClick,
  className = '',
  disabled = false,
  loadingText,
  ...props
}) {
  const { getDownloadState } = useDownloadProgress()
  const { progress, isDownloading } = getDownloadState(id)

  return (
    <button
      {...props}
      className={`btn-progress-container ${className}`}
      disabled={disabled || isDownloading}
      onClick={onClick}
    >
      {isDownloading && (
        <span
          className={`btn-progress-fill ${progress === 100 ? 'complete' : ''}`}
          style={{ width: `${progress}%` }}
        />
      )}
      <span className="btn-progress-label">
        {isDownloading
          ? progress === 100
            ? '✓ Downloaded'
            : loadingText
            ? `${loadingText} ${progress}%`
            : `Downloading ${progress}%`
          : children}
      </span>
    </button>
  )
}
