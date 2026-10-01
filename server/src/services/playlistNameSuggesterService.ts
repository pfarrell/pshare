import Anthropic from '@anthropic-ai/sdk'

const OVERALL_TIMEOUT_MS = 10_000
export const MAX_SUGGESTED_NAME_LENGTH = 60

// Em dashes are banned from every user-facing string in this app (house
// style) — the model is told not to use one, but this strips it anyway
// rather than trusting instruction-following for a hard requirement.
const stripEmDash = (s: string) => s.replace(/—/g, '-')

// A lightweight sibling of playlistGeneratorService's full tool-calling
// agent: no library search, just one text completion naming a playlist from
// the tracks already in it. Used by the jukebox "Save Queue as Playlist"
// flow (POST /playlists/suggest-name) to pre-fill a suggested name. Unlike
// generatePlaylist, there's no partial state to fall back on, so a timeout
// or an empty/unusable response both reject — the caller (route) turns
// either into a generic error, and the jukebox UI falls back to a plain
// default name on any failure.
export async function suggestPlaylistName(
  trackDescriptions: string[],
  timeoutMs: number = OVERALL_TIMEOUT_MS,
): Promise<string> {
  const client = new Anthropic()
  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await client.messages.create(
      {
        model: 'claude-sonnet-5-5',
        max_tokens: 30,
        system: `You name music playlists for a personal library called P·Share. Given a list of tracks (as "Artist - Title"), reply with ONLY a short, evocative playlist name, at most ${MAX_SUGGESTED_NAME_LENGTH} characters. No quotation marks, no explanation, no em dash, just the name itself.`,
        messages: [{ role: 'user', content: trackDescriptions.join('\n') }],
      },
      { signal: controller.signal },
    )

    const block = response.content.find((b) => b.type === 'text')
    const name = block && block.type === 'text' ? stripEmDash(block.text.trim()) : ''
    if (!name) throw new Error('Empty playlist name suggestion')
    return name.slice(0, MAX_SUGGESTED_NAME_LENGTH)
  } finally {
    clearTimeout(timeoutHandle)
  }
}
