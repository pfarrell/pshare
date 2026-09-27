// A brief, generic confirmation shown over Now Playing whenever something is
// enqueued — see JukeboxApp.jsx's handleEnqueue, which owns the message and
// its auto-dismiss timer. This component only renders whatever it's given.
const JukeboxToast = ({ message }) => {
  if (!message) return null;

  return (
    <div className="jukebox-toast" role="status" aria-live="polite">
      {message}
    </div>
  );
};

export default JukeboxToast;
