# Code Review: Bad Bunny Live Lyrics

**Reviewed:** 2026-03-21
**Stack:** React 18 + Vite + Tailwind, localStorage persistence, Spotify PKCE OAuth, DeepL API

---

## ✅ What's Working Well

- **PKCE OAuth flow** is correctly implemented — code verifier/challenge generation, state param CSRF check, token exchange, and refresh are all sound.
- **Focus Mode** is well-designed for the concert use case — large text, current + next line, centered layout.
- **Three-level lyrics cache** (in-memory ref → localStorage → API) is solid and prevents redundant fetches.
- **Token refresh** logic with 60-second pre-expiry buffer is a good pattern.
- **Translation batching and debounce** (20 lines / 300ms) efficiently handles the full lyrics set without hammering DeepL.
- **No lyrics fallback** (`LyricsDisplay.jsx:33-47`) and **no playback fallback** (`App.jsx:164-185`) are both handled cleanly.
- **Settings UX** is thorough — inline instructions, show/hide toggles, save confirmation, cache clear button, and a warning about lyrics availability.
- **Translation cache with 30-day TTL** means repeated concert plays are instant with zero API cost.
- **README** is complete and accurate.

---

## 🐛 Bugs Found

### BUG 1 — Critical: OAuth callback race condition
**File:** `src/App.jsx:234-246` + `src/hooks/useSpotify.js:57-64`

`CallbackHandler` immediately does `window.location.href = '/'` in `useEffect`, which triggers a full page reload. The token exchange in `useSpotify` is an async fetch call that hasn't completed yet. Modern browsers abort in-flight requests on navigation, so `exchangeCodeForToken` may never finish and the tokens are never written to localStorage. On next load, the user is not authenticated.

`useSpotify` already cleans the URL itself via `window.history.replaceState({}, '', '/')` after the exchange completes. `CallbackHandler` should not redirect at all — it's fighting the auth flow.

```js
// src/App.jsx:234-246 — the redirect races with token exchange
function CallbackHandler() {
  useEffect(() => {
    window.location.href = '/'  // ← aborts the token fetch in useSpotify
  }, [])
  ...
}
```

**Fix:** Remove the redirect from `CallbackHandler`. Let `useSpotify` handle URL cleanup after exchange, or navigate after auth state updates.

---

### BUG 2 — High: Settings save never clears auth on Client ID change
**File:** `src/pages/Settings.jsx:16-27`

The `save()` function sets the new `spotify_client_id` in localStorage on line 17, then on line 20 compares `spotifyClientId.trim()` against `localStorage.getItem('spotify_client_id')` — but it just wrote that value, so they always match. The auth tokens are never cleared when the Client ID changes.

```js
function save() {
  localStorage.setItem('spotify_client_id', spotifyClientId.trim())  // line 17: saves new value
  localStorage.setItem('deepl_api_key', deeplApiKey.trim())
  // line 20: ALWAYS true now — comparison is with the value we just saved
  if (spotifyClientId.trim() !== localStorage.getItem('spotify_client_id')) {
    localStorage.removeItem('spotify_access_token')  // ← never reached
    ...
  }
}
```

**Fix:** Read the old value from localStorage BEFORE overwriting it, then compare.

---

### BUG 3 — Medium: `tokenExpiryRef` never set after fresh login
**File:** `src/hooks/useSpotify.js:70-78` vs `src/hooks/useSpotify.js:96-106`

`tokenExpiryRef.current` is only set when loading a previously stored token (line 76). After a fresh OAuth login, `exchangeCodeForToken` saves the expiry to localStorage (line 243) but never updates `tokenExpiryRef.current`. So the 60-second pre-expiry proactive refresh check at line 98 is gated on `tokenExpiryRef.current` being truthy — it's null for fresh sessions, meaning proactive refresh is disabled. After 1 hour the 401 triggers logout instead.

---

### BUG 4 — Low: `visibleLines` computed but never used
**File:** `src/components/LyricsDisplay.jsx:60-62`

```js
const visibleLines = focusMode     // ← dead code; execution never reaches here in focus mode
  ? lines.slice(...)               //    (early return on line 49-58)
  : lines
```

The non-focus-mode render path at line 71 uses `lines.map`, not `visibleLines.map`. This is dead code — not a runtime bug but a maintenance hazard.

---

### BUG 5 — Low: Multiple unused refs
**File:** `src/hooks/useSpotify.js:36-40`

Three refs are declared but never assigned or read:
- `pollRef` (line 36) — interval cleanup uses local `intervalId` instead
- `lastTrackIdRef` (line 38) — never written or read
- `positionOffsetRef` (line 39) — never written or read

---

### BUG 6 — Low: `Math.random()` called on every render
**File:** `src/App.jsx:178`

```js
height: `${20 + Math.random() * 30}px`,   // new random value every render
```

The "Waiting for Playback" visualizer bars compute random heights inline, so every re-render (triggered by the 60fps rAF loop via `useSpotify`) changes the bar heights constantly. The bars jump around rather than pulsing smoothly. Heights should be computed once with `useMemo` or stored in a `useState` initializer.

---

### BUG 7 — Low: Track change during async lyrics fetch not cancelled
**File:** `src/hooks/useLyrics.js:43-53`

```js
fetchLyrics(trackId).then(fetchedLines => {
  ...
  setLines(fetchedLines)  // no check that trackId is still current
})
```

If the user skips songs quickly, a slow lyrics fetch for the previous song can resolve after the new song has started, briefly flashing the wrong lyrics. Low impact for concert use but worth noting.

---

## ⚠️ Edge Cases Not Handled

### EDGE 1 — `playbackPosition` update rate causes excessive re-renders
`useSpotify.js:154-162` runs `requestAnimationFrame` at 60fps and calls `setPlaybackPosition` 60 times/second when playing. This triggers re-renders of `AppContent` → `useLyrics` effect → `LyricsDisplay` every frame. On a phone this could cause jank, especially in normal mode with 50-100 lines rendered. `useLyrics`'s position sync effect (linear scan through all lyrics) also runs 60 times/second.

The rAF loop also runs (without updates) when paused, wasting battery.

**Suggestion:** Use a ref for position interpolation, expose the interpolated value via a separate rAF-driven hook that only feeds into the lyrics component, keeping parent re-renders at the 1-second API poll rate.

---

### EDGE 2 — Settings changes don't take effect without page reload
**File:** `src/App.jsx:13-14`

```js
const spotifyClientId = localStorage.getItem('spotify_client_id') || ''
const deeplApiKey = localStorage.getItem('deepl_api_key') || ''
```

These are plain reads inside the render function — not state. After saving settings and navigating back to `/`, `AppContent` is the same React instance, and these lines re-run on re-render. But `useSpotify(spotifyClientId)` and `useTranslation(lines, deeplApiKey)` use the values from the most recent render, which should pick up the saved keys... actually on closer inspection, navigating back triggers a re-render so this DOES work — but `useSpotify`'s polling effect depends on `[isAuthenticated, accessToken, clientId]`, and if `clientId` changed, the effect will restart. This is mostly fine, but it depends on a navigation-triggered re-render. No change feedback is given to the user that they need to reconnect Spotify.

---

### EDGE 3 — No connectivity / offline handling
If the user is at a concert with spotty signal:
- Spotify polls fail silently (line 149: `console.error` only)
- Last known track and position remain frozen
- No "offline" indicator is shown

**Suggestion:** After 3 consecutive poll failures, show an indicator like "⚠️ Connection lost."

---

### EDGE 4 — DeepL quota exhausted (429) not retried
**File:** `src/hooks/useTranslation.js:119-127`

Non-OK responses from DeepL are logged and silently dropped. If the 500K monthly quota is hit, translations silently stop working. No user notification.

---

### EDGE 5 — No input validation for API keys
`Settings.jsx` accepts any string for Client ID and DeepL key. A basic format check (e.g., Client ID should be 32 hex chars; DeepL free keys end with `:fx`) would catch typos before the user wonders why nothing works.

---

### EDGE 6 — Lyrics sort order assumed
**File:** `src/hooks/useLyrics.js:64-70`

The line-finding loop uses `break` assuming lyrics are in ascending `startTimeMs` order. If the Spotify API ever returns unsorted lines, the sync breaks silently. Low risk but easy to add a sort guard.

---

## 🔒 Security

### SEC 1 — `User-Agent` header silently stripped by browser
**File:** `src/hooks/useLyrics.js:110`

`User-Agent` is a **forbidden header** in the Fetch API spec. Browsers silently ignore it when set in `fetch()` headers — the request goes out with the real browser UA. The spoofing doesn't work in a web context. The other headers (`App-Platform`, `spotify-app-version`) may still help, but the primary intended spoof doesn't land. If lyrics fetching fails in production, this is likely why.

This is the most important thing to verify in a browser DevTools Network tab — check what `User-Agent` header the actual request sends.

---

### SEC 2 — DeepL API key in POST body (minor)
**File:** `src/hooks/useTranslation.js:103-106`

The key is sent as `auth_key` in the URL-encoded POST body. DeepL also accepts `Authorization: DeepL-Auth-Key <key>` in headers, which is slightly preferable (not logged in request body by proxies). Minor for personal use.

---

### SEC 3 — Spotify internal API usage
Using `spclient.wg.spotify.com` with spoofed client headers is outside Spotify's official API. It works until it doesn't — Spotify can change the endpoint, require different auth, or block it. Not a security concern per se, but a reliability one. The app correctly warns about this in the Settings note and README.

---

### SEC 4 — API keys in localStorage (acceptable for personal use)
Both the Spotify access token and DeepL API key are in `localStorage`, which is readable by any JS on the page. For a self-hosted personal app this is standard and acceptable. The Settings page correctly notes "Nothing is sent to any server."

---

## 💡 Improvements Suggested

1. **Fix the CallbackHandler redirect** — Either remove it entirely (let `useSpotify` handle the URL) or convert `window.location.href` to `useNavigate()` after auth state confirms success. This is the most impactful fix.

2. **Fix the Settings save order** — Capture the old client ID before overwriting, compare, then decide whether to clear tokens.

3. **Throttle position updates** — Instead of `setPlaybackPosition` at 60fps, compute the interpolated position in a ref and only update state once per second (from the API poll). Feed the rAF position into lyrics sync via a ref, not state. This eliminates the 60fps re-render chain.

4. **Fix `tokenExpiryRef` for fresh logins** — After `exchangeCodeForToken` completes, update `tokenExpiryRef.current` with the parsed expiry.

5. **Fix the `Math.random()` bar heights** — Compute once in `useMemo` or module-level constant.

6. **Add connectivity feedback** — A small indicator when Spotify polls are failing.

7. **Verify lyrics endpoint in browser** — Open DevTools Network tab and confirm the `User-Agent` on the spclient request. If it's the browser's real UA, the endpoint may reject it. Consider a Cloudflare Worker or similar thin proxy if needed.

8. **Clean up dead refs** — Remove `pollRef`, `lastTrackIdRef`, `positionOffsetRef`, and the `visibleLines` computation.

---

## Overall Verdict: NEEDS_FIXES

The core UX is solid — Focus Mode, word highlighting, auto-scroll, translation caching, and the PKCE OAuth flow are all well-built. For a personal concert app, most of the rough edges are acceptable.

However, two bugs could prevent the app from working at all:

1. **The OAuth callback race condition** (Bug 1) means login may silently fail on the first try, requiring the user to click "Connect Spotify" a second time. At a concert, this is a real problem.

2. **The Settings save bug** (Bug 2) means changing the Spotify Client ID never takes effect without manually clearing localStorage — a confusing UX dead-end during setup.

Fix those two and you have a concert-ready app. The 60fps re-render issue (Edge 1) is worth addressing for smooth mobile performance, but not blocking.

| Area | Status |
|------|--------|
| Core lyrics sync | ✅ Works |
| Focus Mode | ✅ Works |
| OAuth PKCE flow | ⚠️ Race condition on callback |
| Token refresh | ⚠️ Broken for fresh logins |
| Settings save | 🐛 Client ID change doesn't clear auth |
| Translation | ✅ Works |
| Cache | ✅ Works |
| Mobile UX | ⚠️ 60fps re-renders may cause jank |
| Security | ✅ Acceptable for personal use |
| README | ✅ Complete |
