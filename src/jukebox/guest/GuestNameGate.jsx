import { useState } from 'react';
import { setStoredGuestName } from '../../utils/jukeboxGuestName';

const GuestNameGate = ({ onSaved }) => {
  const [name, setName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setStoredGuestName(trimmed);
    onSaved();
  };

  return (
    <div className="jukebox-guest jukebox-guest-gate">
      <form className="jukebox-guest-gate-form" onSubmit={handleSubmit}>
        <h1>Add to the queue</h1>
        <p>Enter a name so people can see who added what.</p>
        <input placeholder="Your name" value={name} maxLength={50} onChange={(e) => setName(e.target.value)} />
        <button type="submit">Continue</button>
      </form>
    </div>
  );
};

export default GuestNameGate;
