import { useEffect, useState } from 'react'
import Lottie from 'lottie-react'
import { unzipSync, strFromU8 } from 'fflate'
import '../styles/LottieIcon.css'

const animationCache = new Map()

const loadDotLottieJson = async (src) => {
  if (animationCache.has(src)) {
    return animationCache.get(src)
  }

  const promise = (async () => {
    const response = await fetch(src)
    const buffer = await response.arrayBuffer()
    const bytes = new Uint8Array(buffer)

    // Check if it's a ZIP archive (.lottie format starts with 'PK' -> 0x50, 0x4b)
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      const files = unzipSync(bytes)
      // Find the first animation JSON inside animations/ or root .json (excluding manifest.json)
      const animEntryKey =
        Object.keys(files).find(
          (k) => k.startsWith('animations/') && k.endsWith('.json')
        ) ||
        Object.keys(files).find(
          (k) => k.endsWith('.json') && !k.endsWith('manifest.json')
        )

      if (animEntryKey) {
        const jsonText = strFromU8(files[animEntryKey])
        return JSON.parse(jsonText)
      }
    }

    // Fallback if file is plain Lottie JSON
    const text = new TextDecoder().decode(bytes)
    return JSON.parse(text)
  })()

  animationCache.set(src, promise)
  return promise
}

// Preload both animations immediately on module load
loadDotLottieJson('/loading.lottie').catch(() => {})
loadDotLottieJson('/logout.lottie').catch(() => {})

export function LottieIcon({
  src,
  size = 24,
  loop = true,
  autoplay = true,
  className = '',
}) {
  const [animationData, setAnimationData] = useState(null)

  useEffect(() => {
    let active = true
    loadDotLottieJson(src)
      .then((data) => {
        if (active) setAnimationData(data)
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [src])

  return (
    <span
      className={`lottie-icon-wrapper ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {animationData && (
        <Lottie
          animationData={animationData}
          loop={loop}
          autoplay={autoplay}
          style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        />
      )}
    </span>
  )
}
