import { createContext, useContext } from 'react';

export const GuestContext = createContext(null);

export const useGuest = () => useContext(GuestContext);
