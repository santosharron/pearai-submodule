import React from 'react';
import { useDropstoneAuth } from '../../context/DropstoneAuthContext';
import { Button } from '..';

export const AuthenticatedComponent: React.FC = () => {
    const {
        isLoggedIn,
        loading,
        userInfo,
        logout,
        showAuthDialog
    } = useDropstoneAuth();

    if (loading) {
        return <div>Loading authentication status...</div>;
    }

    if (!isLoggedIn) {
        return (
            <div>
                <p>You are not logged in to Dropstone.</p>
                <Button onClick={showAuthDialog}>
                    Login to Dropstone
                </Button>
            </div>
        );
    }

    return (
        <div>
            <h3>Dropstone Authentication Status</h3>
            <p>✅ Logged in as: {userInfo?.username || 'Unknown user'}</p>
            <p>Status: Authenticated</p>
            <Button onClick={logout}>
                Logout
            </Button>
        </div>
    );
};

export default AuthenticatedComponent;
