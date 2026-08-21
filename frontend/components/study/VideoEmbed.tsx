'use client'

import { useState, useRef, useCallback } from 'react'

interface VideoEmbedProps {
  videoId: string
  title: string
  thumbnail?: string
}

export default function VideoEmbed({ videoId, title, thumbnail }: VideoEmbedProps) {
  const [loaded, setLoaded] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const thumbUrl = thumbnail || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`

  const handlePlay = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setLoaded(true)
  }, [])

  if (loaded) {
    return (
      <div ref={containerRef} className="relative rounded-[1rem] overflow-hidden border border-outline-variant/20 bg-black aspect-video">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&autoplay=1&playsinline=1&enablejsapi=1&iv_load_policy=3&fs=0`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-full"
          style={{ pointerEvents: 'auto' }}
        />
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative rounded-[1rem] overflow-hidden border border-outline-variant/20 bg-black">
      <div className="aspect-video relative">
        <img
          src={thumbUrl}
          alt={title}
          className="w-full h-full object-cover"
          loading="lazy"
          draggable={false}
        />
        <button
          onMouseDown={handlePlay}
          onTouchStart={handlePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/30 active:bg-black/50 z-10"
          style={{ WebkitTapHighlightColor: 'transparent' }}
          aria-label={`Play ${title}`}
        >
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-red-600 flex items-center justify-center shadow-lg active:scale-95 transition-transform">
            <span className="text-white text-2xl sm:text-3xl ml-1">▶</span>
          </div>
        </button>
      </div>
    </div>
  )
}
