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
const JukeboxAiMixTab = ({ onEnqueue }) => {
  const [prompt, setPrompt] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [generating, setGenerating] = useState(false);
  const bodyRef = useTouchScroll({ axis: 'y' });

  const generate = () => {
    if (!prompt.trim() || generating) return;
    setError(false);
    setGenerating(true);
    apiService.generatePlaylist(prompt.trim(), DEFAULT_SIZE)
      .then((response) => setData(response.data))
      .catch(() => setError(true))
      .finally(() => setGenerating(false));
  };

  const queue = useQueueActions(data?.tracks ?? [], {
    queueSource: { type: 'ai-mix', id: prompt.trim() },
    errorLabel: 'Failed to queue AI Mix',
  });

  const ready = data !== null && data.tracks.length > 0;

  return (
    <div className="jukebox-ai-mix-tab">
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

      {error && (
        <div className="jukebox-panel-error">
          <p>Couldn't generate right now.</p>
          <button onClick={generate}>Retry</button>
        </div>
      )}

      {!error && data !== null && data.tracks.length === 0 && (
        <p className="jukebox-ai-mix-empty">Couldn't find anything matching that — try rephrasing.</p>
      )}

      {!error && ready && (
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
