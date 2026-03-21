const express = require('express')
const cors = require('cors')
const fetch = require('node-fetch')

const app = express()
const PORT = process.env.PORT || 3001

// CORS: allow Vercel deploy and localhost dev
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:4173',
    /https:\/\/.*\.vercel\.app$/,
    'https://badbunny-lyrics.vercel.app',
  ],
}))

// Token cache
let cachedToken = null
let tokenExpiresAt = 0

// Lyrics cache: trackId -> lines array
const lyricsCache = new Map()

async function getWebPlayerToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
  }

  // Include sp_dc cookie if set via env var
  if (process.env.SP_DC) {
    headers['Cookie'] = `sp_dc=${process.env.SP_DC}`
  }

  const res = await fetch(
    'https://open.spotify.com/get_access_token?reason=transport&productType=web_player',
    { headers }
  )

  if (!res.ok) {
    throw new Error(`Token fetch failed: ${res.status}`)
  }

  const data = await res.json()
  if (!data.accessToken) {
    throw new Error('No accessToken in response')
  }

  cachedToken = data.accessToken
  // Spotify returns accessTokenExpirationTimestampMs
  tokenExpiresAt = data.accessTokenExpirationTimestampMs || (Date.now() + 3600_000)

  return cachedToken
}

app.get('/health', (req, res) => {
  res.json({ ok: true })
})

app.get('/lyrics/:trackId', async (req, res) => {
  const { trackId } = req.params

  if (lyricsCache.has(trackId)) {
    return res.json(lyricsCache.get(trackId))
  }

  try {
    const token = await getWebPlayerToken()

    const lyricsRes = await fetch(
      `https://spclient.wg.spotify.com/color-lyrics/v2/track/${trackId}?format=json&vocalRemoval=false`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'App-Platform': 'WebPlayer',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      }
    )

    if (!lyricsRes.ok) {
      if (lyricsRes.status === 404) {
        lyricsCache.set(trackId, null)
        return res.status(404).json({ error: 'No lyrics found' })
      }
      return res.status(lyricsRes.status).json({ error: `Spotify returned ${lyricsRes.status}` })
    }

    const data = await lyricsRes.json()
    lyricsCache.set(trackId, data)
    res.json(data)
  } catch (err) {
    console.error('Proxy error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.listen(PORT, () => {
  console.log(`Lyrics proxy running on port ${PORT}`)
})
