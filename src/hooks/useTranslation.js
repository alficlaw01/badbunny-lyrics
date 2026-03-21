import { useState, useEffect, useRef } from 'react'

const CACHE_PREFIX = 'translation_'
const DEEPL_API_URL = 'https://api-free.deepl.com/v2/translate'
const BATCH_SIZE = 20 // translate up to 20 lines at once
const BATCH_DELAY_MS = 300 // debounce before sending

export default function useTranslation(lines, deeplApiKey) {
  const [translations, setTranslations] = useState({}) // lineId -> translated text
  const [isTranslating, setIsTranslating] = useState(false)
  const [translationError, setTranslationError] = useState(null) // EDGE 4: surface quota/key errors
  const queueRef = useRef([]) // pending line ids to translate
  const timerRef = useRef(null)
  const inFlightRef = useRef(false)

  useEffect(() => {
    if (!lines.length || !deeplApiKey) return

    // Determine which lines need translation
    const missing = lines.filter(line => {
      if (!line.text?.trim()) return false

      // Check memory cache
      if (translations[line.id]) return false

      // Check localStorage cache
      const cached = getFromCache(line.text)
      if (cached !== null) {
        setTranslations(prev => ({ ...prev, [line.id]: cached }))
        return false
      }

      return true
    })

    if (!missing.length) return

    // Add to queue
    const newIds = missing.map(l => l.id)
    queueRef.current = [...new Set([...queueRef.current, ...newIds])]

    // Debounce batch translation
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      processBatch(lines, deeplApiKey, queueRef, setTranslations, setIsTranslating, setTranslationError, inFlightRef)
    }, BATCH_DELAY_MS)

    return () => clearTimeout(timerRef.current)
  // `translations` is intentionally excluded — including it causes an infinite loop
  // because this effect writes to translations via setTranslations
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, deeplApiKey])

  return { translations, isTranslating, translationError }
}

async function processBatch(lines, apiKey, queueRef, setTranslations, setIsTranslating, setTranslationError, inFlightRef) {
  if (inFlightRef.current || !queueRef.current.length) return

  inFlightRef.current = true
  setIsTranslating(true)

  const batch = queueRef.current.splice(0, BATCH_SIZE)
  const lineMap = new Map(lines.map(l => [l.id, l]))

  const textsToTranslate = batch
    .map(id => lineMap.get(id))
    .filter(Boolean)
    .filter(line => line.text?.trim())

  if (!textsToTranslate.length) {
    inFlightRef.current = false
    setIsTranslating(false)
    return
  }

  try {
    const texts = textsToTranslate.map(l => l.text)
    const result = await translateTexts(texts, apiKey)

    if (result?.error) {
      // EDGE 4: surface quota/auth errors to the UI
      setTranslationError(result.error)
    } else if (result?.translations) {
      setTranslationError(null)
      const updates = {}
      textsToTranslate.forEach((line, i) => {
        if (result.translations[i]) {
          updates[line.id] = result.translations[i]
          saveToCache(line.text, result.translations[i])
        }
      })
      setTranslations(prev => ({ ...prev, ...updates }))
    }
  } catch (err) {
    console.error('Translation error:', err)
  } finally {
    inFlightRef.current = false
    setIsTranslating(false)

    // Process remaining items in queue
    if (queueRef.current.length > 0) {
      setTimeout(() => {
        processBatch(lines, apiKey, queueRef, setTranslations, setIsTranslating, setTranslationError, inFlightRef)
      }, 100)
    }
  }
}

async function translateTexts(texts, apiKey) {
  // SEC 2: use Authorization header — not logged in request body by proxies
  const params = new URLSearchParams({ target_lang: 'EN', source_lang: 'ES' })
  texts.forEach(text => params.append('text', text))

  try {
    const res = await fetch(DEEPL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `DeepL-Auth-Key ${apiKey}`,
      },
      body: params.toString(),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('DeepL error:', res.status, errText)

      // EDGE 4: return structured errors so caller can surface them to the user
      if (res.status === 429) {
        return { error: 'DeepL quota exhausted — translations paused until next month.' }
      }
      if (res.status === 403) {
        return { error: 'Invalid DeepL API key — check Settings.' }
      }
      return { error: `DeepL error ${res.status}` }
    }

    const data = await res.json()
    return { translations: data.translations?.map(t => t.text) || [] }
  } catch (err) {
    console.error('DeepL fetch error:', err)
    return null
  }
}

function getCacheKey(text) {
  // Simple hash to keep cache keys short
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return `${CACHE_PREFIX}${hash}`
}

function getFromCache(text) {
  try {
    const key = getCacheKey(text)
    const item = localStorage.getItem(key)
    if (!item) return null
    const { translation, ts } = JSON.parse(item)
    // Cache for 30 days
    if (Date.now() - ts > 30 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(key)
      return null
    }
    return translation
  } catch {
    return null
  }
}

function saveToCache(text, translation) {
  try {
    const key = getCacheKey(text)
    localStorage.setItem(key, JSON.stringify({ translation, ts: Date.now() }))
  } catch {
    // Storage full — ignore
  }
}
