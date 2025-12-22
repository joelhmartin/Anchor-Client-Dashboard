import { createContext, useContext, useState, useCallback } from 'react';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, severity = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, severity }]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = {
    success: (msg) => addToast(msg, 'success'),
    error: (msg) => addToast(msg, 'error'),
    warning: (msg) => addToast(msg, 'warning'),
    info: (msg) => addToast(msg, 'info')
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {toasts.map((t) => (
        <Snackbar
          key={t.id}
          open
          autoHideDuration={5000}
          onClose={() => removeToast(t.id)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <Alert severity={t.severity} onClose={() => removeToast(t.id)} sx={{ width: '100%' }}>
            {t.message}
          </Alert>
        </Snackbar>
      ))}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback if not wrapped in provider
    return {
      success: (msg) => console.log('[toast:success]', msg),
      error: (msg) => console.error('[toast:error]', msg),
      warning: (msg) => console.warn('[toast:warning]', msg),
      info: (msg) => console.info('[toast:info]', msg)
    };
  }
  return ctx;
}

