import { IDE } from "../index.js";
import { GlobalContext } from "../util/GlobalContext.js";

export interface DropstoneAuthInfo {
  token: string;
  userInfo?: {
    name?: string;
    email?: string;
    userName?: string;
    isActiveSubscription?: boolean;
  };
  expiresAt?: number;
}

export interface AuthSyncListener {
  onAuthUpdate: (authInfo: DropstoneAuthInfo | null) => void;
  onAuthExpired: () => void;
}

/**
 * Centralized authentication manager for Dropstone
 * Syncs authentication across Dropstone-Agent, GUI, and Core
 */
export class AuthManager {
  private static instance: AuthManager | null = null;
  private globalContext = new GlobalContext();
  private listeners: AuthSyncListener[] = [];
  private currentAuth: DropstoneAuthInfo | null = null;

  constructor(
    private ide: IDE,
    private writeLog: (text: string) => Promise<void>
  ) {
    this.initializeAuth();
  }

  static getInstance(ide?: IDE, writeLog?: (text: string) => Promise<void>): AuthManager {
    if (!AuthManager.instance && ide && writeLog) {
      AuthManager.instance = new AuthManager(ide, writeLog);
    }
    return AuthManager.instance!;
  }

  /**
   * Initialize authentication by loading from all possible sources
   */
  private async initializeAuth(): Promise<void> {
    try {
      // Try to load from global context first
      const storedAuth = this.globalContext.get("dropstoneAuth" as any) as DropstoneAuthInfo | null;

      if (storedAuth && this.isTokenValid(storedAuth)) {
        this.currentAuth = storedAuth;
        await this.writeLog("Loaded valid Dropstone authentication from global context");
        return;
      }

      // Try to get from IDE settings
      const ideSettings = await this.ide.getIdeSettings();
      if (ideSettings.dropstoneApiKey) {
        const authInfo: DropstoneAuthInfo = {
          token: ideSettings.dropstoneApiKey
        };

        // Validate token and get user info if possible
        const isValid = await this.validateToken(authInfo.token);
        if (isValid) {
          this.currentAuth = authInfo;
          // Store in global context for future use
          this.globalContext.update("dropstoneAuth" as any, authInfo);
          await this.writeLog("Loaded Dropstone authentication from IDE settings");
          return;
        }
      }

      await this.writeLog("No valid Dropstone authentication found");
    } catch (error) {
      await this.writeLog(`Error initializing auth: ${error}`);
    }
  }

  /**
   * Save authentication information and sync across all components
   */
  async saveAuth(authInfo: DropstoneAuthInfo): Promise<void> {
    try {
      // Validate token before saving
      const isValid = await this.validateToken(authInfo.token);
      if (!isValid) {
        throw new Error("Invalid authentication token");
      }

      this.currentAuth = authInfo;

      // Save to global context
      this.globalContext.update("dropstoneAuth" as any, authInfo);

      // Sync to all components
      await this.syncToAllComponents(authInfo);

      // Notify listeners
      this.notifyListeners('update', authInfo);

      await this.writeLog("Dropstone authentication saved and synced successfully");
    } catch (error) {
      await this.writeLog(`Error saving auth: ${error}`);
      throw error;
    }
  }

  /**
   * Clear authentication from all sources
   */
  async clearAuth(): Promise<void> {
    try {
      this.currentAuth = null;

      // Clear from global context
      this.globalContext.update("dropstoneAuth" as any, null);

      // Clear from all components
      await this.clearFromAllComponents();

      // Notify listeners
      this.notifyListeners('clear', null);

      await this.writeLog("Dropstone authentication cleared from all components");
    } catch (error) {
      await this.writeLog(`Error clearing auth: ${error}`);
      throw error;
    }
  }

  /**
   * Get current authentication info
   */
  getCurrentAuth(): DropstoneAuthInfo | null {
    return this.currentAuth;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.currentAuth !== null && this.isTokenValid(this.currentAuth);
  }

  /**
   * Add a listener for authentication changes
   */
  addAuthListener(listener: AuthSyncListener): void {
    this.listeners.push(listener);
  }

  /**
   * Remove a listener
   */
  removeAuthListener(listener: AuthSyncListener): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Handle authentication from external sources (like login callbacks)
   */
  async handleExternalAuth(token: string, userInfo?: any): Promise<void> {
    const authInfo: DropstoneAuthInfo = {
      token,
      userInfo,
      expiresAt: this.extractTokenExpiry(token)
    };

    await this.saveAuth(authInfo);
  }

  /**
   * Validate token by checking its format and optionally making an API call
   */
  private async validateToken(token: string): Promise<boolean> {
    try {
      // Basic JWT format validation
      if (!token.includes('.') || token.split('.').length !== 3) {
        return false;
      }

      // Check if token is expired
      const expiry = this.extractTokenExpiry(token);
      if (expiry && Date.now() > expiry) {
        return false;
      }

      // Could add API validation here if needed
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if token is valid and not expired
   */
  private isTokenValid(authInfo: DropstoneAuthInfo): boolean {
    if (!authInfo.token) return false;

    if (authInfo.expiresAt && Date.now() > authInfo.expiresAt) {
      return false;
    }

    return true;
  }

  /**
   * Extract expiry time from JWT token
   */
  private extractTokenExpiry(token: string): number | undefined {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return undefined;

      const payload = JSON.parse(atob(parts[1]));
      return payload.exp ? payload.exp * 1000 : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Sync authentication to all components
   */
  private async syncToAllComponents(authInfo: DropstoneAuthInfo): Promise<void> {
    const syncPromises: Promise<void>[] = [];

    // Sync to Dropstone-Agent extension (via postMessage)
    syncPromises.push(this.syncToRooCodeExtension(authInfo));

    // Sync to GUI (via localStorage and context)
    syncPromises.push(this.syncToGUI(authInfo));

    // Sync to Core configuration
    syncPromises.push(this.syncToCore(authInfo));

    await Promise.all(syncPromises);
  }

  /**
   * Clear authentication from all components
   */
  private async clearFromAllComponents(): Promise<void> {
    const clearPromises: Promise<void>[] = [];

    // Clear from Dropstone-Agent extension
    clearPromises.push(this.clearFromRooCodeExtension());

    // Clear from GUI
    clearPromises.push(this.clearFromGUI());

    // Clear from Core configuration
    clearPromises.push(this.clearFromCore());

    await Promise.all(clearPromises);
  }

  /**
   * Sync authentication to Dropstone-Agent extension
   */
  private async syncToRooCodeExtension(authInfo: DropstoneAuthInfo): Promise<void> {
    try {
      // Send message to extension to update its authentication
      // This will be handled by the extension's message handlers
      await this.sendToExtension('updateDropstoneAuth', {
        token: authInfo.token,
        userInfo: authInfo.userInfo
      });
    } catch (error) {
      await this.writeLog(`Error syncing to Roo Code extension: ${error}`);
    }
  }

  /**
   * Sync authentication to GUI components
   */
  private async syncToGUI(authInfo: DropstoneAuthInfo): Promise<void> {
    try {
      // Update localStorage (used by GUI components)
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('dropstone_token', authInfo.token);
        if (authInfo.userInfo) {
          localStorage.setItem('dropstone_user', JSON.stringify(authInfo.userInfo));
        }
      }

      // Send message to GUI components
      await this.sendToGUI('dropstoneAuthUpdated', authInfo);
    } catch (error) {
      await this.writeLog(`Error syncing to GUI: ${error}`);
    }
  }

  /**
   * Sync authentication to Core configuration
   */
  private async syncToCore(authInfo: DropstoneAuthInfo): Promise<void> {
    try {
      // Update IDE settings
      const ideSettings = await this.ide.getIdeSettings();
      ideSettings.dropstoneApiKey = authInfo.token;

      // Store in global context
      this.globalContext.update("dropstoneAuth" as any, authInfo);
    } catch (error) {
      await this.writeLog(`Error syncing to Core: ${error}`);
    }
  }

  /**
   * Clear authentication from Dropstone-Agent extension
   */
  private async clearFromRooCodeExtension(): Promise<void> {
    try {
      await this.sendToExtension('clearDropstoneAuth', {});
    } catch (error) {
      await this.writeLog(`Error clearing from Roo Code extension: ${error}`);
    }
  }

  /**
   * Clear authentication from GUI
   */
  private async clearFromGUI(): Promise<void> {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('dropstone_token');
        localStorage.removeItem('dropstone_user');
      }

      await this.sendToGUI('dropstoneAuthExpired', {});
    } catch (error) {
      await this.writeLog(`Error clearing from GUI: ${error}`);
    }
  }

  /**
   * Clear authentication from Core
   */
  private async clearFromCore(): Promise<void> {
    try {
      const ideSettings = await this.ide.getIdeSettings();
      ideSettings.dropstoneApiKey = undefined;

      this.globalContext.update("dropstoneAuth" as any, null);
    } catch (error) {
      await this.writeLog(`Error clearing from Core: ${error}`);
    }
  }

  /**
   * Send message to extension
   */
  private async sendToExtension(messageType: string, data: any): Promise<void> {
    try {
      // Use the global context to communicate with the extension
      // The extension can watch for changes to these keys
      console.log(`[AuthManager] Sending to extension: ${messageType}`, data);

      if (messageType === 'updateDropstoneAuth') {
        // Store a sync signal that the extension can watch for
        await this.globalContext.update('authSyncSignal' as any, {
          type: 'updateDropstoneAuth',
          token: data.token,
          userInfo: data.userInfo,
          timestamp: Date.now()
        });
        console.log(`[AuthManager] Auth sync signal stored for extension`);
      } else if (messageType === 'clearDropstoneAuth') {
        // Store a clear signal that the extension can watch for
        await this.globalContext.update('authSyncSignal' as any, {
          type: 'clearDropstoneAuth',
          timestamp: Date.now()
        });
        console.log(`[AuthManager] Auth clear signal stored for extension`);
      } else {
        console.log(`[AuthManager] Unknown message type: ${messageType}`);
      }

    } catch (error) {
      console.error(`[AuthManager] Error sending message to extension:`, error);
    }
  }

  /**
   * Send message to GUI
   */
  private async sendToGUI(type: string, data: any): Promise<void> {
    try {
      // This would send a message to GUI components
      // Implementation depends on the communication mechanism
      await this.writeLog(`Sending to GUI: ${type}`);
    } catch (error) {
      await this.writeLog(`Error sending to GUI: ${error}`);
    }
  }

  /**
   * Notify all listeners of authentication changes
   */
  private notifyListeners(type: 'update' | 'clear' | 'expired', authInfo: DropstoneAuthInfo | null): void {
    this.listeners.forEach(listener => {
      try {
        if (type === 'update' && authInfo) {
          listener.onAuthUpdate(authInfo);
        } else if (type === 'expired') {
          listener.onAuthExpired();
        } else if (type === 'clear') {
          listener.onAuthUpdate(null);
        }
      } catch (error) {
        // Log error but don't fail the whole process
        this.writeLog(`Error notifying listener: ${error}`);
      }
    });
  }

  /**
   * Check authentication status and handle expired tokens
   */
  async checkAuthStatus(): Promise<boolean> {
    if (!this.currentAuth) return false;

    if (!this.isTokenValid(this.currentAuth)) {
      // Token is expired, clear authentication
      await this.clearAuth();
      this.notifyListeners('expired', null);
      return false;
    }

    return true;
  }

  /**
   * Refresh authentication if possible
   */
  async refreshAuth(): Promise<boolean> {
    try {
      // If we have current auth info, try to refresh
      if (this.currentAuth?.token) {
        // This could implement token refresh logic
        // For now, we'll just validate the current token
        return await this.validateToken(this.currentAuth.token);
      }
      return false;
    } catch {
      return false;
    }
  }
}

export default AuthManager;
