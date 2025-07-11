import { useWebviewListener } from "@/hooks/useWebviewListener";
import { useDropstoneAuth } from "@/context/DropstoneAuthContext";
import { getLogoPath } from "./ImportExtensions";

export default function SignIn({ onNext, isLoggedIn }: { onNext: () => void, isLoggedIn: boolean }) {
  const { userInfo } = useDropstoneAuth();

  useWebviewListener("pearAISignedIn", async () => {
    onNext();
  });

  return (
    <div className="flex flex-col items-center justify-center md:p-6 lg:p-10 gap-5">
      <div className="flex flex-col items-center justify-center gap-1">
        <div className="text-center text-2xl font-['Inter']">
          {isLoggedIn ? `Welcome back, ${userInfo?.name || userInfo?.userName || 'User'}!` : 'Sign in to Drosptone'}
        </div>
        <div className="opacity-80 text-xs font-normal font-['Inter'] leading-[18px]">
          {isLoggedIn ? 'You are already signed in' : '(Opens in browser)'}
        </div>
      </div>
      <img src={getLogoPath("pearai-green.svg")} className="w-36 h-36" alt="Drosptone" />
      {isLoggedIn && (
        <div className="text-center text-sm opacity-70">
          Ready to continue with Drosptone
        </div>
      )}
    </div>
  );
}
