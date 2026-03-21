import { useEffect, useRef, forwardRef } from 'react'

export default function LyricsDisplay({
  lines,
  currentLineIndex,
  currentWordIndex,
  translations,
  focusMode,
}) {
  const containerRef = useRef(null)
  const currentLineRef = useRef(null)

  // Auto-scroll to keep current line centred
  useEffect(() => {
    if (currentLineRef.current && containerRef.current) {
      const container = containerRef.current
      const element = currentLineRef.current

      const containerTop = container.scrollTop
      const containerHeight = container.clientHeight
      const elementTop = element.offsetTop
      const elementHeight = element.clientHeight

      const targetScroll = elementTop - containerHeight / 2 + elementHeight / 2

      container.scrollTo({
        top: Math.max(0, targetScroll),
        behavior: 'smooth',
      })
    }
  }, [currentLineIndex])

  if (!lines.length) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-center">
        <div>
          <div className="text-4xl mb-4">🎵</div>
          <p className="text-white/30 text-sm">
            Lyrics not available for this track
          </p>
          <p className="text-white/20 text-xs mt-2">
            (Spotify lyrics may be limited by region or availability)
          </p>
        </div>
      </div>
    )
  }

  if (focusMode) {
    return (
      <FocusMode
        lines={lines}
        currentLineIndex={currentLineIndex}
        currentWordIndex={currentWordIndex}
        translations={translations}
      />
    )
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-4 py-8"
      style={{ scrollBehavior: 'smooth' }}
    >
      <div className="max-w-5xl mx-auto">
        {lines.map((line, idx) => {
          const isCurrent = idx === currentLineIndex
          const isPast = idx < currentLineIndex
          const isNear = Math.abs(idx - currentLineIndex) <= 2

          return (
            <LyricLine
              key={line.id}
              line={line}
              translation={translations[line.id]}
              isCurrent={isCurrent}
              isPast={isPast}
              isNear={isNear}
              currentWordIndex={isCurrent ? currentWordIndex : -1}
              ref={isCurrent ? currentLineRef : null}
            />
          )
        })}

        {/* Bottom padding so last line can be centred */}
        <div className="h-[40vh]" />
      </div>
    </div>
  )
}

const LyricLine = forwardRef(function LyricLine({ line, translation, isCurrent, isPast, isNear, currentWordIndex }, forwardedRef) {
  const words = line.words || []
  const hasWords = words.length > 0

  let containerClass = 'py-3 transition-all duration-300 border-b border-white/5'

  if (isCurrent) {
    containerClass += ' py-4'
  } else if (isPast) {
    containerClass += ' opacity-30'
  } else if (!isNear) {
    containerClass += ' opacity-50'
  }

  return (
    <div ref={forwardedRef} className={containerClass}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-6 items-start">
        {/* Spanish lyrics */}
        <div className={`font-medium leading-relaxed ${isCurrent ? 'text-xl md:text-2xl' : 'text-base md:text-lg'}`}>
          {hasWords ? (
            <span>
              {words.map((word, wIdx) => {
                const isCurrentWord = isCurrent && wIdx === currentWordIndex
                const isPastWord = isCurrent && wIdx < currentWordIndex

                if (isCurrentWord) {
                  return (
                    <span key={wIdx}>
                      <mark
                        className="bg-[#FFE600] text-black rounded px-0.5 font-bold"
                        style={{ transition: 'none' }}
                      >
                        {word.text}
                      </mark>
                      {' '}
                    </span>
                  )
                }

                if (isPastWord) {
                  return (
                    <span key={wIdx} className="text-white/50">
                      {word.text}{' '}
                    </span>
                  )
                }

                return (
                  <span key={wIdx} className={isCurrent ? 'text-white' : ''}>
                    {word.text}{' '}
                  </span>
                )
              })}
            </span>
          ) : (
            <span className={isCurrent ? 'text-white' : ''}>
              {line.text}
            </span>
          )}
        </div>

        {/* English translation */}
        <div className={`leading-relaxed ${
          isCurrent
            ? 'text-lg md:text-xl text-[#FFE600]/80'
            : 'text-sm md:text-base text-white/40'
        }`}>
          {translation ? (
            translation
          ) : (
            <span className="text-white/20 text-sm italic">
              {isCurrent ? 'Translating...' : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  )
})

// Focus mode: show only current + next line, big
function FocusMode({ lines, currentLineIndex, currentWordIndex, translations }) {
  const currentLine = lines[currentLineIndex]
  const nextLine = lines[currentLineIndex + 1]

  if (!currentLine) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-white/30 text-lg">Waiting for lyrics sync...</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
      {/* Current line — very large */}
      <div className="mb-8">
        <div className="text-3xl md:text-5xl font-bold leading-tight mb-3">
          <WordHighlight
            line={currentLine}
            currentWordIndex={currentWordIndex}
            isCurrent
          />
        </div>
        {translations[currentLine.id] && (
          <div className="text-xl md:text-2xl text-[#FFE600]/70 font-medium">
            {translations[currentLine.id]}
          </div>
        )}
      </div>

      {/* Next line — smaller */}
      {nextLine && (
        <div className="opacity-40">
          <div className="text-xl md:text-3xl font-medium leading-tight mb-2">
            {nextLine.text}
          </div>
          {translations[nextLine.id] && (
            <div className="text-base md:text-xl text-white/50">
              {translations[nextLine.id]}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function WordHighlight({ line, currentWordIndex, isCurrent }) {
  const words = line.words || []

  if (!words.length) {
    return <span>{line.text}</span>
  }

  return (
    <span>
      {words.map((word, wIdx) => {
        const isCurrentWord = isCurrent && wIdx === currentWordIndex
        const isPastWord = isCurrent && wIdx < currentWordIndex

        if (isCurrentWord) {
          return (
            <span key={wIdx}>
              <mark className="bg-[#FFE600] text-black rounded-md px-1 font-bold">
                {word.text}
              </mark>
              {' '}
            </span>
          )
        }

        if (isPastWord) {
          return <span key={wIdx} className="text-white/40">{word.text} </span>
        }

        return <span key={wIdx}>{word.text} </span>
      })}
    </span>
  )
}
