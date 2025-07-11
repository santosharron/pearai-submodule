# PearAI Authentication System Usage Guide

## How to Use the Authentication System

### Frontend Components

#### 1. **Main Authentication Interface**
```typescript
// Location: gui/src/inventory/pearSettings/general.tsx
import { useAccountSettings } from "./hooks/useAccountSettings";
import { useDropstoneAuth } from "@/context/DropstoneAuthContext";

const YourComponent = () => {
  const { handleLogin, handleLogout, auth, accountDetails } = useAccountSettings();
  const { showAuthDialog, isLoggedIn, userInfo, token } = useDropstoneAuth();
  
  return (
    <button onClick={showAuthDialog || handleLogin}>
      {isLoggedIn ? 'Logout' : 'Login'}
    </button>
  );
};
```

#### 2. **Authentication Context Provider**
```typescript
// Location: gui/src/context/DropstoneAuthContext.tsx
import { DropstoneAuthProvider } from "@/context/DropstoneAuthContext";

// Wrap your app with the provider
<DropstoneAuthProvider>
  <YourApp />
</DropstoneAuthProvider>
```

#### 3. **Authentication Hook**
```typescript
// Location: gui/src/inventory/pearSettings/hooks/useAccountSettings.ts
import { useAccountSettings } from "./hooks/useAccountSettings";

const { 
  auth,           // PearAI auth tokens
  accountDetails, // User account info
  handleLogin,    // Login function
  handleLogout,   // Logout function
  refreshData     // Refresh user data
} = useAccountSettings();
```

#### 4. **Authentication Dialog**
```typescript
// Location: gui/src/components/dialogs/DropstoneAuthDialog.tsx
// Automatically shown when showAuthDialog() is called
// Handles JWT token input and username/password authentication
```

### Backend Services

#### 1. **Dropstone Server**
```
Location: https://dropstone-server-bjlp.onrender.com
Endpoints:
- POST /login - Username/password authentication
- GET /api/user - Get user info (requires Bearer token)
- GET /api/models - Get available models (authenticated)
- GET /api/models/public - Get public models (no auth)
```

#### 2. **PearAI Server**
```
Location: http://localhost:3002
Endpoints:
- /login - PearAI platform login page
- /dashboard - User dashboard
```

#### 3. **Extension Backend**
```typescript
// Location: extensions/vscode/src/extension/VsCodeMessenger.ts
// Handles authentication messages between webview and extension
// Location: extensions/vscode/src/commands.ts
// Contains dropstone.login, dropstone.logout commands
```

### Authentication Flow Integration

#### 1. **Dual Authentication Setup**
```typescript
// Check both authentication states
const isAuthenticated = isDropstoneLoggedIn || !!accountDetails;
const userDisplayInfo = dropstoneUserInfo || accountDetails;

// Prioritize Dropstone authentication
const handleLoginClick = () => {
  if (showDropstoneAuthDialog) {
    showDropstoneAuthDialog(); // Opens JWT dialog
  } else {
    handleLogin(); // Opens browser to localhost:3002/login
  }
};
```

#### 2. **Token Storage**
```typescript
// Browser localStorage
localStorage.setItem('dropstone_token', token);
localStorage.setItem('dropstone_user', JSON.stringify(userInfo));
localStorage.setItem('pearai_account_details', JSON.stringify(accountDetails));

// VS Code Extension secrets
extensionContext.secrets.store("pearai-token", accessToken);
extensionContext.secrets.store("pearai-refresh", refreshToken);
```

#### 3. **API Calls with Authentication**
```typescript
// Dropstone API calls
const response = await fetch(`${PEARAI_AUTH_URL}/api/user`, {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

// PearAI API calls
const response = await fetch(`${SERVER_URL}/account`, {
  headers: {
    'Authorization': `Bearer ${auth.accessToken}`
  }
});
```

### Required Dependencies

```typescript
// Context providers needed
import { DropstoneAuthProvider } from "@/context/DropstoneAuthContext";
import { IdeMessengerContext } from "@/context/IdeMessenger";

// Hooks needed
import { useDropstoneAuth } from "@/context/DropstoneAuthContext";
import { useAccountSettings } from "./hooks/useAccountSettings";
import { useWebviewListener } from "@/hooks/useWebviewListener";
```

### Message Handling

```typescript
// Listen for authentication events
useWebviewListener("pearAISignedIn", refreshData);
useWebviewListener("pearAISignedOut", clearUserData);
useWebviewListener("dropstoneAuthExpired", handleAuthExpiration);
useWebviewListener("dropstoneAuthUpdated", handleAuthUpdate);
```

### Quick Start

1. **Wrap your app** with `DropstoneAuthProvider`
2. **Use the hooks** `useDropstoneAuth()` and `useAccountSettings()`
3. **Call authentication functions** `showAuthDialog()` or `handleLogin()`
4. **Check authentication state** with `isLoggedIn` and `accountDetails`
5. **Handle tokens** stored in localStorage and extension secrets
6. **Make authenticated API calls** to localhost:3000 and localhost:3002

### Backend Requirements

- **Dropstone Server** running on `https://dropstone-server-bjlp.onrender.com`
- **PearAI Server** running on `http://localhost:3002`
- **VS Code Extension** handling IDE messages and token storage

## Authentication System Documentation

### Overview

The PearAI application implements a multi-layered authentication system that supports both **PearAI authentication** and **Dropstone authentication**. This system is designed to provide secure access to AI models and services across different platforms (VS Code, IntelliJ, and web GUI).

### Authentication Architecture

#### 1. **Dual Authentication System**
- **PearAI Authentication**: Primary authentication for the PearAI platform
- **Dropstone Authentication**: Secondary authentication for accessing Dropstone AI models and services

#### 2. **Cross-Platform Support**
- **VS Code Extension**: Uses VS Code's authentication provider system
- **IntelliJ Extension**: Uses IntelliJ's credential store and password safe
- **Web GUI**: Browser-based authentication with localStorage

### General Settings Implementation

#### 1. **Settings Structure**

The General Settings is implemented as part of the **PearSettings** system located in `gui/src/inventory/pearSettings/`:

```typescript
// Main Settings Container (PearSettings.tsx)
const PearSettings = () => {
  const [selectedItem, setSelectedItem] = useState<string>("general");
  
  // Menu items include both settings and inventory
  const menuItems: MenuItem[] = [
    { id: "general", title: "General", section: "settings" },
    { id: "help", title: "Help", section: "settings" },
    // ... inventory items
  ];
  
  return (
    <div className="min-h-[80%] min-w-[80%] flex">
      <Sidebar selectedItem={selectedItem} onSelectItem={setSelectedItem} />
      <ContentArea selectedItem={selectedItem} />
    </div>
  );
};
```

#### 2. **General Settings Component** (`gui/src/inventory/pearSettings/general.tsx`)

The General Settings component handles both **PearAI authentication** and **Dropstone authentication**:

```typescript
const AccountSettings = () => {
  // PearAI Authentication (useAccountSettings hook)
  const {
    auth,
    showApiKey,
    usageDetails,
    accountDetails,
    handleLogin,
    handleLogout,
    // ... other PearAI auth functions
  } = useAccountSettings();

  // Dropstone Authentication (useDropstoneAuth hook)
  const {
    isLoggedIn: isDropstoneLoggedIn,
    userInfo: dropstoneUserInfo,
    token: dropstoneToken,
    showAuthDialog: showDropstoneAuthDialog,
    logout: dropstoneLogout
  } = useDropstoneAuth();

  // Combined authentication state
  const isAuthenticated = isDropstoneLoggedIn || !!accountDetails;
  const userDisplayInfo = dropstoneUserInfo || accountDetails;
};
```

#### 3. **Authentication UI Components**

##### **A. User Profile Display**
```typescript
{isAuthenticated && userDisplayInfo ? (
  <UserProfile>
    <ProfileImage src={userInfo.imageUrl} />
    <ProfileInfo>
      <ProfileName>{userInfo.name || userInfo.userName}</ProfileName>
      <ProfileEmail>{userInfo.email}</ProfileEmail>
    </ProfileInfo>
    <LogoutButton onClick={logout}>Logout</LogoutButton>
  </UserProfile>
) : (
  <AuthButton onClick={showAuthDialog}>Sign In</AuthButton>
)}
```

##### **B. API Key/Token Display**
```typescript
<div className="flex flex-col w-full gap-3">
  <div className="flex">
    <div className="grow opacity-50">
      {isDropstoneLoggedIn ? "JWT Token" : "API Key"}
    </div>
    <div className="flex gap-3">
      <Eye onClick={() => setShowApiKey(!showApiKey)} />
      <Files onClick={async () => {
        const tokenToCopy = dropstoneToken || auth?.accessToken;
        await navigator.clipboard.writeText(tokenToCopy);
      }} />
    </div>
  </div>
  <div className="font-mono text-sm">
    {showApiKey ? (dropstoneToken || auth?.accessToken) : "••••••••••••••••"}
  </div>
</div>
```

### Authentication Components

#### Core Authentication Managers

##### 1. **AuthManager** (`core/config/AuthManager.ts`)
- **Purpose**: Central authentication manager for Dropstone authentication
- **Responsibilities**:
  - Initialize authentication from multiple sources
  - Validate JWT tokens
  - Sync authentication across components
  - Handle token expiration
  - Manage authentication lifecycle

```typescript
export class AuthManager {
  private static instance: AuthManager | null = null;
  private currentAuth: DropstoneAuthInfo | null = null;
  
  // Key methods:
  // - initializeAuth(): Load auth from global context or IDE settings
  // - saveAuth(): Save and sync authentication
  // - clearAuth(): Clear authentication from all sources
  // - isAuthenticated(): Check authentication status
  // - validateToken(): Validate JWT token format and expiry
}
```

##### 2. **PearAICredentials** (`core/pearaiServer/PearAICredentials.ts`)
- **Purpose**: Manages PearAI platform credentials
- **Responsibilities**:
  - Handle access and refresh tokens
  - Token validation and refresh
  - Credential storage and retrieval

##### 3. **useAccountSettings Hook** (`gui/src/inventory/pearSettings/hooks/useAccountSettings.ts`)
- **Purpose**: Manages PearAI authentication state in General Settings
- **Key Features**:
  - Account details fetching and caching
  - Usage statistics tracking
  - API key management
  - Login/logout functionality

```typescript
export const useAccountSettings = () => {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [accountDetails, setAccountDetails] = useState<AccountDetails | null>(null);
  const [usageDetails, setUsageDetails] = useState<UsageDetails | null>(null);

  const checkAuth = async () => {
    const res = await ideMessenger.request("getPearAuth", undefined);
    setAuth(res);
    return res;
  };

  const fetchAccountData = async (authData: Auth) => {
    const response = await fetch(`${SERVER_URL}/account`, {
      headers: {
        Authorization: `Bearer ${authData.accessToken}`,
      },
    });
    const data = await response.json();
    localStorage.setItem('pearai_account_details', JSON.stringify(data));
    setAccountDetails(data);
  };

  return {
    auth,
    accountDetails,
    usageDetails,
    handleLogin,
    handleLogout,
    // ... other functions
  };
};
```

### GUI Authentication Components

##### 1. **DropstoneAuthContext** (`gui/src/context/DropstoneAuthContext.tsx`)
- **Purpose**: React context for managing Dropstone authentication state
- **Key Features**:
  - Global authentication state management
  - Authentication dialog control
  - Token validation and user info fetching
  - Premium user detection
  - Authentication expiration handling

```typescript
interface DropstoneAuthContextType {
  isLoggedIn: boolean;
  loading: boolean;
  userInfo: any;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  showAuthDialog: () => void;
  fetchAvailableModels: () => Promise<any>;
  isPremiumUser: boolean;
}
```

##### 2. **DropstoneAuthDialog** (`gui/src/components/dialogs/DropstoneAuthDialog.tsx`)
- **Purpose**: JWT token authentication dialog
- **Features**:
  - JWT token input with validation
  - Authentication success/error feedback
  - Link to Dropstone dashboard for token generation
  - Styled with modern UI components

##### 3. **useAuth Hook** (`gui/src/hooks/useAuth.tsx`)
- **Purpose**: Hook for control plane authentication
- **Features**:
  - Session management
  - Login/logout functionality
  - Profile introduction for first-time users

##### 4. **useDropstoneAuth Hook** (`gui/src/hooks/useDropstoneAuth.ts`)
- **Purpose**: Hook for Dropstone authentication
- **Features**:
  - Token and username/password authentication
  - Local storage management
  - API error handling
  - Authentication state management

```typescript
const useDropstoneAuth = () => {
  const [authState, setAuthState] = useState({
    isAuthenticated: false,
    token: null,
    user: null
  });

  const authenticate = async (usernameOrToken: string, password?: string) => {
    if (password) {
      // Username/password login
      const response = await fetch('https://dropstone-server-bjlp.onrender.com/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameOrToken, password })
      });
      
      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('dropstone_token', data.token);
        localStorage.setItem('dropstone_user', JSON.stringify(data.user));
        setAuthState({
          isAuthenticated: true,
          token: data.token,
          user: data.user
        });
        return true;
      }
    } else {
      // Token authentication
      localStorage.setItem('dropstone_token', usernameOrToken);
      // Validate token...
    }
  };

  return { authState, authenticate, logout, validateToken };
};
```

### Extension Authentication Components

##### 1. **VS Code Authentication**

###### WorkOsAuthProvider (`extensions/vscode/src/stubs/WorkOsAuthProvider.ts`)
- **Purpose**: VS Code authentication provider using WorkOS
- **Features**:
  - OAuth2 flow with PKCE
  - Token refresh mechanism
  - Session management
  - Integration with VS Code's authentication API

###### VsCodeMessenger (`extensions/vscode/src/extension/VsCodeMessenger.ts`)
- **Purpose**: Handles authentication messages between extension and webview
- **Key Features**:
  - PearAI authentication commands
  - Dropstone authentication handling
  - Token storage in VS Code secrets

##### 2. **IntelliJ Authentication**

###### ContinueAuthService (`extensions/intellij/src/main/kotlin/com/github/continuedev/continueintellijextension/auth/ContinueAuthService.kt`)
- **Purpose**: IntelliJ authentication service
- **Features**:
  - Token refresh intervals
  - Credential storage using IntelliJ's PasswordSafe
  - Authentication dialog integration
  - Browser-based authentication flow

###### ContinueAuthDialog (`extensions/intellij/src/main/kotlin/com/github/continuedev/continueintellijextension/auth/ContinueAuthDialog.kt`)
- **Purpose**: IntelliJ authentication dialog
- **Features**:
  - Token input dialog
  - Integration with IntelliJ UI components

### Authentication Flows

#### 1. **Dual Authentication Flow in General Settings**

##### **A. PearAI Authentication Flow**
1. User opens General Settings
2. `useAccountSettings` hook checks authentication via IDE messenger
3. If authenticated, fetch account details and usage statistics
4. Display user profile with account information
5. Provide logout functionality

```typescript
// PearAI Authentication Check
const checkAuth = async () => {
  try {
    const res = await ideMessenger.request("getPearAuth", undefined);
    setAuth(res);
    return res;
  } catch (error) {
    console.error("Error checking auth status:", error);
  }
};
```

##### **B. Dropstone Authentication Flow**
1. User opens General Settings
2. `useDropstoneAuth` hook checks for stored token
3. If token exists, validate with Dropstone server
4. Display authentication status and available models
5. Provide authentication dialog for login

```typescript
// Dropstone Authentication Check
const checkAuthStatus = useCallback(async () => {
  const storedToken = localStorage.getItem('dropstone_token');
  const storedUser = localStorage.getItem('dropstone_user');
  
  if (storedToken && storedUser) {
    setToken(storedToken);
    setUserInfo(JSON.parse(storedUser));
    setIsLoggedIn(true);
  }
}, []);
```

#### 2. **Dropstone Authentication Flow**

##### Initial Authentication
1. User triggers authentication (via dialog or model selection)
2. `DropstoneAuthDialog` appears for JWT token input
3. Token is validated against `https://dropstone-server-bjlp.onrender.com/api/user`
4. On success:
   - Token stored in localStorage (`dropstone_token`)
   - User info stored in localStorage (`dropstone_user`)
   - Authentication state updated globally
   - Config file updated via IDE messenger

##### Token Validation
```typescript
// Endpoint: https://dropstone-server-bjlp.onrender.com/api/user
// Headers: Authorization: Bearer <token>
// Response: { user: { name, email, userName, isActiveSubscription, ... } }
```

##### Authentication Expiration Handling
1. **Detection**: API calls return 401/403 or token validation fails
2. **Cleanup**: Remove tokens from localStorage
3. **Notification**: Send `dropstoneAuthExpired` message
4. **UI Update**: Show authentication dialog automatically
5. **Re-authentication**: User can enter new credentials

#### 3. **PearAI Authentication Flow**

##### OAuth2 Flow (VS Code)
1. User initiates login
2. Browser opens WorkOS authorization URL
3. User completes authentication
4. Authorization code returned to VS Code
5. Code exchanged for access/refresh tokens
6. Tokens stored in VS Code secrets

##### Token Refresh
- Automatic refresh every 30 minutes
- Refresh token used to obtain new access token
- Failed refresh triggers re-authentication

### Dropstone Model Integration

#### 1. **DropstoneModelSelector Component**

The General Settings includes a sophisticated model selector that integrates with authentication:

```typescript
// DropstoneModelSelector.tsx
export const DropstoneModelSelector: React.FC = () => {
  const { isLoggedIn, isPremiumUser, fetchAvailableModels } = useDropstoneAuth();
  const [models, setModels] = useState<{ [key: string]: Model }>({});

  useEffect(() => {
    const loadModels = async () => {
      const availableModels = await fetchAvailableModels();
      setModels(availableModels);
    };
    loadModels();
  }, [fetchAvailableModels]);

  return (
    <ModelSelectorContainer>
      <SectionTitle>
        Available Models
        <PlanBadge isPremium={isPremiumUser}>
          {isPremiumUser ? 'Premium' : 'Free'}
        </PlanBadge>
      </SectionTitle>
      
      {/* Free Models */}
      <ModelGrid>
        {freeModels.map((model) => (
          <ModelCard key={model.id} isPremium={false} userHasAccess={true}>
            <ModelName>{model.name}</ModelName>
            <ModelProvider>{model.provider}</ModelProvider>
            <ModelFeatures>
              {getFeatureTags(model.features).map((feature) => (
                <FeatureTag key={feature}>{feature}</FeatureTag>
              ))}
            </ModelFeatures>
          </ModelCard>
        ))}
      </ModelGrid>
      
      {/* Premium Models */}
      {premiumModels.map((model) => (
        <ModelCard 
          key={model.id} 
          isPremium={true} 
          userHasAccess={isPremiumUser}
        >
          {!isPremiumUser && <PremiumBadge>Premium</PremiumBadge>}
          {/* ... model details */}
        </ModelCard>
      ))}
    </ModelSelectorContainer>
  );
};
```

#### 2. **Authentication-Aware Model Selection**

```typescript
// ModelSelect.tsx - Authentication-aware model selection
const handleModelSelect = async (val: string) => {
  const selectedOption = options.find(option => option.value === val);
  
  if (selectedOption?.isDropstone && !isAuthenticated) {
    // Show authentication dialog for Dropstone models
    setShowAuthDialog(true);
    return;
  }
  
  // If authenticated, add Dropstone model to configuration
  if (selectedOption?.isDropstone) {
    await ideMessenger.request("config/addModel", {
      model: {
        title: dropstoneModel.title,
        provider: "openai",
        apiBase: "https://dropstone-server-bjlp.onrender.com/v1",
        apiKey: token,
        requestOptions: {
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          }
        }
      }
    });
  }
};
```

#### 3. **Provider Configuration Integration**

```typescript
// ConfigureProvider.tsx - Authentication-aware provider setup
{isAuthenticated ? (
  // Show available models
  <GridDiv>
    {dynamicPackages.map((pkg) => (
      <ModelPackage
        onClick={(e, dimensionChoices) => {
          const model = {
            ...pkg.params,
            requestOptions: {
              headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
              }
            }
          };
          ideMessenger.post("config/addModel", { model });
        }}
      />
    ))}
  </GridDiv>
) : (
  // Show authentication prompt
  <div className="p-4 border border-orange-500/30 rounded-lg">
    <h3>Authentication Required</h3>
    <p>Connect to Dropstone Server to access AI models</p>
    <CustomModelButton onClick={showAuthDialog}>
      Sign In / Log In
    </CustomModelButton>
  </div>
)}
```

### Authentication Servers and Endpoints

#### 1. **Dropstone Server** (`https://dropstone-server-bjlp.onrender.com`)
- **Login**: `POST /login` - Username/password authentication
- **User Info**: `GET /api/user` - Get user information (requires Bearer token)
- **Models**: `GET /api/models` - Get available models (requires authentication)
- **Public Models**: `GET /api/models/public` - Get public models (no auth required)

#### 2. **PearAI Server** (`http://localhost:3002`)
- **Login**: `/login` - PearAI platform login
- **Dashboard**: `/dashboard` - User dashboard for token generation

#### 3. **Control Plane** (`https://control-plane-api-service-i3dqylpbqa-uc.a.run.app`)
- **Token Refresh**: `POST /auth/refresh` - Refresh authentication tokens
- **Authorization**: WorkOS-based OAuth2 flow

### Token Storage and Management

#### 1. **Browser/GUI Storage**
- **localStorage**: 
  - `dropstone_token`: JWT token for Dropstone authentication
  - `dropstone_user`: User information object
  - `pearai_account_details`: PearAI account information
- **Session Storage**: Temporary authentication state

#### 2. **VS Code Extension Storage**
- **Secrets API**: 
  - `pearai-token`: PearAI access token
  - `pearai-refresh`: PearAI refresh token
  - Session information for authentication providers
- **Settings**: 
  - `dropstoneApiKey`: Dropstone API key in VS Code settings

#### 3. **IntelliJ Extension Storage**
- **PasswordSafe**: Secure credential storage
- **Keys**:
  - `ContinueAccessToken`: Access token
  - `ContinueRefreshToken`: Refresh token
  - `ContinueAccountId`: Account identifier
  - `ContinueAccountLabel`: Account display name

### Authentication Usage in Components

#### 1. **General Settings** (`gui/src/inventory/pearSettings/general.tsx`)
- **Dual authentication display**: Shows both PearAI and Dropstone authentication status
- **User profile management**: Displays user information and logout options
- **API key/token management**: Shows and allows copying of authentication tokens
- **Usage statistics**: Displays account usage and subscription information
- **Model availability**: Shows available models based on authentication status

#### 2. **Model Selection** (`gui/src/components/modelSelection/ModelSelect.tsx`)
- Checks authentication before allowing Dropstone model selection
- Shows authentication dialog for unauthenticated users
- Reloads models after successful authentication

#### 3. **Provider Configuration** (`gui/src/pages/AddNewModel/ConfigureProvider.tsx`)
- Displays authentication status for Dropstone provider
- Shows login options for unauthenticated users
- Loads dynamic model packages for authenticated users

#### 4. **Settings Page** (`gui/src/pages/settings.tsx`)
- Shows authentication status and user profile
- Provides logout functionality
- Displays premium user status

#### 5. **Welcome/Onboarding** (`gui/src/pages/welcome/welcomeGui.tsx`)
- Checks user sign-in status
- Handles authentication during onboarding flow

#### 6. **LLM Integration** (`core/llm/llms/PearAIServer.ts`)
- Validates authentication before API calls
- Handles authentication errors with specific error messages
- Requires both PearAI and Dropstone authentication for model access

### Authentication State Management

#### 1. **React Context Architecture**

```typescript
// DropstoneAuthContext.tsx
interface DropstoneAuthContextType {
  isLoggedIn: boolean;
  loading: boolean;
  userInfo: any;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  showAuthDialog: () => void;
  fetchAvailableModels: () => Promise<any>;
  isPremiumUser: boolean;
}

export const DropstoneAuthProvider: React.FC = ({ children }) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [token, setToken] = useState<string | null>(null);
  
  // Authentication state management
  const checkAuthStatus = useCallback(async () => {
    const storedToken = localStorage.getItem('dropstone_token');
    const storedUser = localStorage.getItem('dropstone_user');
    
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUserInfo(JSON.parse(storedUser));
      setIsLoggedIn(true);
    }
  }, []);
  
  return (
    <DropstoneAuthContext.Provider value={value}>
      {children}
    </DropstoneAuthContext.Provider>
  );
};
```

#### 2. **Cross-Component Communication**

```typescript
// Authentication message handling
useWebviewListener("pearAISignedIn", refreshData);
useWebviewListener("pearAISignedOut", async () => { clearUserData() });
useWebviewListener("pearaiOverlayOpened", refreshData);
useWebviewListener("dropstoneAuthExpired", handleAuthExpiration);
useWebviewListener("dropstoneAuthUpdated", handleAuthUpdate);
```

### Data Types and Interfaces

#### 1. **Authentication Types**

```typescript
// Authentication data structures
export interface Auth {
  accessToken?: string;
  refreshToken?: string;
}

export interface AccountDetails {
  email: string;
  first_name: string;
  last_name: string;
  profile_picture_url: string;
  plan_type: string;
  plan_period_start: number;
  plan_period_end: number;
  is_subscription_active: boolean;
  requests_used: number;
}

export interface UsageDetails {
  percent_credit_used: number;
  remaining_topup_credits: number | null;
  pay_as_you_go_credits: number;
  ttl: number;
}
```

#### 2. **Model Types**

```typescript
// Model data structures
interface Model {
  id: string;
  name: string;
  provider: string;
  category: 'free' | 'premium';
  maxTokens: number;
  features: {
    supportsImages?: boolean;
    supportsComputerUse?: boolean;
    supportsBrowserUse?: boolean;
    supportsPromptCaching?: boolean;
    supportsReasoning?: boolean;
    supportsThinking?: boolean;
  };
}

interface StaticModel {
  id: string;
  name: string;
  provider: string;
  title: string;
}
```

### Security Considerations

#### 1. **Token Security**
- JWT tokens stored in browser localStorage (consider more secure alternatives for production)
- Automatic token cleanup on expiration
- Token validation before API calls
- Secure credential storage in IDE extensions (PasswordSafe, Secrets API)

#### 2. **Error Handling**
- Graceful authentication error handling
- Clear error messages for users
- Automatic re-authentication prompts
- Authentication expiration detection and handling

#### 3. **Cross-Component Communication**
- Message-based authentication state synchronization
- Decoupled architecture prevents authentication state inconsistencies
- Secure token passing between components

### Configuration

#### Environment Variables and Constants
- `PEARAI_AUTH_URL`: `https://dropstone-server-bjlp.onrender.com` (Dropstone server)
- `SERVER_URL`: `https://dropstone-server-bjlp.onrender.com` (Core server URL)
- Control plane URL: `https://control-plane-api-service-i3dqylpbqa-uc.a.run.app`

#### Authentication Message Types
- `dropstoneAuthExpired`: Authentication expiration notification
- `dropstoneAuthUpdated`: Authentication update notification
- `didChangeControlPlaneSessionInfo`: Control plane session changes
- `pearAISignedIn`: PearAI authentication success
- `pearAISignedOut`: PearAI authentication logout

### Testing Authentication

#### 1. **Manual Testing**
- Test login/logout flows for both authentication systems
- Verify token expiration handling
- Test cross-component authentication sync
- Verify model selection with authentication requirements

#### 2. **Authentication Scenarios**
- Fresh installation (no stored tokens)
- Token expiration during usage
- Network connectivity issues
- Invalid token scenarios
- Dual authentication scenarios (PearAI + Dropstone)

### Troubleshooting

#### Common Issues
1. **Authentication Dialog Not Appearing**: Check message listeners and context providers
2. **Token Not Persisting**: Verify localStorage access and IDE messenger communication
3. **API Authentication Errors**: Check server connectivity and token validity
4. **Cross-Component Sync Issues**: Verify message passing and global context updates
5. **Model Selection Issues**: Verify authentication state before model configuration
6. **Dual Authentication Conflicts**: Check authentication precedence and state management

#### Debug Information
- Authentication state logged to console
- Token validation results logged
- API response status codes logged
- Error messages provide specific guidance for resolution
- Model loading and authentication integration logged

### General Settings Specific Features

#### 1. **Unified Authentication Interface**
- Single interface for managing both PearAI and Dropstone authentication
- Real-time authentication status display
- Seamless switching between authentication methods

#### 2. **Enhanced User Experience**
- Profile image display with fallback avatars
- Usage statistics and subscription information
- Premium user badge and feature access
- One-click token copying functionality

#### 3. **Editor Integration**
- Direct links to editor settings
- Keyboard shortcut configuration
- Settings synchronization across devices
- Dropstone Agent settings integration

This authentication system provides a robust, multi-platform solution for securing access to PearAI and Dropstone services while maintaining a smooth user experience across different development environments. The General Settings interface serves as the central hub for managing all authentication aspects, providing users with comprehensive control over their authentication state and access to AI models and services. 