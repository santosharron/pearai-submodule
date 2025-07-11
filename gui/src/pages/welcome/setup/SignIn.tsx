import { useWebviewListener } from "@/hooks/useWebviewListener";
import { useDropstoneAuth } from "@/context/DropstoneAuthContext";
import { getLogoPath } from "./ImportExtensions";
import { Button } from "@/components";
import { useContext, useEffect, useState } from "react";
import { IdeMessengerContext } from "@/context/IdeMessenger";

export default function SignIn({ onNext, isLoggedIn }: { onNext: () => void, isLoggedIn: boolean }) {
  const { userInfo, isLoggedIn: isDropstoneLoggedIn, showAuthDialog: showDropstoneAuthDialog } = useDropstoneAuth();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const ideMessenger = useContext(IdeMessengerContext);

  useWebviewListener("pearAISignedIn", async () => {
    console.log("PearAI authentication completed");
    console.log("[SignIn] Calling onNext() from pearAISignedIn");
    onNext();
  });

  // Listen for Dropstone authentication updates
  useWebviewListener("dropstoneAuthUpdated", async (data) => {
    console.log("Dropstone authentication updated:", data);
    console.log("[SignIn] Calling onNext() from dropstoneAuthUpdated");
    setIsAuthenticating(false);
    onNext();
  });

  // Listen for authentication errors
  useWebviewListener("dropstoneAuthExpired", async (data) => {
    console.log("Dropstone authentication expired:", data);
    setIsAuthenticating(false);
  });

  // Check authentication state on component mount
  useEffect(() => {
    console.log('[SignIn] auth state', {
      isLoggedIn,
      isDropstoneLoggedIn,
      userInfo,
    });
  }, [isLoggedIn, isDropstoneLoggedIn, userInfo]);

  const handleLogin = async () => {
    try {
      setIsAuthenticating(true);

      // Prioritize Dropstone authentication
      if (showDropstoneAuthDialog) {
        console.log("Initiating Dropstone authentication");
        showDropstoneAuthDialog();
      } else {
        // Fallback to legacy PearAI authentication
        console.log("Initiating PearAI authentication");
        ideMessenger.post("pearaiLogin", undefined);
      }
    } catch (error) {
      console.error("Authentication failed:", error);
      setIsAuthenticating(false);
    }
  };

  const isAuthenticated = isDropstoneLoggedIn || isLoggedIn;
  const userDisplayInfo = userInfo || { name: 'User' };

  console.log('[SignIn] Component rendered', {
    isAuthenticated,
    isDropstoneLoggedIn,
    isLoggedIn,
    userInfo,
    userDisplayInfo
  });

  return (
    <div className="flex flex-col items-center justify-center md:p-6 lg:p-10 gap-5">
      <div className="flex flex-col items-center justify-center gap-1">
        <div className="text-center text-2xl font-['Inter']">
          {isAuthenticated ? `Welcome back, ${userDisplayInfo?.name || userDisplayInfo?.userName || 'User'}!` : 'Sign in to Dropstone'}
        </div>
        <div className="opacity-80 text-xs font-normal font-['Inter'] leading-[18px]">
          {isAuthenticated ? 'You are already signed in' : '(Opens in browser)'}
        </div>
      </div>

      <img src={getLogoPath("pearai-green.svg")} className="w-36 h-36" alt="Dropstone" />

      {isAuthenticated ? (
        <div className="flex flex-col items-center gap-3">
        <div className="text-center text-sm opacity-70">
            Ready to continue with Dropstone
          </div>
          <Button
            onClick={() => {
              console.log("[SignIn] Continue button clicked");
              onNext();
            }}
            className="!bg-green-600 !text-white !border-none hover:!bg-green-700 rounded-full px-6 py-2 font-medium transition-colors duration-200"
          >
            Continue
          </Button>
        </div>
      ) : (
        <Button
          onClick={handleLogin}
          disabled={isAuthenticating}
          className="!bg-blue-600 !text-white !border-none hover:!bg-blue-700 rounded-full px-6 py-2 font-medium transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isAuthenticating ? 'Signing in...' : 'Sign in'}
        </Button>
      )}
    </div>
  );
}
