import axios from 'axios';

const API_BASE = import.meta.env.VITE_APP_API_BASE || '/api';

const client = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});

client.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const acting = window.sessionStorage?.getItem('actingClientId');
    if (acting) {
      config.headers = { ...(config.headers || {}), 'x-acting-user': acting };
    } else if (config.headers?.['x-acting-user']) {
      const headers = { ...config.headers };
      delete headers['x-acting-user'];
      config.headers = headers;
    }
  }
  return config;
});

export default client;
