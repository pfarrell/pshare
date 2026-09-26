// src/stores/authStore.js
import { create } from 'zustand';
import { apiService } from '../services/api';
import { useProfileFilterStore } from './profileFilterStore';
import { useFavoritesStore } from './favoritesStore';

export const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: false,
  isAdmin: false,
  loading: false,
  jukeboxDeviceId: null,
  jukeboxEnqueueToken: null,

  setUser: (user) => {
    set({
      user,
      isAuthenticated: true,
      isAdmin: user?.admin || false
    });
  },

  // Public self-service signup — logs the new user in, mirroring login().
  signup: async (username, password, email = null) => {
    set({ loading: true });
    try {
      const response = await apiService.signup(username, password, email);
      const { user } = response.data;

      if (user.default_profile_id) {
        useProfileFilterStore.getState().setProfile(user.default_profile_id);
      }
      useFavoritesStore.getState().load();

      set({
        user,
        isAuthenticated: true,
        isAdmin: user.admin || false,
        loading: false
      });

      return { success: true, user };
    } catch (error) {
      set({ loading: false });
      return {
        success: false,
        error: error.response?.data?.error || 'Signup failed'
      };
    }
  },

  login: async (username, password) => {
    set({ loading: true });
    try {
      const response = await apiService.login(username, password);
      const { user } = response.data;

      if (user.default_profile_id) {
        useProfileFilterStore.getState().setProfile(user.default_profile_id);
      }
      useFavoritesStore.getState().load();

      set({
        user,
        isAuthenticated: true,
        isAdmin: user.admin || false,
        loading: false
      });

      return { success: true };
    } catch (error) {
      set({ loading: false });
      return {
        success: false,
        error: error.response?.data?.error || 'Login failed'
      };
    }
  },

  logout: async () => {
    try {
      await apiService.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      useProfileFilterStore.getState().clearProfile();
      useFavoritesStore.getState().clear();
      set({
        user: null,
        isAuthenticated: false,
        isAdmin: false
      });
    }
  },

  // Initialize by checking with the backend
  initialize: async () => {
    set({ loading: true });
    try {
      console.log('Initializing auth...');
      const response = await apiService.getMe();
      const { user, jukeboxDeviceId, jukeboxEnqueueToken } = response.data;
      console.log('Auth initialized with user:', user);

      if (user.default_profile_id) {
        useProfileFilterStore.getState().setProfile(user.default_profile_id);
      }
      useFavoritesStore.getState().load();

      set({
        user,
        isAuthenticated: true,
        isAdmin: user.admin || false,
        jukeboxDeviceId: jukeboxDeviceId ?? null,
        jukeboxEnqueueToken: jukeboxEnqueueToken ?? null,
        loading: false
      });
      return true;
    } catch (error) {
      console.log('Auth initialization failed:', error.response?.status, error.response?.data);

      if (error.response?.status === 401) {
        // Actually not authenticated or session expired
        set({
          user: null,
          isAuthenticated: false,
          isAdmin: false,
          loading: false
        });
      } else {
        // Network error or non-401 response (e.g. a 502 while the backend is
        // restarting mid-deploy) — not proof the session is invalid, so
        // don't clear it and make the user look logged out.
        set({ loading: false });
      }
      return false;
    }
  }
}));
