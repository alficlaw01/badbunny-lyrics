import { useState, useEffect, useRef, useCallback } from 'react'

const SCOPES = [
  'user-read-currently-playing',
  'user-read-playback-state',
].join(' ')

function generateCodeVerifier() {
  const array = new Uint8Array(64)
  crypto.getRandomValues(array)
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function getRedirectUri() {
  return `${window.location.origin}/callback`
}

export default function useSpotify(clientId) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [accessToken, setAccessToken] = useState(null)
  const [currentTrack, setCurrentTrack] = useState(null)
  const [playbackPosition, setPlaybackPosition] = useState(0)
  const [isOffline, setIsOffline] = useState(false)
  const tokenExpiryRef = useRef(null)
  const lastPollTimeRef = useRef(null)
  // Ref updated at 60fps by rAF for smooth lyrics sync — no state, no re-renders
  const playbackPositionRef = useRef(0)
  const failureCountRef = useRef(0)

  // Handle OAuth callback — BUG 3 fix: set tokenExpiryRef after fresh login
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')

    if (code && state) {
      const storedState = sessionStorage.getItem('pkce_state')
      const verifier = sessionStorage.getItem('pkce_verifier')

      if (state !== storedState) {
        console.error('State mismatch - possible CSRF attack')
        return
      }

      exchangeCodeForToken(code, verifier, clientId).then(result => {
        if (result) {
          setAccessToken(result.token)
          setIsAuthenticated(true)
          tokenExpiryRef.current = result.expiry  // BUG 3: set expiry for proactive refresh
          // Clean up URL (CallbackHandler no longer redirects, so we handle it here)
          window.history.replaceState({}, '', '/')
        }
      })
    }
  }, [clientId])

  // Load stored token on mount
  useEffect(() => {
    const stored = localStorage.getItem('spotify_access_token')
    const expiry = localStorage.getItem('spotify_token_expiry')

    if (stored && expiry && Date.now() < parseInt(expiry)) {
      setAccessToken(stored)
      setIsAuthenticated(true)
      tokenExpiryRef.current = parseInt(expiry)
    }
  }, [])

  // Persist token
  useEffect(() => {
    if (accessToken) {
      localStorage.setItem('spotify_access_token', accessToken)
    }
  }, [accessToken])

  // Defined before the polling effect so it can be listed as a dependency
  const logout = useCallback(() => {
    localStorage.removeItem('spotify_access_token')
    localStorage.removeItem('spotify_token_expiry')
    localStorage.removeItem('spotify_refresh_token')
    setAccessToken(null)
    setIsAuthenticated(false)
    setCurrentTrack(null)
    setPlaybackPosition(0)
    playbackPositionRef.current = 0
  }, [])

  // Polling for playback state
  useEffect(() => {
    if (!isAuthenticated || !accessToken) return

    let animFrameId = null
    let lastApiPosition = 0
    let lastApiTime = null
    let isPlaying = false

    async function pollPlayback() {
      // Check token expiry
      if (tokenExpiryRef.current && Date.now() > tokenExpiryRef.current - 60000) {
        const refreshed = await refreshToken(clientId)
        if (refreshed) {
          setAccessToken(refreshed)
        } else {
          logout()
          return
        }
      }

      try {
        const res = await fetch('https://api.spotify.com/v1/me/player', {
          headers: { Authorization: `Bearer ${accessToken}` },
        })

        if (res.status === 204) {
          // No active device
          setCurrentTrack(null)
          setPlaybackPosition(0)
          playbackPositionRef.current = 0
          failureCountRef.current = 0
          setIsOffline(false)
          return
        }

        if (res.status === 401) {
          logout()
          return
        }

        if (!res.ok) return

        const data = await res.json()

        // Reset offline tracking on success
        if (failureCountRef.current > 0) {
          failureCountRef.current = 0
          setIsOffline(false)
        }

        if (!data.item) {
          setCurrentTrack(null)
          return
        }

        const track = data.item
        isPlaying = data.is_playing
        lastApiPosition = data.progress_ms || 0
        lastApiTime = Date.now()

        setCurrentTrack({
          id: track.id,
          name: track.name,
          artist: track.artists.map(a => a.name).join(', '),
          album: track.album?.name || '',
          albumArt: track.album?.images?.[0]?.url || null,
          duration: track.duration_ms,
        })

        // EDGE 1: Only update state at poll rate (1s), not at 60fps
        setPlaybackPosition(lastApiPosition)
        playbackPositionRef.current = lastApiPosition
      } catch (err) {
        console.error('Playback poll error:', err)
        // EDGE 3: Track consecutive failures for offline indicator
        failureCountRef.current++
        if (failureCountRef.current >= 3) {
          setIsOffline(true)
        }
      }
    }

    // EDGE 1: Smooth position interpolation via ref — no setState, no re-renders
    function interpolatePosition() {
      if (lastApiTime && isPlaying) {
        const elapsed = Date.now() - lastApiTime
        playbackPositionRef.current = lastApiPosition + elapsed
      }
      animFrameId = requestAnimationFrame(interpolatePosition)
    }

    pollPlayback()
    const intervalId = setInterval(pollPlayback, 1000)
    animFrameId = requestAnimationFrame(interpolatePosition)

    return () => {
      clearInterval(intervalId)
      if (animFrameId) cancelAnimationFrame(animFrameId)
    }
  }, [isAuthenticated, accessToken, clientId, logout])

  const login = useCallback(async () => {
    if (!clientId) {
      alert('Please set your Spotify Client ID in Settings first.')
      return
    }

    const verifier = generateCodeVerifier()
    const challenge = await generateCodeChallenge(verifier)
    const state = generateCodeVerifier().slice(0, 16)

    sessionStorage.setItem('pkce_verifier', verifier)
    sessionStorage.setItem('pkce_state', state)

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: getRedirectUri(),
      scope: SCOPES,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state,
    })

    window.location.href = `https://accounts.spotify.com/authorize?${params}`
  }, [clientId])

  return {
    isAuthenticated,
    accessToken,
    currentTrack,
    playbackPosition,
    playbackPositionRef,
    isOffline,
    login,
    logout,
  }
}

// BUG 3 fix: return expiry alongside token so caller can set tokenExpiryRef
async function exchangeCodeForToken(code, verifier, clientId) {
  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${window.location.origin}/callback`,
        code_verifier: verifier,
      }),
    })

    if (!res.ok) {
      console.error('Token exchange failed:', await res.text())
      return null
    }

    const data = await res.json()
    const expiry = Date.now() + data.expires_in * 1000

    localStorage.setItem('spotify_access_token', data.access_token)
    localStorage.setItem('spotify_token_expiry', expiry.toString())

    if (data.refresh_token) {
      localStorage.setItem('spotify_refresh_token', data.refresh_token)
    }

    return { token: data.access_token, expiry }
  } catch (err) {
    console.error('Token exchange error:', err)
    return null
  }
}

async function refreshToken(clientId) {
  const refreshToken = localStorage.getItem('spotify_refresh_token')
  if (!refreshToken) return null

  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    })

    if (!res.ok) return null

    const data = await res.json()
    const expiry = Date.now() + data.expires_in * 1000

    localStorage.setItem('spotify_access_token', data.access_token)
    localStorage.setItem('spotify_token_expiry', expiry.toString())

    if (data.refresh_token) {
      localStorage.setItem('spotify_refresh_token', data.refresh_token)
    }

    return data.access_token
  } catch {
    return null
  }
}
