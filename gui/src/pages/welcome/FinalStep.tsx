"use client";

import { Button } from "@/components/ui/button";
import { IdeMessengerContext } from "@/context/IdeMessenger";
import { FolderOpen } from "lucide-react";
import { useContext, useEffect } from "react";

export default function FinalStep({ onNext, startOnboardingAgain }: { onNext: () => void, startOnboardingAgain: () => void }) {

  const selectedTools = JSON.parse(localStorage.getItem('onboardingSelectedTools'));

  const initiateInstallations = () => {
    ideMessenger.post("pearAIinstallation", { tools: selectedTools });
    ideMessenger.post("markNewOnboardingComplete", undefined);
  };

  const handleOpenFolder = () => {
    ideMessenger.post("pearWelcomeOpenFolder", undefined);
    initiateInstallations();
    onNext() // navigates to inventory page
  };

  const handleClose = () => {
    initiateInstallations();
    onNext() // navigates to inventory page
  };

  useEffect(() => {
    // unlock overlay when we get to last page
    ideMessenger.post("unlockOverlay", undefined);
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        handleOpenFolder();
        onNext()
      }
      if (event.key === 'Escape') {
        initiateInstallations();
        onNext()
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  const ideMessenger = useContext(IdeMessengerContext);
  return (
    <div className="h-full flex flex-col items-center justify-center md:p-6 lg:p-10">
      {/* <div className="w-24 h-24 md:w-32 md:h-32 flex items-center justify-center">
            <img
              src={`${window.vscMediaUrl}/logos/pearai-green.svg`}
              alt="Drosptone"
              className="w-full h-full object-contain"
            />
          </div> */}
      <div className="text-2xl md:text-3xl lg:text-4xl text-foreground mb-7">
        You're all set!
      </div>
      <div className="flex flex-col items-center gap-4 ">
        <Button
          className="w-[250px] md:w-[280px] text-button-foreground bg-button hover:bg-button-hover py-5 px-2 md:py-6 text-base md:text-lg cursor-pointer relative"
          onClick={handleOpenFolder}
        >
          <div className="flex items-center justify-center w-full gap-2">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5" />
              <span>Open folder</span>
            </div>
          </div>
        </Button>
        <div
          onClick={handleClose}
          className="flex items-center gap-2 cursor-pointer"
        >
          <span className="text-center w-full">Close</span>
        </div>
        {
          process.env.NODE_ENV === "development" && (
            <div
              onClick={startOnboardingAgain}
              className="flex items-center gap-2 cursor-pointer absolute bottom-20"
            >
              <span className="text-center w-full">START ONBOARDING AGAIN (shown in dev)</span>
            </div>
          )
        }
      </div>
    </div>
  );
}
