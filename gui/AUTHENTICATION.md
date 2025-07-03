# Dropstone Authentication System

This document explains how the Dropstone authentication system works, particularly how it handles authentication expiration and automatic logout/re-authentication flows.

## Overview

The Dropstone authentication system consists of several components that work together to provide seamless authentication handling:

1. **DropstoneAuthContext**: Manages authentication state globally
2. **DropstoneHandler**: API provider that detects authentication errors
3. **DropstoneAuthDialog**: UI component for user authentication
4. **Message-based communication**: Enables cross-component auth expiration notifications

## Authentication Flow

### Initial Authentication
1. User enters credentials in `DropstoneAuthDialog`
2. Credentials are validated against the Dropstone server
3. JWT token is stored in localStorage
4. Authentication context updates to reflect logged-in state

### Authentication Expiration Detection
Authentication expiration can be detected in multiple ways:

1. **API Response Status**: HTTP 401/403 responses from Dropstone API calls
2. **Token Validation**: When validating stored tokens against the server
3. **Error Messages**: Specific error messages indicating token expiration

### Automatic Logout and Re-authentication Flow

When authentication expires:

1. **Detection**: The `DropstoneHandler` detects authentication errors
2. **Cleanup**: Stored token is removed from localStorage
3. **Notification**: A message is posted to notify the GUI layer
4. **Context Update**: `DropstoneAuthContext` receives the message and updates state
5. **User Logout**: User is automatically logged out
6. **Auth Dialog**: Authentication dialog is automatically shown
7. **Re-authentication**: User can enter credentials to re-authenticate

## Implementation Details

### DropstoneHandler (API Layer)

```typescript
private handleAuthenticationError(): void {
    // Clear stored token
    this.token = null
    if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem('dropstone_token')
    }

    // Notify the GUI about authentication expiration
    if (typeof window !== 'undefined') {
        window.postMessage({
            messageType: 'dropstoneAuthExpired',
            data: {}
        }, '*');
    }
}
```

### DropstoneAuthContext (State Management)

```typescript
const handleAuthExpired = useCallback(() => {
    console.log('Authentication expired, logging out user');
    logout();
    showAuthDialog();
}, [logout, showAuthDialog]);

useEffect(() => {
    // Listen for authentication expiration events
    const handleMessage = (event: MessageEvent) => {
        if (event.data.messageType === 'dropstoneAuthExpired') {
            handleAuthExpired();
        }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
}, [checkAuthStatus, handleAuthExpired]);
```

## Usage in Components

Components can use the authentication context to handle authentication states:

```typescript
import { useDropstoneAuth } from '../context/DropstoneAuthContext';

const MyComponent = () => {
    const { isLoggedIn, loading, showAuthDialog } = useDropstoneAuth();

    if (loading) return <div>Loading...</div>;

    if (!isLoggedIn) {
        return (
            <div>
                <p>Please log in to continue</p>
                <button onClick={showAuthDialog}>Login</button>
            </div>
        );
    }

    return <div>Authenticated content</div>;
};
```

## Key Features

### Automatic Token Cleanup
- Expired tokens are automatically removed from localStorage
- Prevents invalid tokens from being reused

### Non-blocking Authentication
- Authentication dialog appears automatically when needed
- Users can continue using other parts of the application
- Re-authentication is seamless

### Cross-component Communication
- Uses window.postMessage for reliable communication
- Decoupled architecture allows API layer to notify GUI layer
- Message-based approach is framework-agnostic

### Error Handling
- Multiple detection methods ensure errors are caught
- Graceful degradation when authentication fails
- Clear error messages and recovery paths

## Security Considerations

1. **Token Storage**: Tokens are stored in localStorage (consider more secure alternatives for production)
2. **Token Validation**: Tokens are validated against the server before use
3. **Automatic Cleanup**: Expired tokens are immediately removed
4. **Error Boundaries**: Authentication errors are contained and handled gracefully

## Configuration

The authentication system uses the following configuration:

- **PEARAI_AUTH_URL**: Base URL for the Dropstone authentication server
- **Token Storage Key**: `'dropstone_token'` in localStorage
- **Message Type**: `'dropstoneAuthExpired'` for expiration notifications

## Testing Authentication Expiration

To test the authentication expiration flow:

1. Log in to Dropstone
2. Manually expire the token on the server side
3. Make an API call that requires authentication
4. Observe automatic logout and re-authentication prompt

This system ensures users have a smooth experience even when authentication expires, with minimal disruption to their workflow.
