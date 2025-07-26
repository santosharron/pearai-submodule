import {
  Button,
} from "@/components";
import { Progress } from "@/components/ui/progress";
import { useContext, useMemo, useState, useEffect } from "react";
import { IdeMessengerContext } from "@/context/IdeMessenger";
import { useDropstoneAuth } from "@/context/DropstoneAuthContext";
import { ChevronRight, ExternalLink, X } from "lucide-react";
import { useWebviewListener } from "@/hooks/useWebviewListener";
import { useAccountSettings } from "./hooks/useAccountSettings";
import { Eye, Files } from "lucide-react";
import { LoadingPlaceholder } from "./components/LoadingPlaceholder";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getMetaKeyLabel } from "@/util";

export const UPGRADE_LINK = "https://dropstone.io/pricing";

const AccountSettings = () => {
  const {
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
    refreshData,
  } = useAccountSettings();

  const {
    isLoggedIn: isDropstoneLoggedIn,
    userInfo: dropstoneUserInfo,
    token: dropstoneToken,
    showAuthDialog: showDropstoneAuthDialog,
    logout: dropstoneLogout
  } = useDropstoneAuth();

  const [showCopiedTooltip, setShowCopiedTooltip] = useState(false);

  const handleCopyApiKey = async () => {
    await copyApiKey();
    setShowCopiedTooltip(true);
    setTimeout(() => setShowCopiedTooltip(false), 1000);
  };

  const ideMessenger = useContext(IdeMessengerContext);

  useWebviewListener("pearAISignedIn", refreshData);
  useWebviewListener("pearAISignedOut", async () => { clearUserData() });
  useWebviewListener("pearaiOverlayOpened", refreshData);

  const timeLeftUntilRefill = useMemo(() => {
    if (!usageDetails?.ttl || usageDetails?.ttl < 0) return "-";
    const seconds = usageDetails.ttl;
    const hours = seconds / 3600;
    const days = hours / 24;

    if (days >= 1) {
      return `${Math.floor(days)} days left`;
    } else if (hours >= 1) {
      return `${Math.floor(hours)} hours left`;
    } else {
      return `${Math.floor(seconds)} seconds left`;
    }
  }, [usageDetails]);

  const isAuthenticated = isDropstoneLoggedIn || !!accountDetails;
  const userDisplayInfo = dropstoneUserInfo || accountDetails;

  // ------------------------------------------------------------
  // DEBUG: log whenever authentication-related state changes so
  // we can verify that AccountSettings detects login/logout and
  // bridges tokens correctly.
  // ------------------------------------------------------------
  useEffect(() => {
    console.log('[AccountSettings] auth state', {
      isAuthenticated,
      isDropstoneLoggedIn,
      accountDetails,
      dropstoneUserInfo,
    });
  }, [isAuthenticated, isDropstoneLoggedIn, accountDetails, dropstoneUserInfo]);

  return (
    <div className="border border-solidd h-full flex-col justify-start items-start gap-5 inline-flex overflow-auto no-scrollbar relative">
      {/* Close Button */}
      <button
        className="absolute top-2 right-2 z-10 p-2 rounded-full bg-transparent border-none text-[#888888] cursor-pointer flex items-center justify-center transition-all duration-200 hover:bg-white/10 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={() => ideMessenger.post("closeOverlay", undefined)}
        aria-label="Close"
      >
        <X size={20} />
      </button>
      <div className="border border-solidd w-full flex flex-col justify-start items-start gap-5">
        <div className="justify-center items-center inline-flex">
          <div className="text-lg font-['Inter']">General</div>
        </div>

        {isAuthenticated ? (
          <>
            <div className="self-stretch rounded-lg justify-start items-center gap-3 inline-flex">
              {accountDetails?.profile_picture_url ? (
                <img
                  className="w-8 h-8 rounded-[32px]"
                  src={accountDetails.profile_picture_url}
                  alt="Profile"
                />
              ) : isDropstoneLoggedIn ? (
                dropstoneUserInfo?.imageUrl || dropstoneUserInfo?.profile_picture_url || dropstoneUserInfo?.profilePicture || dropstoneUserInfo?.avatar ? (
                  <img
                    className="w-8 h-8 rounded-[32px]"
                    src={dropstoneUserInfo.imageUrl || dropstoneUserInfo.profile_picture_url || dropstoneUserInfo.profilePicture || dropstoneUserInfo.avatar}
                    alt="Profile"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-[32px] bg-green-100 flex items-center justify-center">
                    <div className="text-green-600 text-sm font-bold">
                      {dropstoneUserInfo?.userName?.charAt(0)?.toUpperCase() ||
                       dropstoneUserInfo?.name?.charAt(0)?.toUpperCase() ||
                       '🪨'}
                    </div>
                  </div>
                )
              ) : null}
              <div className="grow shrink basis-0 flex-col justify-center items-start gap-1 inline-flex">
                <div className="self-stretch text-xs font-normal font-['Inter']">
                  {isDropstoneLoggedIn
                    ? (dropstoneUserInfo?.userName || dropstoneUserInfo?.name || "Dropstone User")
                    : `${accountDetails?.first_name} ${accountDetails?.last_name || ""}`
                  }
                </div>
                <div className="opacity-50 text-xs font-normal font-['Inter']">
                  {isDropstoneLoggedIn
                    ? "Connected to Dropstone Server"
                    : accountDetails?.email
                  }
                </div>
              </div>
              <Button onClick={isDropstoneLoggedIn ? dropstoneLogout : handleLogout}>
                Log out
              </Button>
            </div>

            {accountDetails && (
              <>
                <div className="opacity-50 text-xs font-normal font-['Inter']">
                  USAGE
                </div>
                <div className="flex w-full gap-3">
                  <div className="flex-1 border border-solid p-4 rounded-lg flex flex-col gap-3">
                    <div className="font-normal font-['Inter']">Dropstone Credits</div>
                    <div className="self-stretch justify-start items-baseline gap-1 inline-flex">
                      <div className="text-2xl font-['Inter']">
                        {isUsageLoading ? (
                          <LoadingPlaceholder />
                        ) : (
                          `${usageDetails ? usageDetails.percent_credit_used.toFixed(2) : 0}%`
                        )}
                      </div>
                      <div className="opacity-50 text-xs font-normal font-['Inter']">
                        used
                      </div>
                    </div>
                    <div data-svg-wrapper className="w-full">
                      <Progress
                        value={usageDetails ? usageDetails.percent_credit_used : 0}
                        className={`h-2 bg-input [&>div]:bg-button ${isUsageLoading ? 'animate-pulse' : ''}`}
                      />
                    </div>
                    <div className="opacity-50 text-xs font-normal font-['Inter']">
                      Credits refills monthly ({timeLeftUntilRefill})
                    </div>
                  </div>
                  <div className="flex-1 border border-solid p-4 rounded-lg flex flex-col gap-3">
                    <div className="font-normal font-['Inter']">
                      Pay-As-You-Go Extra Credits
                    </div>
                    <div className="self-stretch justify-start items-baseline gap-1 inline-flex">
                      <div className="text-2xl font-['Inter']">
                        {isUsageLoading ? (
                          <LoadingPlaceholder />
                        ) : (
                          `$${usageDetails ? usageDetails.pay_as_you_go_credits.toFixed(2) : 0}`
                        )}
                      </div>
                      <div className="opacity-50 text-xs font-normal font-['Inter']">
                        used
                      </div>
                    </div>
                    <div>
                      <div className="opacity-50 text-xs font-normal font-['Inter'] -mt-1">
                        Credits billed monthly
                      </div>
                      <a
                        className="text-xs font-normal font-['Inter'] no-underline"
                        href="https://dropstone.io/pay-as-you-go"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Read More
                      </a>
                    </div>
                  </div>
                </div>

                {/* Agent Usage Display */}
                {(isDropstoneLoggedIn || agentUsageDetails) && (
                  <div className="flex flex-col w-full justify-center gap-3">
                    <div className="border border-solid p-4 rounded-lg flex flex-col gap-3">
                      <div className="font-normal font-['Inter']">Agent Actions</div>
                      <div className="self-stretch justify-start items-baseline gap-1 inline-flex">
                        <div className="text-2xl font-['Inter']">
                          {isAgentUsageLoading ? (
                            <LoadingPlaceholder />
                          ) : agentUsageDetails?.isUnlimited ? (
                            "∞"
                          ) : (
                            `${agentUsageDetails?.agentActionsUsed || 0}/${agentUsageDetails?.agentActionsLimit || 20}`
                          )}
                        </div>
                        <div className="opacity-50 text-xs font-normal font-['Inter']">
                          {agentUsageDetails?.isUnlimited ? "unlimited" : "used today"}
                        </div>
                      </div>
                      {!agentUsageDetails?.isUnlimited && (
                        <div data-svg-wrapper className="w-full">
                          <Progress
                            value={agentUsageDetails ? (agentUsageDetails.agentActionsUsed / agentUsageDetails.agentActionsLimit) * 100 : 0}
                            className={`h-2 bg-input [&>div]:bg-button ${isAgentUsageLoading ? 'animate-pulse' : ''}`}
                          />
                        </div>
                      )}
                      <div className="opacity-50 text-xs font-normal font-['Inter']">
                        {agentUsageDetails?.isUnlimited 
                          ? "Premium Plan - Unlimited agent actions"
                          : agentUsageDetails 
                            ? `${typeof agentUsageDetails.agentActionsRemaining === 'number' ? agentUsageDetails.agentActionsRemaining : 0} actions remaining until tomorrow`
                            : "Agent actions reset daily"
                        }
                      </div>
                    </div>
                  </div>
                )}

                {usageDetails?.remaining_topup_credits && <div className="flex flex-col w-full justify-center gap-3">
                  <div className="border border-solid p-4 rounded-lg flex flex-col gap-3">
                    <div className="font-normal font-['Inter']">TopUp Credits</div>
                    <div className="self-stretch justify-start items-baseline gap-1 inline-flex">
                      <div className="text-2xl font-['Inter']">
                        ${usageDetails.remaining_topup_credits.toFixed(2)}
                      </div>
                      <div className="opacity-50 text-xs font-normal font-['Inter']">
                        remaining
                      </div>
                    </div>
                  </div>
                </div>}

                <div className="flex flex-col w-full justify-center gap-3">
                  <div className="opacity-50 text-xs font-normal font-['Inter']">
                    PLAN
                  </div>
                  <div className="flex gap-3">
                    <div className="border border-solid w-1/2 p-3 rounded-lg">
                      {accountDetails.plan_type.includes("free") ? "" : "Pro · "}{" "}
                      <span className="capitalize">
                        {accountDetails.plan_type.toLowerCase()}
                      </span>
                    </div>
                    <div className="border border-solid w-1/2 p-3 rounded-lg">
                      {new Date(accountDetails.plan_period_start * 1000).toLocaleDateString()}
                      {" "}-{" "}
                      {accountDetails.plan_period_end
                        ? new Date(
                          accountDetails.plan_period_end * 1000,
                        ).toLocaleDateString()
                        : "Now"}
                      &nbsp;
                      <span className="opacity-50  text-xs font-normal font-['Inter']">
                        Current Period
                      </span>
                    </div>
                  </div>
                </div>

                <div className="self-stretch pb-2 flex-col justify-start items-start gap-3 flex">
                  <a
                    className="p-3 bg-list-hoverBackground rounded-lg border border-solid justify-between items-center flex self-stretch no-underline text-inherit hover:text-inherit"
                    href={UPGRADE_LINK}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <div className="text-xs font-normal font-['Inter']">
                      Upgrade
                    </div>
                    <ExternalLink className="size-4" />
                  </a>
                </div>
              </>
            )}

            <div className="flex flex-col w-full gap-3">
              <div className="flex">
                <div className="grow opacity-50 text-xs font-normal font-['Inter']">
                  {isDropstoneLoggedIn ? "JWT Token" : "API Key"}
                </div>
                <div className="flex gap-3">
                  <div
                    className="cursor-pointer w-7 h-7 flex items-center justify-center rounded-md hover:bg-background transition-colors"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    <Eye size={18} />
                  </div>
                  <TooltipProvider>
                    <Tooltip open={showCopiedTooltip}>
                      <TooltipTrigger asChild>
                        <div
                          className="cursor-pointer w-7 h-7 flex items-center justify-center rounded-md hover:bg-background transition-colors"
                          onClick={async () => {
                            try {
                              const tokenToCopy = dropstoneToken || auth?.accessToken;
                              if (tokenToCopy) {
                                await navigator.clipboard.writeText(tokenToCopy);
                                setShowCopiedTooltip(true);
                                setTimeout(() => setShowCopiedTooltip(false), 1000);
                              }
                            } catch (error) {
                              console.error("Failed to copy token:", error);
                            }
                          }}
                        >
                          <Files size={16} />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" sideOffset={-10}>
                        <p className="text-xs px-2 py-1 rounded-md bg-background">Copied!</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
              <div className="p-3 self-stretch bg-list-hoverBackground rounded-lg flex items-center text-ellipsis whitespace-normal overflow-hidden relative text-nowrap">
                <div className="w-full overflow-hidden relative">
                  <div className="pr-8">
                    {showApiKey ? (dropstoneToken || auth?.accessToken) : "•".repeat(1000)}
                  </div>
                  {!showApiKey && <div className="absolute inset-y-0 right-0 w-96 bg-gradient-to-r from-transparent to-list-hoverBackground pointer-events-none"></div>}
                </div>
              </div>
            </div>

          </>
        ) : (
          <div className="self-stretch rounded-lg justify-start items-center gap-3 inline-flex">
            <Button
              className="!bg-blue-600 !text-white !border-none hover:!bg-blue-700 rounded-full px-6 py-2 font-medium transition-colors duration-200"
              onClick={() => {
                // Prioritize Dropstone authentication
                if (showDropstoneAuthDialog) {
                  showDropstoneAuthDialog();
                } else {
                  handleLogin();
                }
              }}
            >
              Log in
            </Button>
            <div className="opacity-50 text-xs font-normal font-['Inter']">
              Login to use Dropstone Pro services
            </div>
          </div>
        )}

        <div className="flex flex-col w-full justify-center gap-3">
          <div className="opacity-50 text-xs font-normal font-['Inter']">
            EDITOR SETTINGS
          </div>
          <div className="flex gap-3">
            <a
              className="flex-1 p-3 bg-list-hoverBackground rounded-lg border border-solid justify-between items-center flex self-stretch no-underline text-inherit hover:text-inherit"
              href="command:workbench.action.openSettings"
            >
              <div className="text-xs font-normal font-['Inter']">
                Open editor settings
              </div>
              <ChevronRight className="size-4" />
            </a>
            <a
              className="flex-1 p-3 bg-list-hoverBackground rounded-lg border border-solid justify-between items-center flex self-stretch no-underline text-inherit hover:text-inherit"
              href="command:workbench.action.openGlobalKeybindings"
            >
              <div className="text-xs font-normal font-['Inter']">
                Configure keyboard shortcuts
              </div>
              <ChevronRight className="size-4" />
            </a>
            <a
              className="flex-1 p-3 bg-list-hoverBackground rounded-lg border border-solid justify-between items-center flex self-stretch no-underline text-inherit hover:text-inherit"
              href="command:workbench.userDataSync.actions.turnOn"
            >
              <div className="text-xs font-normal font-['Inter']">
                Backup and sync settings
              </div>
              <ChevronRight className="size-4" />
            </a>
          </div>
          <div className="opacity-50 text-xs font-normal font-['Inter']">
            Settings can also be configured with <span className="px-1 py-px rounded-md border-2 border-solid justify-center items-center gap-0.5">
              <span className="text-center font-['Inter']">
                {getMetaKeyLabel()}
              </span>
              <span className="opacity-50 font-['Inter'] leading-[17px] mx-0.5">
                +
              </span>
              <span className="font-medium font-['SF Mono'] leading-3">
                Shift
              </span>
              <span className="opacity-50 font-['Inter'] leading-[17px] mx-0.5">
                +
              </span>
              <span className="font-medium font-['SF Mono'] leading-3">
                P
              </span>
            </span>
            &nbsp;
            via the Command Pallete.
          </div>
        </div>
        <div className="flex flex-col w-full justify-center gap-3">
          <div className="opacity-50 text-xs font-normal font-['Inter']">
            DROPSTONE AGENT SETTINGS
          </div>
          <div
            className="flex-1 p-3 bg-list-hoverBackground cursor-pointer rounded-lg border border-solid justify-between items-center flex self-stretch no-underline text-inherit hover:text-inherit"
            onClick={() => {
              ideMessenger.post("closeOverlay", undefined);
              ideMessenger.post("invokeVSCodeCommandById", {
                commandId: "dropstone-roo-cline.SidebarProvider.focus",
              });
              ideMessenger.post("invokeVSCodeCommandById", {
                commandId: "roo-cline.settingsButtonClicked",
              });
            }}
          >
            <div className="text-xs font-normal font-['Inter']">
              Open Dropstone Agent Settings
            </div>
            <ChevronRight className="size-4" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountSettings;
