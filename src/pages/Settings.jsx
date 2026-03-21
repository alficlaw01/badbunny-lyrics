import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

export default function Settings() {
  const [spotifyClientId, setSpotifyClientId] = useState('')
  const [deeplApiKey, setDeeplApiKey] = useState('')
  const [saved, setSaved] = useState(false)
  const [showSpotifyKey, setShowSpotifyKey] = useState(false)
  const [showDeeplKey, setShowDeeplKey] = useState(false)
  const [validationWarning, setValidationWarning] = useState('')

  useEffect(() => {
    setSpotifyClientId(localStorage.getItem('spotify_client_id') || '')
    setDeeplApiKey(localStorage.getItem('deepl_api_key') || '')
  }, [])

  function save() {
    const clientIdTrimmed = spotifyClientId.trim()
    const deeplKeyTrimmed = deeplApiKey.trim()

    // EDGE 5: basic format validation — warn but don't block save
    const warnings = []
    if (clientIdTrimmed && !/^[a-f0-9]{32}$/i.test(clientIdTrimmed)) {
      warnings.push('Spotify Client ID should be 32 hex characters')
    }
    if (deeplKeyTrimmed && !deeplKeyTrimmed.endsWith(':fx') && !deeplKeyTrimmed.includes('-')) {
      warnings.push('DeepL free keys typically end with :fx')
    }
    setValidationWarning(warnings.join(' · '))

    // BUG 2: read OLD value BEFORE overwriting, then compare
    const oldClientId = localStorage.getItem('spotify_client_id') || ''
    if (clientIdTrimmed !== oldClientId) {
      localStorage.removeItem('spotify_access_token')
      localStorage.removeItem('spotify_token_expiry')
      localStorage.removeItem('spotify_refresh_token')
    }

    localStorage.setItem('spotify_client_id', clientIdTrimmed)
    localStorage.setItem('deepl_api_key', deeplKeyTrimmed)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function clearCache() {
    const keys = Object.keys(localStorage).filter(
      k => k.startsWith('lyrics_') || k.startsWith('translation_')
    )
    keys.forEach(k => localStorage.removeItem(k))
    alert(`Cleared ${keys.length} cached items.`)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-2">Settings</h1>
      <p className="text-white/40 mb-8 text-sm">
        All keys are stored locally in your browser. Nothing is sent to any server.
      </p>

      {/* Spotify Section */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-1 flex items-center gap-2">
          <span className="text-[#1DB954]">●</span> Spotify Client ID
        </h2>
        <p className="text-white/50 text-sm mb-4">
          Required for reading your playback state via the Spotify Web API.
        </p>

        <div className="relative mb-3">
          <input
            type={showSpotifyKey ? 'text' : 'password'}
            value={spotifyClientId}
            onChange={e => setSpotifyClientId(e.target.value)}
            placeholder="e.g. a1b2c3d4e5f6..."
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm font-mono text-white placeholder-white/20 focus:outline-none focus:border-[#1DB954] transition-colors pr-16"
          />
          <button
            onClick={() => setShowSpotifyKey(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 text-xs"
          >
            {showSpotifyKey ? 'Hide' : 'Show'}
          </button>
        </div>

        <div className="bg-white/5 rounded-xl p-4 text-sm text-white/60 space-y-2">
          <p className="font-semibold text-white/80">How to get your Spotify Client ID:</p>
          <ol className="list-decimal list-inside space-y-1.5 text-white/50">
            <li>
              Go to{' '}
              <a
                href="https://developer.spotify.com/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#1DB954] underline hover:text-[#1aa34a]"
              >
                developer.spotify.com/dashboard
              </a>
            </li>
            <li>Log in and click <strong className="text-white/70">Create App</strong></li>
            <li>
              Set <strong className="text-white/70">Redirect URI</strong> to:{' '}
              <code className="bg-white/10 px-1 rounded text-xs">
                {window.location.origin}/callback
              </code>
            </li>
            <li>Enable the <strong className="text-white/70">Web API</strong> option</li>
            <li>Copy the <strong className="text-white/70">Client ID</strong> and paste it above</li>
          </ol>
        </div>
      </section>

      {/* DeepL Section */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-1 flex items-center gap-2">
          <span className="text-[#FFE600]">●</span> DeepL API Key
        </h2>
        <p className="text-white/50 text-sm mb-4">
          Used to translate Spanish lyrics to English. Free tier: 500,000 characters/month.
        </p>

        <div className="relative mb-3">
          <input
            type={showDeeplKey ? 'text' : 'password'}
            value={deeplApiKey}
            onChange={e => setDeeplApiKey(e.target.value)}
            placeholder="e.g. xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm font-mono text-white placeholder-white/20 focus:outline-none focus:border-[#FFE600] transition-colors pr-16"
          />
          <button
            onClick={() => setShowDeeplKey(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 text-xs"
          >
            {showDeeplKey ? 'Hide' : 'Show'}
          </button>
        </div>

        <div className="bg-white/5 rounded-xl p-4 text-sm text-white/60 space-y-2">
          <p className="font-semibold text-white/80">How to get your DeepL API key:</p>
          <ol className="list-decimal list-inside space-y-1.5 text-white/50">
            <li>
              Go to{' '}
              <a
                href="https://www.deepl.com/pro-api"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#FFE600] underline hover:text-yellow-400"
              >
                deepl.com/pro-api
              </a>
            </li>
            <li>Sign up for <strong className="text-white/70">DeepL API Free</strong> (no credit card needed)</li>
            <li>
              Go to your account and find the <strong className="text-white/70">Authentication Key</strong>
            </li>
            <li>
              Free keys end with <code className="bg-white/10 px-1 rounded text-xs">:fx</code>
            </li>
            <li>Paste it above</li>
          </ol>
        </div>
      </section>

      {/* Actions */}
      {validationWarning && (
        <div className="mb-4 px-4 py-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-yellow-400/80 text-sm">
          ⚠ {validationWarning}
        </div>
      )}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <button
          onClick={save}
          className={`flex-1 py-3 rounded-xl font-bold text-base transition-all ${
            saved
              ? 'bg-green-500 text-white'
              : 'bg-[#FFE600] text-black hover:bg-yellow-400'
          }`}
        >
          {saved ? '✓ Saved!' : 'Save Settings'}
        </button>

        <Link
          to="/"
          className="flex-1 py-3 rounded-xl font-bold text-base bg-white/10 text-white hover:bg-white/20 transition-all text-center"
        >
          ← Back to App
        </Link>
      </div>

      {/* Cache management */}
      <section className="border-t border-white/10 pt-6">
        <h2 className="text-base font-semibold mb-1 text-white/60">Cache Management</h2>
        <p className="text-white/30 text-xs mb-3">
          Translations are cached locally for instant replay. Clear if you notice stale data.
        </p>
        <button
          onClick={clearCache}
          className="px-4 py-2 rounded-lg text-sm bg-white/5 hover:bg-white/10 text-white/50 hover:text-white/80 transition-all border border-white/10"
        >
          Clear Lyrics & Translation Cache
        </button>
      </section>

      {/* Note about lyrics */}
      <section className="mt-8 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
        <p className="text-yellow-400/80 text-sm font-semibold mb-1">⚠️ Note on Lyrics</p>
        <p className="text-yellow-400/50 text-xs leading-relaxed">
          This app uses Spotify's internal lyrics endpoint which requires a valid Spotify session.
          Lyrics availability depends on your region and Spotify's licensing agreements.
          Some tracks may not have synced lyrics available.
        </p>
      </section>
    </div>
  )
}
