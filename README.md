# Lyrify 🎵

Every song. Every language. In real time.

Real-time synced lyrics with live English translation for any song on Spotify. Play a song in Spanish, French, Japanese, Korean — Lyrify auto-detects the language and translates word-by-word as it plays. If the song is already in English, it just shows the lyrics with no translation column.

## Features

- **Word-by-word sync** — highlights the exact word being sung in real time
- **Auto language detection** — DeepL detects the source language automatically (30+ languages)
- **Live translation** — DeepL-powered translation displayed alongside the original lyrics
- **Auto-scroll** — keeps the current line centred on screen
- **Focus Mode** — shows only the current + next line in huge text, perfect for concerts
- **Translation cache** — localStorage cache so repeated plays are instant (no API calls)
- **Mobile-friendly** — dark concert-ready UI

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Get a Spotify Client ID

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Set the **Redirect URI** to `http://localhost:5173/callback` (for local dev)
   - For production, use your deployed URL instead
4. Enable **Web API**
5. Copy the **Client ID**

### 3. Get a DeepL API key

1. Sign up at [deepl.com/pro-api](https://www.deepl.com/pro-api) (free tier, no credit card)
2. Find your **Authentication Key** in account settings
3. Free keys end with `:fx`

### 4. Run the app

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173), go to **Settings**, and paste your keys.

### 5. Connect Spotify

Click **Connect Spotify** on the home page, log in, and play any song. The lyrics will sync automatically, with live translation for foreign language songs.

## Deploying to Production

```bash
npm run build
```

The `dist/` folder can be deployed to any static host (Vercel, Netlify, GitHub Pages, etc.).

**Important:** Update your Spotify app's redirect URI to match your production URL before deploying.

## Architecture

```
src/
├── App.jsx                    # Root component, routing, layout, language display
├── index.css                  # Tailwind + custom concert styles
├── main.jsx                   # React entry point
├── components/
│   └── LyricsDisplay.jsx      # Lyrics sync + word highlight + focus mode
├── hooks/
│   ├── useSpotify.js          # OAuth PKCE, playback polling, position interpolation
│   ├── useLyrics.js           # Lyrics fetch + word/line timestamp sync
│   └── useTranslation.js      # DeepL translation with auto language detection + cache
└── pages/
    └── Settings.jsx           # API key configuration UI
```

## How it works

### Playback Tracking
`useSpotify` polls the Spotify `/me/player` endpoint every 1 second to get the current track and playback position. Between polls, it uses `requestAnimationFrame` to interpolate the position smoothly, giving sub-millisecond accuracy for word highlighting.

### Lyrics Sync
`useLyrics` fetches from Spotify's internal `spclient.wg.spotify.com/color-lyrics/v2/track/{id}` endpoint with a spoofed iOS user-agent. Lyrics come back as either:
- `WORD_SYNCED` — each word has a timestamp (ideal)
- `LINE_SYNCED` — only line timestamps; words are interpolated evenly across the line duration

### Translation & Language Detection
`useTranslation` batches lyrics lines and sends them to the DeepL API without specifying a source language, letting DeepL auto-detect it. The detected language is returned in the response and displayed in the UI (e.g. "🇪🇸 Spanish → 🇬🇧 English"). If DeepL detects English as the source, translation stops immediately and the app shows "This song is in English — no translation needed". Translations are cached with a hash key in localStorage (30-day TTL) so the same song never makes duplicate API calls.

## Notes

- Spotify lyrics availability varies by region and song
- The internal lyrics endpoint requires a valid Spotify OAuth token
- DeepL free tier allows 500,000 characters/month (roughly 50,000 song plays)
- DeepL supports 30+ languages including Spanish, French, German, Italian, Portuguese, Japanese, Korean, Chinese, Russian, and more
- All API keys are stored in your browser's localStorage only — nothing is sent to any third-party server except the respective APIs (Spotify and DeepL)
