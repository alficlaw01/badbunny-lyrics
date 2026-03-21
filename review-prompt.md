# Code Review Instructions

You are a senior code reviewer. Review the Bad Bunny Lyrics app in this directory thoroughly.

Check for:
1. **Bugs** — logic errors, off-by-one issues, race conditions in the polling loop
2. **Security** — API keys never hardcoded, no XSS vectors, Spotify token handled safely
3. **Edge cases** — what if song has no lyrics? No translation available? Spotify not playing? Token expired?
4. **Performance** — polling every 500ms efficiently? No memory leaks? localStorage cache working?
5. **Mobile UX** — does the concert use case actually work on a phone screen?
6. **Completeness** — all components built? Settings page complete? README clear?

Output a structured report to REVIEW.md in this directory with:
- ✅ What's working well
- 🐛 Bugs found (with file + line references)
- ⚠️ Edge cases not handled
- 🔒 Security concerns
- 💡 Improvements suggested
- Overall verdict: PASS / NEEDS_FIXES

Be thorough but pragmatic — this is for personal use at a concert, not a bank.

When done, run: openclaw system event --text "Done: Code review complete - check REVIEW.md" --mode now
