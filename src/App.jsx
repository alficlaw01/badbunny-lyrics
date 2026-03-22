import { useState, useEffect, useMemo } from 'react'
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom'
import LyricsDisplay from './components/LyricsDisplay'
import Settings from './pages/Settings'
import useSpotify from './hooks/useSpotify'
import useLyrics from './hooks/useLyrics'
import useTranslation from './hooks/useTranslation'

const LANGUAGE_MAP = {
  AR: { flag: '🇸🇦', name: 'Arabic' },
  BG: { flag: '🇧🇬', name: 'Bulgarian' },
  CS: { flag: '🇨🇿', name: 'Czech' },
  DA: { flag: '🇩🇰', name: 'Danish' },
  DE: { flag: '🇩🇪', name: 'German' },
  EL: { flag: '🇬🇷', name: 'Greek' },
  ES: { flag: '🇪🇸', name: 'Spanish' },
  ET: { flag: '🇪🇪', name: 'Estonian' },
  FI: { flag: '🇫🇮', name: 'Finnish' },
  FR: { flag: '🇫🇷', name: 'French' },
  HU: { flag: '🇭🇺', name: 'Hungarian' },
  ID: { flag: '🇮🇩', name: 'Indonesian' },
  IT: { flag: '🇮🇹', name: 'Italian' },
  JA: { flag: '🇯🇵', name: 'Japanese' },
  KO: { flag: '🇰🇷', name: 'Korean' },
  LT: { flag: '🇱🇹', name: 'Lithuanian' },
  LV: { flag: '🇱🇻', name: 'Latvian' },
  NB: { flag: '🇳🇴', name: 'Norwegian' },
  NL: { flag: '🇳🇱', name: 'Dutch' },
  PL: { flag: '🇵🇱', name: 'Polish' },
  PT: { flag: '🇧🇷', name: 'Portuguese' },
  RO: { flag: '🇷🇴', name: 'Romanian' },
  RU: { flag: '🇷🇺', name: 'Russian' },
  SK: { flag: '🇸🇰', name: 'Slovak' },
  SL: { flag: '🇸🇮', name: 'Slovenian' },
  SV: { flag: '🇸🇪', name: 'Swedish' },
  TR: { flag: '🇹🇷', name: 'Turkish' },
  UK: { flag: '🇺🇦', name: 'Ukrainian' },
  ZH: { flag: '🇨🇳', name: 'Chinese' },
}

function AppContent() {
  const location = useLocation()
  const [focusMode, setFocusMode] = useState(false)

  const spotifyClientId = localStorage.getItem('spotify_client_id') || ''
  const deeplApiKey = localStorage.getItem('deepl_api_key') || ''

  const {
    isAuthenticated,
    currentTrack,
    playbackPosition,
    playbackPositionRef,
    isOffline,
    login,
    logout,
  } = useSpotify(spotifyClientId)

  // EDGE 1: pass ref so useLyrics syncs via its own rAF loop, not 60fps parent re-renders
  const { lines, currentLineIndex, currentWordIndex } = useLyrics(
    currentTrack?.id,
    playbackPositionRef,
    isAuthenticated
  )

  const { translations, isTranslating, translationError, detectedLanguage, isEnglishSong } = useTranslation(lines, deeplApiKey)

  const isSettings = location.pathname === '/settings'

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#0a0a0a]/90 backdrop-blur sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold tracking-tight">🎵 Lyrify</span>
        </div>

        <nav className="flex items-center gap-3">
          {!isSettings && isAuthenticated && (
            <button
              onClick={() => setFocusMode(f => !f)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                focusMode
                  ? 'bg-[#FFE600] text-black'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {focusMode ? '⬛ Full Mode' : '🎯 Focus Mode'}
            </button>
          )}

          {!isSettings && (
            <Link
              to="/settings"
              className="px-3 py-1.5 rounded-full text-sm font-medium bg-white/10 hover:bg-white/20 transition-all"
            >
              ⚙️ Settings
            </Link>
          )}

          {isSettings && (
            <Link
              to="/"
              className="px-3 py-1.5 rounded-full text-sm font-medium bg-white/10 hover:bg-white/20 transition-all"
            >
              ← Back
            </Link>
          )}

          {/* EDGE 3: connectivity indicator */}
          {isOffline && (
            <span className="px-3 py-1.5 rounded-full text-sm font-medium bg-red-500/20 text-red-400 border border-red-500/30">
              ⚠ Connection lost
            </span>
          )}

          {isAuthenticated && !isSettings && (
            <button
              onClick={logout}
              className="px-3 py-1.5 rounded-full text-sm font-medium bg-white/10 hover:bg-white/20 transition-all"
            >
              Sign Out
            </button>
          )}
        </nav>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col">
        <Routes>
          <Route
            path="/"
            element={
              <HomePage
                isAuthenticated={isAuthenticated}
                spotifyClientId={spotifyClientId}
                currentTrack={currentTrack}
                lines={lines}
                currentLineIndex={currentLineIndex}
                currentWordIndex={currentWordIndex}
                translations={translations}
                isTranslating={isTranslating}
                translationError={translationError}
                detectedLanguage={detectedLanguage}
                isEnglishSong={isEnglishSong}
                focusMode={focusMode}
                login={login}
              />
            }
          />
          <Route path="/settings" element={<Settings />} />
          <Route path="/callback" element={<CallbackHandler />} />
        </Routes>
      </main>
    </div>
  )
}

function HomePage({
  isAuthenticated,
  spotifyClientId,
  currentTrack,
  lines,
  currentLineIndex,
  currentWordIndex,
  translations,
  isTranslating,
  translationError,
  detectedLanguage,
  isEnglishSong,
  focusMode,
  login,
}) {
  // BUG 6: compute bar heights once, not on every render (Math.random in render = jumping bars)
  const barHeights = useMemo(
    () => [0, 1, 2, 3, 4].map(() => `${20 + Math.random() * 30}px`),
    []
  )

  if (!spotifyClientId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="text-6xl mb-6">🎵</div>
        <h1 className="text-3xl font-bold mb-3">Setup Required</h1>
        <p className="text-white/60 mb-6 max-w-md">
          Configure your Spotify Client ID and DeepL API key to get started.
        </p>
        <Link
          to="/settings"
          className="px-6 py-3 bg-[#FFE600] text-black font-bold rounded-full hover:bg-yellow-400 transition-all"
        >
          Go to Settings →
        </Link>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="text-8xl mb-6">🌍</div>
        <h1 className="text-4xl font-bold mb-3">Lyrify</h1>
        <p className="text-white/60 mb-2 max-w-md text-lg">
          Every song. Every language. In real time.
        </p>
        <p className="text-white/40 mb-8 max-w-md text-sm">
          Connect Spotify, play any song, and watch the lyrics sync word by word with live translation.
        </p>
        <button
          onClick={login}
          className="px-8 py-4 bg-[#1DB954] text-white font-bold text-lg rounded-full hover:bg-[#1aa34a] transition-all shadow-lg shadow-[#1DB954]/30"
        >
          Connect Spotify
        </button>
      </div>
    )
  }

  if (!currentTrack) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="text-6xl mb-6 animate-pulse">🎧</div>
        <h2 className="text-2xl font-bold mb-3">Waiting for Playback</h2>
        <p className="text-white/50 max-w-md">
          Play any song on Spotify. Lyrics will sync automatically, with translations for foreign language songs.
        </p>
        <div className="mt-8 flex gap-2">
          {barHeights.map((h, i) => (
            <div
              key={i}
              className="w-1 bg-[#1DB954] rounded-full animate-pulse"
              style={{
                height: h,
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Now Playing */}
      {currentTrack && (
        <NowPlaying
          track={currentTrack}
          isTranslating={isTranslating}
          translationError={translationError}
          detectedLanguage={detectedLanguage}
          isEnglishSong={isEnglishSong}
        />
      )}

      {/* Lyrics */}
      <LyricsDisplay
        lines={lines}
        currentLineIndex={currentLineIndex}
        currentWordIndex={currentWordIndex}
        translations={translations}
        focusMode={focusMode}
        isEnglishSong={isEnglishSong}
      />
    </div>
  )
}

function NowPlaying({ track, isTranslating, translationError, detectedLanguage, isEnglishSong }) {
  const langInfo = detectedLanguage ? LANGUAGE_MAP[detectedLanguage] : null

  return (
    <div className="flex flex-col border-b border-white/10 bg-[#111]">
      <div className="flex items-center gap-4 px-4 py-3">
        {track.albumArt && (
          <img
            src={track.albumArt}
            alt={track.album}
            className="w-14 h-14 rounded-md shadow-lg flex-shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="font-bold text-base truncate">{track.name}</div>
          <div className="text-white/50 text-sm truncate">{track.artist}</div>
        </div>

        {/* Language indicator */}
        {isEnglishSong && (
          <div className="text-xs text-white/40 flex-shrink-0 hidden sm:flex items-center gap-1">
            🇬🇧 English
          </div>
        )}
        {!isEnglishSong && detectedLanguage && langInfo && (
          <div className="text-xs text-white/40 flex-shrink-0 hidden sm:flex items-center gap-1">
            {langInfo.flag} {langInfo.name} → 🇬🇧 English
          </div>
        )}

        {isTranslating && (
          <div className="text-xs text-white/30 flex items-center gap-1 flex-shrink-0">
            <span className="w-1.5 h-1.5 bg-[#FFE600] rounded-full animate-pulse" />
            Translating
          </div>
        )}
        <div className="text-xs text-white/20 flex-shrink-0 hidden sm:block">
          🎵 Live Sync
        </div>
      </div>
      {/* EDGE 4: show DeepL quota/auth errors */}
      {translationError && (
        <div className="px-4 pb-2 text-xs text-yellow-400/70">
          ⚠ {translationError}
        </div>
      )}
    </div>
  )
}

// BUG 1: Do NOT use window.location.href here — that causes a full page reload which
// aborts the in-flight token exchange fetch in useSpotify. Instead, use React Router's
// navigate() which is a client-side navigation that keeps the app (and useSpotify) alive.
function CallbackHandler() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')

    if (code && state) {
      // If opened in a popup, send message to parent and close
      if (window.opener) {
        window.opener.postMessage({ type: 'spotify-callback', code, state }, window.location.origin)
        window.close()
        return
      }
    }
    // If not a popup (direct navigation), let useSpotify handle it via URL params
    // Just show connecting state — useSpotify's useEffect will pick up the code
  }, [])

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-white/50">Connecting to Spotify...</div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}
