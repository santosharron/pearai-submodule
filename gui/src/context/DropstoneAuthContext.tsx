import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { PEARAI_AUTH_URL } from '../util/constants';
import { DropstoneAuthDialog } from '../components/dialogs/DropstoneAuthDialog';
import { useWebviewListener } from '../hooks/useWebviewListener';
import { IdeMessengerContext } from './IdeMessenger';

interface DropstoneAuthContextType {
    isLoggedIn: boolean;
    loading: boolean;
    userInfo: any;
    token: string | null;
    login: (username: string, password: string) => Promise<void>;
    logout: () => void;
    showAuthDialog: () => void;
    authDialogVisible: boolean;
    closeAuthDialog: () => void;
    fetchAvailableModels: () => Promise<any>;
    isPremiumUser: boolean;
}

const DropstoneAuthContext = createContext<DropstoneAuthContextType | null>(null);

export const useDropstoneAuth = () => {
    const context = useContext(DropstoneAuthContext);
    if (!context) {
        throw new Error('useDropstoneAuth must be used within a DropstoneAuthProvider');
    }
    return context;
};

interface DropstoneAuthProviderProps {
    children: ReactNode;
}

export const DropstoneAuthProvider: React.FC<DropstoneAuthProviderProps> = ({ children }) => {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [loading, setLoading] = useState(true);
    const [userInfo, setUserInfo] = useState(null);
    const [authDialogVisible, setAuthDialogVisible] = useState(false);
    const [token, setToken] = useState<string | null>(null);
    const [isPremiumUser, setIsPremiumUser] = useState(false);
    const ideMessenger = useContext(IdeMessengerContext);

    // Listen for authentication expiration messages from the extension
    useWebviewListener('dropstoneAuthExpired', async (data) => {
        console.log('Received authentication expiration event:', data);
        handleAuthExpired();
        return undefined;
    });

    // Listen for authentication update messages from the extension
    useWebviewListener('dropstoneAuthUpdated', async (data) => {
        console.log('Received authentication update event:', data);
        if (data?.token) {
            // Update local state with the new token
            localStorage.setItem('dropstone_token', data.token);
            setToken(data.token);

            // Validate the token and update user info
            await validateAndSetUserInfo(data.token);
        }
        return undefined;
    });

    const validateAndSetUserInfo = useCallback(async (authToken: string) => {
        try {
            const response = await fetch(`${PEARAI_AUTH_URL}/api/user`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                console.log('Raw API response:', data);
                const user = data.user || data;
                console.log('Extracted user data:', user);
                setUserInfo(user);
                setIsLoggedIn(true);
                setIsPremiumUser(user.isActiveSubscription || false);
                return true;
            } else {
                // Token is invalid
                handleAuthExpired();
                return false;
            }
        } catch (error) {
            console.error('Error validating token:', error);
            handleAuthExpired();
            return false;
        }
    }, []);

    const checkAuthStatus = useCallback(async () => {
        const storedToken = localStorage.getItem('dropstone_token');
        setToken(storedToken);

        if (storedToken) {
            await validateAndSetUserInfo(storedToken);
        } else {
            setIsLoggedIn(false);
            setUserInfo(null);
            setToken(null);
            setIsPremiumUser(false);
        }
        setLoading(false);
    }, [validateAndSetUserInfo]);

    const login = useCallback(async (username: string, password: string) => {
        try {
            const response = await fetch(`${PEARAI_AUTH_URL}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            if (!response.ok) {
                throw new Error('Login failed');
            }

            const data = await response.json();
            localStorage.setItem('dropstone_token', data.token);
            setToken(data.token);
            setUserInfo(data.user);
            setIsLoggedIn(true);
            setAuthDialogVisible(false);
            console.log('User authenticated successfully');

            // Save authentication to config file
            try {
                console.log('Saving authentication to config file...');
                const result = await ideMessenger.post('saveDropstoneAuth', {
                    token: data.token,
                    userInfo: data.user
                });
                console.log('Dropstone authentication saved to config file:', result);

                // Add a small delay to ensure config is fully updated
                await new Promise(resolve => setTimeout(resolve, 1000));
                console.log('Authentication save complete');
            } catch (configError) {
                console.warn('Failed to save authentication to config file:', configError);
                // Don't fail the login process if config save fails
            }
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    }, [ideMessenger]);

    // Function compatible with DropstoneAuthDialog interface
    const handleAuthentication = useCallback(async (usernameOrToken: string, password?: string): Promise<boolean> => {
        try {
            if (password) {
                // Username/password authentication
                await login(usernameOrToken, password);
            } else {
                // Token authentication
                localStorage.setItem('dropstone_token', usernameOrToken);
                setToken(usernameOrToken);

                // Validate the token by checking user info
                const response = await fetch(`${PEARAI_AUTH_URL}/api/user`, {
                    headers: {
                        'Authorization': `Bearer ${usernameOrToken}`
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    console.log('Raw API response:', data);
                    // The API returns { user: userData }, so we need to extract the user
                    const user = data.user || data;
                    console.log('Extracted user data:', user);
                    console.log('User name:', user.name);
                    console.log('User userName:', user.userName);
                    console.log('User email:', user.email);
                    setUserInfo(user);
                    setIsLoggedIn(true);
                    setAuthDialogVisible(false);
                    // Check if user has premium access
                    setIsPremiumUser(user.isActiveSubscription || false);
                    console.log('User authenticated successfully with token');

                    // Save authentication to config file
                    try {
                        console.log('Saving token authentication to config file...');
                        const result = await ideMessenger.post('saveDropstoneAuth', {
                            token: usernameOrToken,
                            userInfo: user
                        });
                        console.log('Dropstone authentication saved to config file:', result);

                        // Add a small delay to ensure config is fully updated
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        console.log('Token authentication save complete');
                    } catch (configError) {
                        console.warn('Failed to save authentication to config file:', configError);
                        // Don't fail the authentication process if config save fails
                    }
                } else {
                    localStorage.removeItem('dropstone_token');
                    setToken(null);
                    throw new Error('Invalid token');
                }
            }
            return true;
        } catch (error) {
            console.error('Authentication error:', error);
            return false;
        }
    }, [login, ideMessenger]);

    const logout = useCallback(() => {
        localStorage.removeItem('dropstone_token');
        setToken(null);
        setIsLoggedIn(false);
        setUserInfo(null);
        setAuthDialogVisible(false);
        setIsPremiumUser(false);
        console.log('User logged out');
    }, []);

    const showAuthDialog = useCallback(() => {
        setAuthDialogVisible(true);
    }, []);

    const closeAuthDialog = useCallback(() => {
        setAuthDialogVisible(false);
    }, []);

    const handleAuthExpired = useCallback(async () => {
        console.log('Authentication expired, logging out user and clearing token');

        // Clear the token from localStorage first
        localStorage.removeItem('dropstone_token');
        setToken(null);

        // Clear authentication from the extension as well
        try {
            console.log('Clearing authentication from extension...');
            await ideMessenger.post('clearDropstoneAuth', undefined);
            console.log('Successfully cleared authentication from extension');
        } catch (error) {
            console.warn('Failed to clear extension authentication:', error);
        }

        // Update state to reflect logged out status
        setIsLoggedIn(false);
        setUserInfo(null);

        // Show the authentication dialog
        setAuthDialogVisible(true);

        console.log('User logged out due to token expiration, auth dialog shown');
    }, [ideMessenger]);

    const fetchAvailableModels = useCallback(async () => {
        try {
            const response = await fetch(`${PEARAI_AUTH_URL}/api/models/public`);
            if (response.ok) {
                const data = await response.json();
                return data.models;
            }
            return {};
        } catch (error) {
            console.error('Error fetching models:', error);
            return {};
        }
    }, []);

    useEffect(() => {
        checkAuthStatus();
    }, [checkAuthStatus]);

    const value: DropstoneAuthContextType = {
        isLoggedIn,
        loading,
        userInfo,
        token,
        login,
        logout,
        showAuthDialog,
        authDialogVisible,
        closeAuthDialog,
        fetchAvailableModels,
        isPremiumUser
    };

    return (
        <DropstoneAuthContext.Provider value={value}>
            {children}
            <DropstoneAuthDialog
                isOpen={authDialogVisible}
                onClose={closeAuthDialog}
                onAuthenticate={handleAuthentication}
            />
        </DropstoneAuthContext.Provider>
    );
};
