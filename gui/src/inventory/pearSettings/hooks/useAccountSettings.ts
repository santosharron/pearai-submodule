import { useState, useContext, useEffect } from 'react';
import { IdeMessengerContext } from "@/context/IdeMessenger";
import { SERVER_URL } from "core/util/parameters";
import { DROPSTONE_AUTH_URL } from "@/util/constants";
import { Auth, AccountDetails, UsageDetails } from '../types';

interface AgentUsageDetails {
  agentActionsUsed: number;
  agentActionsLimit: number;
  agentActionsRemaining: number | 'unlimited';
  isUnlimited: boolean;
  lastReset: string | null;
  nextReset: string;
  planType: 'free' | 'premium';
}

export const useAccountSettings = () => {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [usageDetails, setUsageDetails] = useState<UsageDetails | null>(null);
  const [accountDetails, setAccountDetails] = useState<AccountDetails | null>(null);
  const [agentUsageDetails, setAgentUsageDetails] = useState<AgentUsageDetails | null>(null);
  const [isUsageLoading, setIsUsageLoading] = useState(false);
  const [isAgentUsageLoading, setIsAgentUsageLoading] = useState(false);
  const ideMessenger = useContext(IdeMessengerContext);

  // Helper to resolve a usable JWT token – prefer explicit authData but fall
  // back to the cached Dropstone token (written by DropstoneAuthContext)
  const resolveToken = (authData?: Auth): string | null => {
    if (authData?.accessToken) {
      return authData.accessToken;
    }
    const stored = localStorage.getItem("dropstone_token");
    return stored ?? null;
  };

  const fetchUsageData = async (authData?: Auth) => {
    const token = resolveToken(authData);
    if (!token) {
      console.warn("[useAccountSettings] No JWT token available for fetchUsageData");
      return;
    }

    setIsUsageLoading(true);
    try {
      const response = await fetch(`${SERVER_URL}/get-usage`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! {fetchUsageData} Status: ${response.status}`);
      }
      const data = await response.json();
      setUsageDetails(data);
    } catch (err) {
      console.error("Error fetching usage data", err);
    } finally {
      setIsUsageLoading(false);
    }
  };

  const fetchAgentUsageData = async (authData?: Auth) => {
    const token = resolveToken(authData);
    if (!token) {
      console.warn("[useAccountSettings] No JWT token available for fetchAgentUsageData");
      return;
    }

    setIsAgentUsageLoading(true);
    try {
      const response = await fetch(`${DROPSTONE_AUTH_URL}/api/agent/usage`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! {fetchAgentUsageData} Status: ${response.status}`);
      }
      const data = await response.json();
      setAgentUsageDetails(data);
    } catch (err) {
      console.error("Error fetching agent usage data", err);
    } finally {
      setIsAgentUsageLoading(false);
    }
  };

  const fetchAccountData = async (authData?: Auth) => {
    const token = resolveToken(authData);
    if (!token) {
      console.warn("[useAccountSettings] No JWT token available for fetchAccountData");
      return;
    }

    try {
      const response = await fetch(`${SERVER_URL}/account`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! {fetchAccountData} Status: ${response.status}`);
      }
      const data = await response.json();
      localStorage.setItem('dropstone_account_details', JSON.stringify(data));
      console.log('[useAccountSettings] Saved dropstone_account_details to localStorage', data);
      // Also cache token so that other webviews pick it up immediately
      localStorage.setItem('dropstone_token', token);
      console.log('[useAccountSettings] Saved dropstone_token to localStorage', token);
      setAccountDetails(data);

      // Synchronize auth with Dropstone Chat / Roo-Code extension
      try {
        // @ts-ignore – not part of protocol typings
        await ideMessenger.post('auth_sync_login', {
          token,
          userInfo: data,
        });
        // @ts-ignore – not part of protocol typings
        await ideMessenger.post('invokeVSCodeCommandById', {
          commandId: 'dropstone-roo-cline.pearaiLogin',
          args: [{ token, userInfo: data }],
        });
      } catch (syncErr) {
        console.error('Failed to sync authentication with Dropstone components:', syncErr);
      }
    } catch (err) {
      console.error("Error fetching account data", err);
    }
  };

  // -------------------------------------------------------------------
  // Check auth with extension and persist it locally so that the GUI can
  // restore login state on the next launch without waiting for the
  // extension round-trip.
  // -------------------------------------------------------------------
  const checkAuth = async () => {
    try {
      const res = await ideMessenger.request("getPearAuth", undefined);

      // -----------------------------------------------------------------
      // Decide what token we should ultimately use in the UI. We prefer the
      // extension-provided credentials, but if they are missing we fall back
      // to any previously cached auth that might still be valid. This prevents
      // us from erroneously logging the user out when the extension has not
      // yet initialised.
      // -----------------------------------------------------------------

      let effectiveAuth: Auth | null | undefined = res;

      if (res?.accessToken) {
        console.log('[AccountSettings] checkAuth received token from extension');
        localStorage.setItem("dropstone_auth", JSON.stringify(res));
        localStorage.setItem("dropstone_token", res.accessToken);
        console.log('[useAccountSettings] Saved dropstone_auth & dropstone_token to localStorage (from checkAuth)');
      } else {
        // No token from the extension – see if we already have a cached one.
        const cachedAuthRaw = localStorage.getItem("dropstone_auth");
        if (cachedAuthRaw) {
          try {
            effectiveAuth = JSON.parse(cachedAuthRaw);
            if (effectiveAuth?.accessToken) {
              console.log('[AccountSettings] checkAuth fell back to cached token');
              // Ensure the token is also present under the unified key so other
              // webviews pick it up instantly.
              localStorage.setItem('dropstone_token', effectiveAuth.accessToken);
            }
          } catch (err) {
            console.warn('Failed to parse cached dropstone_auth', err);
          }
        }

        // If we still have no usable credentials, clean up any stale cache so
        // the UI shows a logged-out state.
        if (!effectiveAuth?.accessToken) {
          console.log('[AccountSettings] checkAuth found no valid token – clearing cache');
          localStorage.removeItem("dropstone_auth");
          localStorage.removeItem("pearai_auth"); // legacy key cleanup
          localStorage.removeItem("dropstone_token");
        }
      }

      setAuth(effectiveAuth ?? null);
      return effectiveAuth ?? null;
    } catch (error) {
      console.error("Error checking auth status:", error);
      return null;
    }
  };

  const handleLogin = () => {
    ideMessenger.post("pearaiLogin", undefined);
  };

  const handleLogout = () => {
    // Remove cached Dropstone token so other webviews detect logout immediately
    localStorage.removeItem('dropstone_token');

    clearUserData();

    // Notify extension host and other webviews about logout
    // @ts-ignore – not part of protocol typings
    ideMessenger.post('auth_sync_logout', undefined);
    // @ts-ignore – not part of protocol typings
    ideMessenger.post('invokeVSCodeCommandById', {
      commandId: 'dropstone-roo-cline.dropstoneLogout',
    });

    ideMessenger.post("pearaiLogout", undefined);
  };

  const clearUserData = () => {
    localStorage.removeItem('dropstone_account_details');
    localStorage.removeItem('dropstone_auth');
    localStorage.removeItem('pearai_auth'); // legacy cleanup
    localStorage.removeItem('dropstone_token');
    console.log('[useAccountSettings] Cleared localStorage items dropstone_account_details, dropstone_auth, dropstone_token');
    setAuth(null);
    setUsageDetails(null);
    setAccountDetails(null);
  };

  const copyApiKey = async () => {
    if (auth?.accessToken) {
      try {
        await navigator.clipboard.writeText(auth.accessToken);
      } catch (error) {
        console.error("Failed to copy API key:", error);
      }
    }
  };

  const refreshData = async () => {
    const authData = await checkAuth();
    await Promise.all([fetchUsageData(authData), fetchAccountData(authData), fetchAgentUsageData(authData)]);
  };

  useEffect(() => {
    // Hydrate cached account details
    const cachedAccountDetails = localStorage.getItem('dropstone_account_details');
    if (cachedAccountDetails) {
      console.log('[AccountSettings] Hydrating cached accountDetails');
      try {
        setAccountDetails(JSON.parse(cachedAccountDetails));
      } catch (parseError) {
        console.error("Failed to parse cached account details:", parseError);
      }
    }

    // Hydrate cached auth immediately; this avoids a flash of the login
    // button while waiting for the extension response.
    const cachedAuth = localStorage.getItem('dropstone_auth');
    if (cachedAuth) {
      console.log('[AccountSettings] Hydrating cached auth');
      try {
        const parsedAuth = JSON.parse(cachedAuth);
        setAuth(parsedAuth);
        // Ensure cross-webview token cache
        if (parsedAuth?.accessToken) {
          console.log('[AccountSettings] Restored token from cached auth');
          localStorage.setItem('dropstone_token', parsedAuth.accessToken);
        }
      } catch (parseErr) {
        console.warn('Failed to parse cached auth', parseErr);
      }
    }

    // Always refresh so we have latest data; this will also update cache
    refreshData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    auth,
    showApiKey,
    setShowApiKey,
    usageDetails,
    accountDetails,
    agentUsageDetails,
    isUsageLoading,
    isAgentUsageLoading,
    handleLogin,
    handleLogout,
    clearUserData,
    copyApiKey,
    checkAuth,
    fetchUsageData,
    fetchAccountData,
    fetchAgentUsageData,
    refreshData,
  };
};
