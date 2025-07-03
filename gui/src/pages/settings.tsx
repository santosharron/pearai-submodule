import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { ContinueConfig } from "core";
import { useContext, useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import {
  Button,
  Hr,
  NumberInput,
  TextArea,
  lightGray,
  vscBackground,
  vscForeground,
  vscInputBackground,
} from "../components";
import InfoHover from "../components/InfoHover";
import Loader from "../components/loaders/Loader";
import { IdeMessengerContext } from "../context/IdeMessenger";
import { useDropstoneAuth } from "../context/DropstoneAuthContext";
import { RootState } from "../redux/store";
import { getFontSize, getPlatform } from "../util";
import { setLocalStorage } from "../util/localStorage";
import { DropstoneModelSelector } from "../components/modelSelection/DropstoneModelSelector";

const CancelButton = styled(Button)`
  background-color: transparent;
  color: ${lightGray};
  border: 1px solid ${lightGray};
  &:hover {
    background-color: ${lightGray};
    color: black;
  }
`;

const SaveButton = styled(Button)`
  &:hover {
    opacity: 0.8;
  }
`;

const Slider = styled.input.attrs({ type: "range" })`
  --webkit-appearance: none;
  width: 100%;
  background-color: ${vscInputBackground};
  outline: none;
  border: none;
  opacity: 0.7;
  -webkit-transition: 0.2s;
  transition: opacity 0.2s;
  &:hover {
    opacity: 1;
  }
  &::-webkit-slider-runnable-track {
    width: 100%;
    height: 8px;
    cursor: pointer;
    background: ${lightGray};
    border-radius: 4px;
  }
  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 8px;
    height: 8px;
    cursor: pointer;
    margin-top: -3px;
  }
  &::-moz-range-thumb {
    width: 8px;
    height: 8px;
    cursor: pointer;
    margin-top: -3px;
  }

  &:focus {
    outline: none;
    border: none;
  }
`;

const ConfigJsonButton = styled(Button)`
  padding: 2px 4px;
  margin-left: auto;
  margin-right: 4px;
  background-color: transparent;
  color: ${vscForeground};
  border: 1px solid ${lightGray};
  &:hover {
    background-color: ${lightGray};
  }
`;

const DropstoneSection = styled.div`
  padding: 16px;
  border: 1px solid ${lightGray};
  border-radius: 8px;
  margin-bottom: 16px;
  background-color: ${vscInputBackground};
`;

const UserProfile = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const ProfileImage = styled.img`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid ${lightGray};
  object-fit: cover;
`;

const ProfileInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const ProfileName = styled.div`
  font-weight: 600;
  color: ${vscForeground};
  font-size: 14px;
`;

const ProfileEmail = styled.div`
  color: ${lightGray};
  font-size: 12px;
`;

const AuthButton = styled(Button)`
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);

  &:hover {
    background: linear-gradient(135deg, #5a6fd8 0%, #6a4190 100%);
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
  }
`;

const LogoutButton = styled(Button)`
  background: linear-gradient(135deg, #ff7e7e 0%, #ff4757 100%);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  margin-left: auto;
  transition: all 0.3s ease;
  box-shadow: 0 2px 10px rgba(255, 71, 87, 0.3);

  &:hover {
    background: linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%);
    transform: translateY(-1px);
    box-shadow: 0 4px 15px rgba(255, 71, 87, 0.5);
  }
`;

const AvatarFallback = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid ${lightGray};
  background-color: #007acc;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  font-size: 16px;
`;

const ALL_MODEL_ROLES = ["default", "summarize", "edit", "chat"];

// Helper function to get user initials
const getUserInitials = (userInfo: any): string => {
  if (userInfo.name) {
    return userInfo.name
      .split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
  if (userInfo.userName) {
    return userInfo.userName.slice(0, 2).toUpperCase();
  }
  if (userInfo.email) {
    return userInfo.email.slice(0, 2).toUpperCase();
  }
  return 'U';
};

function Settings() {
  const formMethods = useForm<ContinueConfig>();
  const onSubmit = (data: ContinueConfig) => console.log(data);

  const ideMessenger = useContext(IdeMessengerContext);
  const { isLoggedIn, userInfo, loading: authLoading, showAuthDialog, logout } = useDropstoneAuth();
  const [imageError, setImageError] = useState(false);

  const navigate = useNavigate();
  const config = useSelector((state: RootState) => state.state.config);
  const dispatch = useDispatch();

  const submitChanges = () => {
    // TODO
    // if (!client) return;
    // const systemMessage = formMethods.watch("system_message") as
    //   | string
    //   | undefined;
    // const temperature = formMethods.watch("temperature") as number | undefined;
    // // const models = formMethods.watch("models");
    // client.setSystemMessage(systemMessage || "");
    // if (temperature) client.setTemperature(temperature);
    // if (models) {
    //   for (const role of ALL_MODEL_ROLES) {
    //     if (models[role]) {
    //       client.setModelForRole(role, models[role] as string, models[role]);
    //     }
    //   }
    // }
  };

  const submitAndLeave = () => {
    submitChanges();
    navigate("/");
  };

  useEffect(() => {
    if (!config) return;

    formMethods.setValue("systemMessage", config.systemMessage);
    formMethods.setValue(
      "completionOptions.temperature",
      config.completionOptions?.temperature,
    );
  }, [config]);

  // Reset image error when userInfo changes
  useEffect(() => {
    setImageError(false);
  }, [userInfo]);

  return (
    <FormProvider {...formMethods}>
      <div className="overflow-y-scroll">
        <div
          className="items-center flex sticky top-0"
          style={{
            borderBottom: `0.5px solid ${lightGray}`,
            backgroundColor: vscBackground,
          }}
        >
          <ArrowLeftIcon
            width="1.2em"
            height="1.2em"
            onClick={submitAndLeave}
            className="inline-block ml-4 cursor-pointer"
          />
          <h3 className="text-lg font-bold m-2 inline-block">Configure Dropstone</h3>
          <ConfigJsonButton
            onClick={() => {
              ideMessenger.post("showFile", {
                filepath:
                  getPlatform() == "windows"
                    ? "~\\.dropstone\\config.json"
                    : "~/.dropstone/config.json",
              });
            }}
          >
            Open config.json
          </ConfigJsonButton>
        </div>

        {/* Dropstone Authentication Section */}
        <div className="p-2">
          <DropstoneSection>
            <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
              🔐 Dropstone Authentication
            </h3>

            {authLoading ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500"></div>
                <span className="text-sm text-gray-500">Checking authentication...</span>
              </div>
            ) : isLoggedIn && userInfo ? (
              <UserProfile>
                {userInfo.imageUrl && !imageError ? (
                  <ProfileImage
                    src={userInfo.imageUrl}
                    alt={userInfo.name || userInfo.userName || 'User'}
                    onError={() => setImageError(true)}
                  />
                ) : (
                  <AvatarFallback>
                    {getUserInitials(userInfo)}
                  </AvatarFallback>
                )}
                <ProfileInfo>
                  <ProfileName>
                    {userInfo.name || userInfo.userName || 'Unknown User'}
                  </ProfileName>
                  {userInfo.email && (
                    <ProfileEmail>{userInfo.email}</ProfileEmail>
                  )}
                  {userInfo.provider && (
                    <ProfileEmail>
                      Connected via {userInfo.provider.charAt(0).toUpperCase() + userInfo.provider.slice(1)}
                    </ProfileEmail>
                  )}
                </ProfileInfo>
                <LogoutButton onClick={logout}>
                  Logout
                </LogoutButton>
              </UserProfile>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-300 mb-1">
                    Connect your Dropstone account to access premium features
                  </p>
                  <p className="text-xs text-gray-500">
                    Sign in to sync your settings and access advanced AI models
                  </p>
                </div>
                <AuthButton onClick={showAuthDialog}>
                  Sign In
                </AuthButton>
              </div>
            )}
          </DropstoneSection>

          {/* Dropstone Models Section */}
          <DropstoneSection>
            <DropstoneModelSelector />
          </DropstoneSection>
        </div>

        <form onSubmit={formMethods.handleSubmit(onSubmit)}>
          {config ? (
            <div className="p-2">
              <h3 className="flex gap-1">
                System Message
                <InfoHover
                  msg={`Set a system message with information that the LLM should always
              keep in mind (e.g. "Please give concise answers. Always respond in
              Spanish.")`}
                />
              </h3>
              <TextArea
                placeholder="Enter a system message (e.g. 'Always respond in German')"
                {...formMethods.register("systemMessage")}
              />

              <Hr />
              <h3 className="flex gap-1">
                Temperature
                <InfoHover
                  msg={`Set temperature to any value between 0 and 1. Higher values will
            make the LLM more creative, while lower values will make it more
            predictable.`}
                />
              </h3>
              <div className="flex justify-between mx-16 gap-1">
                <p>0</p>
                <Slider
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  {...formMethods.register("completionOptions.temperature")}
                />
                <p>1</p>
              </div>
              <div className="text-center" style={{ marginTop: "-25px" }}>
                <p className="text-sm text-gray-500">
                  {(formMethods.watch("completionOptions.temperature") as
                    | number
                    | undefined) ||
                    config.completionOptions?.temperature ||
                    "-"}
                </p>
              </div>
              <Hr />

              {/**
              <h3 className="flex gap-1">Models</h3>
              {ALL_MODEL_ROLES.map((role) => {
                return (
                  <>
                    <h4>{role}</h4>

                    <ModelSettings
                      role={role}
                      llm={(config.models as any)[role]}
                    />
                  </>
                );
              })}

              <Hr />

              <h3 className="flex gap-1">
                Custom Commands
                <InfoHover
                  msg={`Custom commands let you map a prompt to a shortened slash command.
            They are like slash commands, but more easily defined - write just a
            prompt instead of a Step class. Their output will always be in chat
            form`}
                />
              </h3>
              <Hr />

              <h3 className="flex gap-1">
                Context Providers
                <InfoHover
                  msg={`Context Providers let you type '@' and quickly reference sources of information, like files, GitHub Issues, webpages, and more.`}
                />
              </h3>
            */}
            </div>
          ) : (
            <Loader />
          )}
        </form>

        <hr />

        <div className="px-2">
          <h3>Appearance</h3>

          <p>Font Size</p>
          <NumberInput
            type="number"
            min="8"
            max="48"
            step="1"
            defaultValue={getFontSize()}
            onChange={(e) => {
              setLocalStorage("fontSize", parseInt(e.target.value));
            }}
          />
        </div>

        <div className="flex gap-2 justify-end px-4">
          <CancelButton
            onClick={() => {
              navigate("/");
            }}
          >
            Cancel
          </CancelButton>
          <SaveButton onClick={submitAndLeave}>Save</SaveButton>
        </div>
      </div>
    </FormProvider>
  );
}

export default Settings;
