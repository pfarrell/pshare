import { useState } from 'react';
import { apiService } from '../services/api';
import Track from '../components/Track';
import { useQueueActions } from '../hooks/useQueueActions';
import { useTouchScroll } from './useTouchScroll';

const DEFAULT_SIZE = 20;

// The 'aimix' destination inside the drawer (reached via JukeboxDrawerMenu),
// mounted only while activeDestination === 'aimix' by JukeboxBrowsePanel —
// same lifecycle as JukeboxNextUpTab/JukeboxSettingsTab (unmounts on switch
// away; unlike Search there's no query worth preserving hidden-but-mounted).
// See docs/superpowers/specs/2026-09-27-ai-playlist-generator-design.md.
// onGeneratingChange(bool) reports an in-flight generation up to JukeboxApp,
// whose drawer idle-close timer must not fire mid-generation (a real run can
// take up to 45s with nobody touching the screen, and closing the drawer
// unmounts this tab and discards the already-billed result).
const JukeboxAiMixTab = ({ onBack, onEnqueue, onGeneratingChange }) => {
  const [prompt, setPrompt] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  // Set instead of `error` on a 429: retrying within the same rate-limit
  // window is guaranteed to fail again, so this state shows the server's
  // message with no Retry button.
  const [rateLimitMessage, setRateLimitMessage] = useState(null);
  const [generating, setGenerating] = useState(false);
  const bodyRef = useTouchScroll({ axis: 'y' });

  const generate = () => {
    if (!prompt.trim() || generating) return;
    setError(false);
    setRateLimitMessage(null);
    setGenerating(true);
    onGeneratingChange?.(true);
    apiService.generatePlaylist(prompt.trim(), DEFAULT_SIZE)
      .then((response) => setData(response.data))
      .catch((err) => {
        if (err?.response?.status === 429) {
          setRateLimitMessage(err.response?.data?.error ?? 'Limit reached — try again later.');
        } else {
          setError(true);
        }
      })
      .finally(() => {
        setGenerating(false);
        onGeneratingChange?.(false);
      });
  };

  const queue = useQueueActions(data?.tracks ?? [], {
    queueSource: { type: 'ai-mix', id: prompt.trim() },
    errorLabel: 'Failed to queue AI Mix',
  });

  const ready = data !== null && data.tracks.length > 0;

  return (
    <div className="jukebox-ai-mix-tab">
      {onBack && (
        <button type="button" className="jukebox-ai-mix-back" onClick={onBack}>‹ Next Up</button>
      )}
      <div className="jukebox-ai-mix-prompt-row">
        <textarea
          className="jukebox-ai-mix-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe what you want to hear…"
          rows={2}
        />
        <button type="button" disabled={!prompt.trim() || generating} onClick={generate}>
          {generating ? 'Generating…' : 'Generate'}
        </button>
      </div>

      {generating && (
        <div className="jukebox-ai-mix-loading" role="status" aria-live="polite">
          <span className="jukebox-ai-mix-spinner" data-testid="jukebox-ai-mix-spinner" aria-hidden="true" />
          <span>This can take up to a minute…</span>
        </div>
      )}

      {error && (
        <div className="jukebox-panel-error">
          <p>Couldn't generate right now.</p>
          <button onClick={generate}>Retry</button>
        </div>
      )}

      {rateLimitMessage && (
        <div className="jukebox-panel-error">
          <p>{rateLimitMessage}</p>
        </div>
      )}

      {!error && !rateLimitMessage && data !== null && data.tracks.length === 0 && (
        <p className="jukebox-ai-mix-empty">Couldn't find anything matching that — try rephrasing.</p>
      )}

      {!error && !rateLimitMessage && ready && (
        <>
          <div className="jukebox-tracks-panel-actions">
            <button type="button" onClick={() => { queue.play(); onEnqueue?.(); }}>Play mix</button>
            <button type="button" onClick={() => { queue.addToQueue(); onEnqueue?.(); }}>Add to queue</button>
          </div>
          {data.tracks.length < DEFAULT_SIZE && (
            <p className="jukebox-ai-mix-partial">Found {data.tracks.length} of {DEFAULT_SIZE}.</p>
          )}
          <div className="jukebox-ai-mix-body" ref={bodyRef}>
            <div className="jukebox-search-tracks" onClick={() => onEnqueue?.()}>
              {data.tracks.map((track, index) => (
                <Track key={track.id} track={track} index={index} trackCount={data.tracks.length} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default JukeboxAiMixTab;
