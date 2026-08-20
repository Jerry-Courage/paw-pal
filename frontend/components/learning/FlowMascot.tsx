'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface FlowMascotProps {
  mood?: 'idle' | 'happy' | 'thinking' | 'celebrating' | 'wave'
  size?: number
  className?: string
}

export default function FlowMascot({ mood = 'idle', size = 120, className }: FlowMascotProps) {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setFrame(f => (f + 1) % 60), 100)
    return () => clearInterval(interval)
  }, [])

  const bobY = Math.sin(frame * 0.15) * 3
  const blink = frame % 25 === 0
  const tailWag = Math.sin(frame * 0.2) * 8

  return (
    <div className={cn('relative select-none', className)} style={{ width: size, height: size + 10 }}>
      <svg viewBox="0 0 120 130" width={size} height={size + 10}>
        {/* Shadow */}
        <ellipse cx="60" cy="125" rx="28" ry="5" fill="rgba(0,0,0,0.2)">
          <animate attributeName="rx" values="28;24;28" dur="1.5s" repeatCount="indefinite" />
        </ellipse>

        <g transform={`translate(0, ${bobY})`}>
          {/* Tail */}
          <path
            d={`M 85 95 Q ${105 + tailWag} 70 ${95 + tailWag} 55 Q ${88 + tailWag} 48 ${80 + tailWag} 55 Q ${75 + tailWag} 65 82 90`}
            fill="#FF8C42"
            stroke="#E67A30"
            strokeWidth="1"
          />
          <path
            d={`M ${92 + tailWag} 58 Q ${88 + tailWag} 52 ${83 + tailWag} 58`}
            fill="white"
            opacity="0.6"
          />

          {/* Body */}
          <ellipse cx="60" cy="98" rx="28" ry="24" fill="#FF8C42" />
          <ellipse cx="60" cy="100" rx="20" ry="16" fill="#FFE4CC" />

          {/* Left Arm */}
          <path
            d={mood === 'wave' ? "M 38 88 Q 25 75 22 65" : "M 38 88 Q 30 95 28 105"}
            fill="none" stroke="#FF8C42" strokeWidth="8" strokeLinecap="round"
          >
            {mood === 'wave' && (
              <animateTransform attributeName="transform" type="rotate" values="0 38 88;-20 38 88;20 38 88;-10 38 88;0 38 88" dur="0.8s" repeatCount="3" />
            )}
          </path>
          {mood !== 'wave' && <circle cx="28" cy="108" r="5" fill="#FF8C42" />}

          {/* Right Arm */}
          <path
            d={mood === 'celebrating' ? "M 82 88 Q 95 75 98 65" : "M 82 88 Q 90 95 92 105"}
            fill="none" stroke="#FF8C42" strokeWidth="8" strokeLinecap="round"
          >
            {mood === 'celebrating' && (
              <animateTransform attributeName="transform" type="rotate" values="0 82 88;15 82 88;-15 82 88;10 82 88;0 82 88" dur="0.5s" repeatCount="indefinite" />
            )}
          </path>
          {mood !== 'celebrating' && <circle cx="92" cy="108" r="5" fill="#FF8C42" />}

          {/* Left Ear */}
          <path d="M 38 52 L 28 22 L 52 42 Z" fill="#FF8C42" stroke="#E67A30" strokeWidth="1" />
          <path d="M 40 48 L 33 28 L 50 44 Z" fill="#FFB88C" />

          {/* Right Ear */}
          <path d="M 82 52 L 92 22 L 68 42 Z" fill="#FF8C42" stroke="#E67A30" strokeWidth="1" />
          <path d="M 80 48 L 87 28 L 70 44 Z" fill="#FFB88C" />

          {/* Head */}
          <ellipse cx="60" cy="62" rx="28" ry="24" fill="#FF8C42" />

          {/* Face mask */}
          <ellipse cx="60" cy="68" rx="18" ry="14" fill="#FFE4CC" />

          {/* Eyes */}
          {blink ? (
            <>
              <line x1="46" y1="58" x2="54" y2="58" stroke="#4A3728" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="66" y1="58" x2="74" y2="58" stroke="#4A3728" strokeWidth="2.5" strokeLinecap="round" />
            </>
          ) : (
            <>
              <ellipse cx="48" cy="56" rx="6" ry="6.5" fill="white" />
              <ellipse cx="72" cy="56" rx="6" ry="6.5" fill="white" />
              <ellipse cx={mood === 'happy' || mood === 'celebrating' ? "50" : "49"} cy="56" rx="3.5" ry="4" fill="#4A3728" />
              <ellipse cx={mood === 'happy' || mood === 'celebrating' ? "74" : "73"} cy="56" rx="3.5" ry="4" fill="#4A3728" />
              <circle cx="50" cy="54" r="1.5" fill="white" />
              <circle cx="74" cy="54" r="1.5" fill="white" />
            </>
          )}

          {/* Cheek blush */}
          {(mood === 'happy' || mood === 'celebrating') && (
            <>
              <ellipse cx="36" cy="65" rx="5" ry="3" fill="#FF6B6B" opacity="0.3" />
              <ellipse cx="84" cy="65" rx="5" ry="3" fill="#FF6B6B" opacity="0.3" />
            </>
          )}

          {/* Nose */}
          <ellipse cx="60" cy="65" rx="3" ry="2.5" fill="#4A3728" />

          {/* Mouth */}
          {mood === 'happy' || mood === 'celebrating' ? (
            <path d="M 54 70 Q 60 77 66 70" fill="none" stroke="#4A3728" strokeWidth="1.5" strokeLinecap="round" />
          ) : mood === 'thinking' ? (
            <ellipse cx="62" cy="72" rx="3" ry="2.5" fill="#4A3728" opacity="0.6" />
          ) : (
            <path d="M 55 71 Q 60 74 65 71" fill="none" stroke="#4A3728" strokeWidth="1.5" strokeLinecap="round" />
          )}

          {/* Thinking bubble */}
          {mood === 'thinking' && (
            <g opacity="0.7">
              <circle cx="98" cy="42" r="3" fill="white" />
              <circle cx="105" cy="32" r="5" fill="white" />
              <circle cx="112" cy="20" r="8" fill="white" />
              <text x="110" y="24" textAnchor="middle" fontSize="10" fill="#FF8C42">?</text>
            </g>
          )}

          {/* Celebration stars */}
          {mood === 'celebrating' && (
            <g>
              <text x="15" y="35" fontSize="14" fill="#FFD700">
                <animate attributeName="y" values="35;25;35" dur="0.6s" repeatCount="indefinite" />
                ★
              </text>
              <text x="100" y="30" fontSize="12" fill="#FF8C42">
                <animate attributeName="y" values="30;20;30" dur="0.5s" repeatCount="indefinite" />
                ★
              </text>
              <text x="55" y="18" fontSize="10" fill="#FFD700">
                <animate attributeName="y" values="18;10;18" dur="0.7s" repeatCount="indefinite" />
                ✦
              </text>
            </g>
          )}

          {/* Feet */}
          <ellipse cx="48" cy="120" rx="8" ry="4" fill="#E67A30" />
          <ellipse cx="72" cy="120" rx="8" ry="4" fill="#E67A30" />
        </g>
      </svg>
    </div>
  )
}
