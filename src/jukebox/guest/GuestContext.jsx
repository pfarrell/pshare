import { useMemo } from 'react';
import { useGuestEnqueue } from './useGuestEnqueue';
import { GuestContext } from './useGuest';

export const GuestProvider = ({ token, children }) => {
  const { enqueue, statusFor } = useGuestEnqueue(token);
  const value = useMemo(() => ({
    token,
    path: (sub = '') => (sub ? `/jukebox/${token}/${sub}` : `/jukebox/${token}`),
    enqueue,
    statusFor,
  }), [token, enqueue, statusFor]);
  return <GuestContext.Provider value={value}>{children}</GuestContext.Provider>;
};
