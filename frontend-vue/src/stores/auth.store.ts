import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useRequestHeaders } from '#app';

export interface Branding {
  commercialName: string;
  logoUrl?: string;
  primaryColor?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  companyId: string;
  roles: string[];
  permissions: string[];
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const branding = ref<Branding | null>(null);
  const isAuthenticated = ref(false);
  const isInitialized = ref(false);

  const API_BASE = '/api';

  function getSubdomain() {
    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      const parts = host.split('.');
      if (parts.length >= 2 && parts[0] !== 'www' && parts[0] !== 'localhost') {
        return parts[0];
      }
    } else {
      // Server-side: extract subdomain from request host header
      const headers = useRequestHeaders(['host']);
      const host = headers.host || '';
      const parts = host.split('.');
      if (parts.length >= 2 && parts[0] !== 'www' && parts[0] !== 'localhost') {
        return parts[0];
      }
    }
    return 'odiseo';
  }

  async function fetchBranding(subdomainParam?: string) {
    const subdomain = subdomainParam || getSubdomain();
    try {
      const data = await $fetch<Branding>(`${API_BASE}/v1/tenants/branding?subdomain=${subdomain}`);
      branding.value = data;
    } catch (error) {
      console.error('Failed to fetch branding', error);
    }
  }

  async function login(credentials: any, subdomainParam?: string) {
    const subdomain = subdomainParam || getSubdomain();
    try {
      const response = await $fetch<{ user: User }>(`${API_BASE}/v1/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-subdomain': subdomain,
        },
        body: { ...credentials, subdomain },
      });
      
      if (response && response.user) {
        user.value = response.user;
        isAuthenticated.value = true;
        return true;
      }
      return false;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  }

  async function fetchMe() {
    const subdomain = getSubdomain();
    const reqHeaders = typeof process !== 'undefined' && process.server ? useRequestHeaders(['cookie']) : {};
    
    const headers: Record<string, string> = {
      'x-subdomain': subdomain,
      ...(reqHeaders as Record<string, string>),
    };

    try {
      const response = await $fetch<{ user: User }>(`${API_BASE}/v1/auth/me`, {
        method: 'GET',
        headers,
      });
      if (response && response.user) {
        user.value = response.user;
        isAuthenticated.value = true;
        return;
      }
      user.value = null;
      isAuthenticated.value = false;
    } catch (error) {
      user.value = null;
      isAuthenticated.value = false;
    } finally {
      isInitialized.value = true;
    }
  }

  async function logout() {
    user.value = null;
    isAuthenticated.value = false;

    const subdomain = getSubdomain();
    try {
      await $fetch(`${API_BASE}/v1/auth/logout`, {
        method: 'POST',
        headers: {
          'x-subdomain': subdomain,
        },
      });
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
  }

  function hasPermission(permission: string): boolean {
    return user.value?.permissions?.includes(permission) || false;
  }

  function hasRole(role: string): boolean {
    return user.value?.roles?.includes(role) || false;
  }

  return {
    user,
    branding,
    isAuthenticated,
    isInitialized,
    fetchBranding,
    login,
    fetchMe,
    logout,
    hasPermission,
    hasRole,
    getSubdomain,
  };
});
