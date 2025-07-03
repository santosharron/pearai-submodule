import { useState, useEffect, useCallback } from 'react';

export interface DropstoneAuthState {
  isAuthenticated: boolean;
  token: string | null;
  user: any | null;
}

export const useDropstoneAuth = () => {
  const [authState, setAuthState] = useState<DropstoneAuthState>({
    isAuthenticated: false,
    token: null,
    user: null
  });

  // Check for existing authentication on mount
  useEffect(() => {
    checkExistingAuth();
  }, []);

  const checkExistingAuth = () => {
    const token = localStorage.getItem('dropstone_token');
    const user = localStorage.getItem('dropstone_user');

    if (token && user) {
      try {
        const parsedUser = JSON.parse(user);
        setAuthState({
          isAuthenticated: true,
          token,
          user: parsedUser
        });
      } catch (error) {
        // Invalid stored data, clear it
        clearAuth();
      }
    }
  };

  const authenticate = async (usernameOrToken: string, password?: string): Promise<boolean> => {
    try {
      // If no password provided, treat as JWT token
      if (!password) {
        // Validate the token by making a test request
        const response = await fetch('http://localhost:3000/api/user', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${usernameOrToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const userData = await response.json();
          const token = usernameOrToken;

          // Store authentication data
          localStorage.setItem('dropstone_token', token);
          localStorage.setItem('dropstone_user', JSON.stringify(userData.user));

          // Update state immediately
          setAuthState({
            isAuthenticated: true,
            token,
            user: userData.user
          });

          console.log('JWT authentication successful:', userData.user);
          return true;
        } else {
          console.error('JWT validation failed:', response.status);
          return false;
        }
      }

      // Traditional username/password login
      const response = await fetch('http://localhost:3000/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: usernameOrToken,
          password
        })
      });

      if (response.ok) {
        const data = await response.json();

        // Store authentication data
        localStorage.setItem('dropstone_token', data.token);
        localStorage.setItem('dropstone_user', JSON.stringify(data.user));

        // Update state immediately
        setAuthState({
          isAuthenticated: true,
          token: data.token,
          user: data.user
        });

        console.log('Username/password authentication successful:', data.user);
        return true;
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Login failed:', response.status, errorData);
        return false;
      }

    } catch (error) {
      console.error('Authentication error:', error);
      return false;
    }
  };

  const clearAuth = useCallback(() => {
    localStorage.removeItem('dropstone_token');
    localStorage.removeItem('dropstone_user');
    setAuthState({
      isAuthenticated: false,
      token: null,
      user: null
    });
  }, []);

  const logout = useCallback(() => {
    clearAuth();
  }, [clearAuth]);

  const validateToken = async (): Promise<boolean> => {
    if (!authState.token) return false;

    try {
      const response = await fetch('http://localhost:3000/api/user', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authState.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        clearAuth();
        return false;
      }

      return true;
    } catch (error) {
      clearAuth();
      return false;
    }
  };

  // Enhanced authentication error handler
  const handleAuthExpiration = useCallback(() => {
    console.log('Dropstone authentication expired, logging out user');
    clearAuth();

    // Post message to IDE extension to trigger logout and show login dialog
    window.postMessage({
      messageType: 'dropstoneAuthExpired',
      data: {}
    }, '*');
  }, [clearAuth]);

  // Global error handler for authentication errors
  const handleApiError = useCallback((error: any, response?: Response) => {
    if (response?.status === 401 || response?.status === 403) {
      console.log('Authentication error detected:', response.status);
      handleAuthExpiration();
      return true; // Indicates auth error was handled
    }

    if (error?.message?.includes('token expired') ||
        error?.message?.includes('Authentication failed') ||
        error?.message?.includes('Invalid token')) {
      console.log('Authentication error detected in message:', error.message);
      handleAuthExpiration();
      return true; // Indicates auth error was handled
    }

    return false; // Not an auth error
  }, [handleAuthExpiration]);

  return {
    ...authState,
    authenticate,
    logout,
    validateToken,
    checkExistingAuth,
    handleAuthExpiration,
    handleApiError
  };
};
