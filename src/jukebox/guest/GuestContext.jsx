import { createContext, useContext, useMemo } from 'react';
import { useGuestEnqueue } from './useGuestEnqueue';

const GuestContext = createContext(null);

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

export const useGuest = () => useContext(GuestContext);
