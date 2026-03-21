# Bad Bunny Live Lyrics 🎵

Real-time synced Spanish lyrics with English translation for Bad Bunny songs on Spotify. Designed to be used at concerts on your phone.

## Features

- **Word-by-word sync** — highlights the exact word being sung in real time
- **English translation** — DeepL-powered translation displayed alongside the Spanish lyrics
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

Click **Connect Spotify** on the home page, log in, and play a Bad Bunny song. The lyrics will sync automatically.

## Deploying to Production

```bash
npm run build
```

The `dist/` folder can be deployed to any static host (Vercel, Netlify, GitHub Pages, etc.).

**Important:** Update your Spotify app's redirect URI to match your production URL before deploying.

## Architecture

```
src/
├── App.jsx                    # Root component, routing, layout
├── index.css                  # Tailwind + custom concert styles
├── main.jsx                   # React entry point
├── components/
│   └── LyricsDisplay.jsx      # Lyrics sync + word highlight + focus mode
├── hooks/
│   ├── useSpotify.js          # OAuth PKCE, playback polling, position interpolation
│   ├── useLyrics.js           # Lyrics fetch + word/line timestamp sync
│   └── useTranslation.js      # DeepL translation with localStorage cache
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

### Translation
`useTranslation` batches lyrics lines and sends them to the DeepL API. Translations are cached with a hash key in localStorage (30-day TTL) so the same song never makes duplicate API calls.

## Notes

- Spotify lyrics availability varies by region and song
- The internal lyrics endpoint requires a valid Spotify OAuth token
- DeepL free tier allows 500,000 characters/month (roughly 50,000 song plays)
- All API keys are stored in your browser's localStorage only — nothing is sent to any third-party server except the respective APIs (Spotify and DeepL)
