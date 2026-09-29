// Loading / error / not-found block shared by every guest page. Returns null
// when there is nothing to show, so pages can render it unconditionally.
const GuestStatus = ({ loading, error, notFound, onRetry, notFoundMessage = 'Not found.' }) => {
  if (loading) return <div className="jukebox-guest-message">Loading...</div>;
  if (notFound) return <div className="jukebox-guest-message">{notFoundMessage}</div>;
  if (error) {
    return (
      <div className="jukebox-guest-message">
        <p>Something went wrong.</p>
        <button type="button" onClick={onRetry}>Try again</button>
      </div>
    );
  }
  return null;
};

export default GuestStatus;
