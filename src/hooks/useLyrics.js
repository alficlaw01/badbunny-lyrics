import { useState, useEffect, useRef } from 'react'

// Lyrics proxy server URL — bypasses 403s from spclient.wg.spotify.com in browsers
const LYRICS_PROXY_BASE = import.meta.env.VITE_LYRICS_PROXY_URL || 'http://localhost:3001'

// EDGE 1: accepts playbackPositionRef (a ref) instead of a playbackPosition value
// so lyrics sync runs via its own rAF loop without triggering parent re-renders at 60fps
export default function useLyrics(trackId, playbackPositionRef, isAuthenticated) {
  const [lines, setLines] = useState([])
  const [currentLineIndex, setCurrentLineIndex] = useState(-1)
  const [currentWordIndex, setCurrentWordIndex] = useState(-1)
  const cacheRef = useRef({}) // in-memory cache keyed by trackId
  const lastTrackRef = useRef(null)

  // Fetch lyrics when track changes
  useEffect(() => {
    if (!trackId || !isAuthenticated) {
      setLines([])
      setCurrentLineIndex(-1)
      setCurrentWordIndex(-1)
      return
    }

    if (lastTrackRef.current === trackId) return
    lastTrackRef.current = trackId

    // Check in-memory cache first
    if (cacheRef.current[trackId]) {
      setLines(cacheRef.current[trackId])
      return
    }

    // Check localStorage cache
    try {
      const cached = localStorage.getItem(`lyrics_${trackId}`)
      if (cached) {
        const parsed = JSON.parse(cached)
        cacheRef.current[trackId] = parsed
        setLines(parsed)
        return
      }
    } catch {}

    // BUG 7: capture trackId at fetch time to detect stale responses
    const fetchingTrackId = trackId
    fetchLyrics(fetchingTrackId).then(fetchedLines => {
      // Skip if the user has already changed tracks
      if (lastTrackRef.current !== fetchingTrackId) return

      if (fetchedLines && fetchedLines.length > 0) {
        cacheRef.current[fetchingTrackId] = fetchedLines
        try {
          localStorage.setItem(`lyrics_${fetchingTrackId}`, JSON.stringify(fetchedLines))
        } catch {}
        setLines(fetchedLines)
      } else {
        setLines([])
      }
    })
  }, [trackId, isAuthenticated])

  // EDGE 1: rAF-driven sync reads from ref — only setState when line/word actually changes,
  // so re-renders are ~3-5/s (word changes) rather than 60/s
  useEffect(() => {
    if (!lines.length) return

    let animId

    function sync() {
      const posMs = playbackPositionRef.current

      // Find current line
      let lineIdx = -1
      for (let i = 0; i < lines.length; i++) {
        if (posMs >= lines[i].startTimeMs) {
          lineIdx = i
        } else {
          break
        }
      }

      // Bail out if unchanged — avoids re-render
      setCurrentLineIndex(prev => prev !== lineIdx ? lineIdx : prev)

      // Find current word within line
      if (lineIdx >= 0) {
        const line = lines[lineIdx]
        if (line.words && line.words.length > 0) {
          let wordIdx = -1
          for (let w = 0; w < line.words.length; w++) {
            if (posMs >= line.words[w].startTimeMs) {
              wordIdx = w
            } else {
              break
            }
          }
          setCurrentWordIndex(prev => prev !== wordIdx ? wordIdx : prev)
        } else {
          // No word timestamps — highlight whole line
          setCurrentWordIndex(prev => prev !== -1 ? -1 : prev)
        }
      } else {
        setCurrentWordIndex(prev => prev !== -1 ? -1 : prev)
      }

      animId = requestAnimationFrame(sync)
    }

    animId = requestAnimationFrame(sync)
    return () => cancelAnimationFrame(animId)
  }, [lines, playbackPositionRef])

  return { lines, currentLineIndex, currentWordIndex }
}

async function fetchLyrics(trackId) {
  try {
    const res = await fetch(`${LYRICS_PROXY_BASE}/lyrics/${trackId}`)

    if (!res.ok) {
      console.warn('Lyrics fetch failed:', res.status)
      return []
    }

    const data = await res.json()
    return parseLyricsResponse(data)
  } catch (err) {
    console.error('Lyrics fetch error:', err)
    return []
  }
}

function parseLyricsResponse(data) {
  if (!data?.lyrics?.lines) return []

  const rawLines = data.lyrics.lines
  const syncType = data.lyrics.syncType // 'LINE_SYNCED' or 'WORD_SYNCED'

  const parsed = rawLines
    .filter(line => line.words?.trim() || line.syllables)
    .map((line, lineIdx) => {
      const startTimeMs = parseInt(line.startTimeMs || 0)

      // Handle word-level timing (WORD_SYNCED)
      let words = []
      if (syncType === 'WORD_SYNCED' && line.syllables) {
        // Syllables array has word-level timing
        words = buildWordsFromSyllables(line.syllables, line.words || '')
      } else if (line.words) {
        // LINE_SYNCED: interpolate word timing across the line
        const nextLine = rawLines[lineIdx + 1]
        const lineEndMs = nextLine ? parseInt(nextLine.startTimeMs) : startTimeMs + 5000
        words = interpolateWordTimings(line.words, startTimeMs, lineEndMs)
      }

      return {
        id: `line_${lineIdx}`,
        text: line.words || line.syllables?.map(s => s.word).join('') || '',
        startTimeMs,
        words,
      }
    })

  // EDGE 6: guard against unsorted lyrics from the API
  return parsed.sort((a, b) => a.startTimeMs - b.startTimeMs)
}

function buildWordsFromSyllables(syllables, lineText) {
  if (!syllables?.length) return []

  return syllables.map(syllable => ({
    text: syllable.word || syllable.value || '',
    startTimeMs: parseInt(syllable.startTimeMs || 0),
  }))
}

function interpolateWordTimings(lineText, startMs, endMs) {
  const rawWords = lineText.trim().split(/\s+/).filter(Boolean)
  if (!rawWords.length) return []

  const duration = endMs - startMs
  const wordDuration = duration / rawWords.length

  return rawWords.map((word, i) => ({
    text: word,
    startTimeMs: Math.round(startMs + i * wordDuration),
  }))
}
