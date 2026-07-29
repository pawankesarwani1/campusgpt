import { create } from 'zustand';
import { loginAPI, registerAPI, getMeAPI, updateProfileAPI } from '../api/auth';

const useAuthStore = create((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  loading: false,
  error: null,

  // Load tokens and user from localStorage on app mount
  loadFromStorage: async () => {
    const accessToken = localStorage.getItem('access_token');
    const refreshToken = localStorage.getItem('refresh_token');
    const storedUser = localStorage.getItem('user');

    if (accessToken) {
      set({ accessToken, refreshToken, isAuthenticated: true });

      if (storedUser) {
        try {
          set({ user: JSON.parse(storedUser) });
        } catch { /* ignore parse errors */ }
      }

      // Fetch fresh user data
      try {
        const user = await getMeAPI();
        localStorage.setItem('user', JSON.stringify(user));
        set({ user });
      } catch {
        // Token might be expired — interceptor handles refresh
      }
    }
  },

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const tokens = await loginAPI(email, password);
      localStorage.setItem('access_token', tokens.access_token);
      localStorage.setItem('refresh_token', tokens.refresh_token);

      const user = await getMeAPI();
      localStorage.setItem('user', JSON.stringify(user));

      set({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        user,
        isAuthenticated: true,
        loading: false,
      });
      return { success: true };
    } catch (err) {
      const msg = err.response?.data?.detail || 'Login failed';
      set({ loading: false, error: msg });
      return { success: false, error: msg };
    }
  },

  register: async (data) => {
    set({ loading: true, error: null });
    try {
      const tokens = await registerAPI(data);
      localStorage.setItem('access_token', tokens.access_token);
      localStorage.setItem('refresh_token', tokens.refresh_token);

      const user = await getMeAPI();
      localStorage.setItem('user', JSON.stringify(user));

      set({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        user,
        isAuthenticated: true,
        loading: false,
      });
      return { success: true };
    } catch (err) {
      const msg = err.response?.data?.detail || 'Registration failed';
      set({ loading: false, error: msg });
      return { success: false, error: msg };
    }
  },

  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      error: null,
    });
  },

  updateProfile: async (data) => {
    try {
      const updatedUser = await updateProfileAPI(data);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      set({ user: updatedUser });
      return { success: true };
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to update profile';
      return { success: false, error: msg };
    }
  },

  clearError: () => set({ error: null }),
}));

export default useAuthStore;
