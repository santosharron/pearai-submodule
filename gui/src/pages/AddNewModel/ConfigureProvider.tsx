import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import _ from "lodash";
import React, { useCallback, useContext, useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { useDispatch } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import styled from "styled-components";
import {
  Input,
  Select,
  defaultBorderRadius,
  lightGray,
  vscBackground,
} from "../../components";
import StyledMarkdownPreview from "../../components/markdown/StyledMarkdownPreview";
import ModelCard from "../../components/modelSelection/ModelCard";
import ModelProviderTag from "../../components/modelSelection/ModelProviderTag";
import Toggle from "../../components/modelSelection/Toggle";
import { IdeMessengerContext } from "../../context/IdeMessenger";
import { useDropstoneAuth } from "../../context/DropstoneAuthContext";
import { useNavigationListener } from "../../hooks/useNavigationListener";
import { setDefaultModel } from "../../redux/slices/stateSlice";
import { updatedObj } from "../../util";
import { getCombinedModels, convertStaticModelsToPackages } from "../../util/staticModels";
import type { ProviderInfo } from "./configs/providers";
import { providers } from "./configs/providers";

const GridDiv = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  grid-gap: 2rem;
  padding: 1rem;
  justify-items: center;
  align-items: center;
`;

export const CustomModelButton = styled.div<{ disabled: boolean }>`
  border: 1px solid ${lightGray};
  border-radius: ${defaultBorderRadius};
  padding: 4px 8px;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: all 0.5s;

  ${(props) =>
    props.disabled
      ? `
    opacity: 0.5;
    `
      : `
  &:hover {
    border: 1px solid #be1b55;
    background-color: #be1b5522;
    cursor: pointer;
  }
  `}
`;

const ErrorText = styled.div`
    color: #dc2626;
    font-size: 14px;
    margin-top: 8px;
`;

function ConfigureProvider() {
  useNavigationListener();
  const formMethods = useForm();
  const { providerName } = useParams();
  const ideMessenger = useContext(IdeMessengerContext);
  const { isLoggedIn, userInfo, showAuthDialog, logout, token } = useDropstoneAuth();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [modelInfo, setModelInfo] = useState<ProviderInfo | undefined>(
    undefined,
  );
  const [dynamicPackages, setDynamicPackages] = useState<any[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  //  different authentication flow is required for watsonx. This state helps to determine which flow to use for authentication
  const [watsonxAuthenticate, setWatsonxAuthenticate] = React.useState(true);

  const { watch, handleSubmit } = formMethods;

  useEffect(() => {
    if (providerName) {
      setModelInfo(providers[providerName]);
    }
  }, [providerName]);

  // Load dynamic packages when authenticated for pearai_server provider
  useEffect(() => {
    const loadDynamicPackages = async () => {
      if (providerName === "pearai_server" && isLoggedIn && token) {
        setLoadingModels(true);
        try {
          const models = await getCombinedModels(token);
          const packages = convertStaticModelsToPackages(models);
          setDynamicPackages(packages);
        } catch (error) {
          console.error('Failed to load dynamic model packages:', error);
          setDynamicPackages([]);
        } finally {
          setLoadingModels(false);
        }
      } else {
        setDynamicPackages([]);
      }
    };

    loadDynamicPackages();
  }, [providerName, isLoggedIn, token]);

  // TODO: This is not being used - do we still need this?
  const handleContinue = () => {
    if (!modelInfo) return;

    let formParams: any = {};
    for (const d of modelInfo.collectInputFor || []) {
      const val = formMethods.watch(d.key);
      if (val === "" || val === undefined || val === null) continue;
      formParams = updatedObj(formParams, {
        [d.key]: d.inputType === "text" ? val : parseFloat(val),
      });
    }
    const model = {
      ...formParams,
      provider: modelInfo.provider,
    };
    ideMessenger.post("config/addModel", { model });
    dispatch(setDefaultModel({ title: model.title, force: true }));
    navigate("/");
  };

  const disableModelCards = useCallback(() => {
    return (
      modelInfo?.collectInputFor?.some((d) => {
        if (!d.required) return false;
        const val = formMethods.watch(d.key);
        return (
          typeof val === "undefined" || (typeof val === "string" && val === "")
        );
      }) || false
    );
  }, [modelInfo, formMethods]);

  const enablecardsForApikey = useCallback(() => {
    return modelInfo?.collectInputFor
      ?.filter((d) => d.isWatsonxAuthenticatedByApiKey)
      .some((d) => !formMethods.watch(d.key));
  }, [modelInfo, formMethods]);
  const enablecardsForCredentials = useCallback(() => {
    return modelInfo?.collectInputFor
      ?.filter((d) => d.isWatsonxAuthenticatedByCredentials)
      .some((d) => !formMethods.watch(d.key));
  }, [modelInfo, formMethods]);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleOpenRouterSubmit = () => {
    const formValues = formMethods.getValues();
    const model = formValues.model;
    const apiKey = formValues.apiKey;

    if (!formValues.apiKey) {
      setErrorMessage("Please enter your OpenRouter API key");
      return;
    }

    if (!formValues.model) {
      setErrorMessage("Please select a model");
      return;
    }

    handleSubmit((data) => {
      const selectedPackage = providers.openrouter?.packages.find(
        (pkg) => pkg.params.model === model,
      );

      let formParams: any = {};

      for (const d of providers.openrouter?.collectInputFor || []) {
        const val = data[d.key];

        if (val === "" || val === undefined || val === null) {
          continue;
        }

        formParams = updatedObj(formParams, {
          [d.key]: d.inputType === "text" ? val : parseFloat(val),
        });
      }

      const modelConfig = {
        ...selectedPackage.params,
        ...providers.openrouter?.params,
        ...formParams,
        apiKey,
        model,
        provider: "openrouter",
        title:
          `${selectedPackage.title} (OpenRouter)` || `${model} (OpenRouter)`,
      };

      ideMessenger.post("config/addModel", { model: modelConfig });

      dispatch(
        setDefaultModel({
          title: modelConfig.title,
          force: true,
        }),
      );
      navigate("/");
    })();
  };

  return (
    <FormProvider {...formMethods}>
      <div className="overflow-y-scroll">
        <div
          className="items-center flex m-0 p-0 sticky top-0"
          style={{
            borderBottom: `0.5px solid ${lightGray}`,
            backgroundColor: vscBackground,
            zIndex: 2,
          }}
        >
          <ArrowLeftIcon
            width="1.2em"
            height="1.2em"
            onClick={() => navigate("/addModel")}
            className="inline-block ml-4 cursor-pointer"
          />
          <h3 className="text-lg font-bold m-2 inline-block">
            Configure Provider
          </h3>
        </div>

        <div className="px-2">
          <div style={{ display: "flex", alignItems: "center" }}>
            {window.vscMediaUrl && modelInfo?.icon && (
              <img
                src={`${window.vscMediaUrl}/logos/${modelInfo?.icon}`}
                height="24px"
                style={{ marginRight: "10px" }}
              />
            )}
            <h2>{modelInfo?.title}</h2>
          </div>

          {modelInfo?.tags?.map((tag, i) => (
            <ModelProviderTag key={i} tag={tag} />
          ))}

          <StyledMarkdownPreview
            className="mt-2"
            source={modelInfo?.longDescription || modelInfo?.description}
          />

          {/* The WatsonX Authentication coukd be done by two different ways
           1 ==> Using Api key
           2 ==> Using Credentials */}
          {providerName === "watsonx" ? (
            <>
              <div className="col-span-full py-4">
                <Toggle
                  selected={watsonxAuthenticate}
                  optionOne={"Authenticate by API key"}
                  optionTwo={"Authenticate by crendentials"}
                  onClick={() => {
                    setWatsonxAuthenticate((prev) => !prev);
                  }}
                ></Toggle>
              </div>
              {watsonxAuthenticate ? (
                <>
                  {(modelInfo?.collectInputFor?.filter((d) => d.required)
                    .length || 0) > 0 && (
                    <>
                      <h3 className="mb-2">Enter required parameters</h3>

                      {modelInfo?.collectInputFor
                        .filter((d) => d.isWatsonxAuthenticatedByApiKey)
                        .map((d, idx) => (
                          <div key={idx} className="mb-2">
                            <label htmlFor={d.key}>{d.label}</label>
                            <Input
                              type={d.inputType}
                              id={d.key}
                              className="border-2 border-gray-200 rounded-md p-2 m-2"
                              placeholder={d.placeholder}
                              defaultValue={d.defaultValue}
                              min={d.min}
                              max={d.max}
                              step={d.step}
                              {...formMethods.register(d.key, {
                                required: false,
                              })}
                            />
                          </div>
                        ))}
                    </>
                  )}
                </>
              ) : (
                <>
                  {(modelInfo?.collectInputFor?.filter((d) => d.required)
                    .length || 0) > 0 && (
                    <>
                      <h3 className="mb-2">Enter required parameters</h3>

                      {modelInfo?.collectInputFor
                        .filter((d) => d.isWatsonxAuthenticatedByCredentials)
                        .map((d, idx) => (
                          <div key={idx} className="mb-2">
                            <label htmlFor={d.key}>{d.label}</label>
                            <Input
                              type={d.inputType}
                              id={d.key}
                              className="border-2 border-gray-200 rounded-md p-2 m-2"
                              placeholder={d.placeholder}
                              defaultValue={d.defaultValue}
                              min={d.min}
                              max={d.max}
                              step={d.step}
                              {...formMethods.register(d.key, {
                                required: true,
                              })}
                            />
                          </div>
                        ))}
                    </>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              {(modelInfo?.collectInputFor?.filter((d) => d.required).length ||
                0) > 0 && (
                <>
                  <h3 className="mb-2">Enter required parameters</h3>

                  {modelInfo?.collectInputFor
                    ?.filter((d) => d.required)
                    .map((d, idx) => (
                      <div key={idx} className="mb-2">
                        <label htmlFor={d.key}>{d.label}</label>
                        <Input
                          type={d.inputType}
                          id={d.key}
                          className="border-2 border-gray-200 rounded-md p-2 m-2"
                          placeholder={d.placeholder}
                          defaultValue={d.defaultValue}
                          min={d.min}
                          max={d.max}
                          step={d.step}
                          {...formMethods.register(d.key, {
                            required: true,
                          })}
                        />
                      </div>
                    ))}
                </>
              )}
            </>
          )}

          {(modelInfo?.collectInputFor?.filter((d) => !d.required).length ||
            0) > 0 && (
            <details>
              <summary className="mb-2 cursor-pointer">
                <b>Advanced (optional)</b>
              </summary>
              {modelInfo?.collectInputFor?.map((d, idx) => {
                // Check the attribute is only for Watson X
                if (d.isWatsonxAttribute) return null;
                if (d.required) return null;

                let defaultValue = d.defaultValue;

                if (
                  providerName === "openrouter" &&
                  d.key === "contextLength"
                ) {
                  const selectedPackage = providers[
                    "openrouter"
                  ]?.packages.find(
                    (pkg) => pkg.params.model === watch("model"),
                  );
                  defaultValue = selectedPackage?.params.contextLength;
                }

                return (
                  <div key={idx}>
                    <label htmlFor={d.key}>{d.label}</label>
                    <Input
                      type={d.inputType}
                      id={d.key}
                      className="border-2 border-gray-200 rounded-md p-2 m-2"
                      placeholder={d.placeholder}
                      defaultValue={defaultValue}
                      min={d.min}
                      max={d.max}
                      step={d.step}
                      {...formMethods.register(d.key, {
                        required: false,
                      })}
                    />
                  </div>
                );
              })}
            </details>
          )}
          {providerName === "openrouter" && (
            <div className="mb-2">
              <label htmlFor="model">Select a Model</label>
              <Select
                id="model"
                className="border-2 border-gray-200 rounded-md p-2 m-2 w-full"
                {...formMethods.register("model", { required: true })}
              >
                <option value="">Select a model</option>
                {providers.openrouter?.packages.map((pkg) => (
                  <option key={pkg.params.model} value={pkg.params.model}>
                    {pkg.title}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {providerName === "openrouter" && (
            <>
              {errorMessage && (
                <ErrorText>
                  {errorMessage}
                </ErrorText>
              )}
              <CustomModelButton
                className={`mt-4 font-bold py-2 px-4 h-8`}
                onClick={handleOpenRouterSubmit}
                disabled={false}
              >
                Add OpenRouter Model
              </CustomModelButton>
            </>
          )}
          {providerName === "pearai_server" ? (
            <>
                {isLoggedIn ? (
                  // User is authenticated - show user details and model selection
                  <>
                    <div className="m-5">
                      <div className="flex items-center gap-3 p-4 bg-green-100/10 border border-green-500/30 rounded-lg mb-4">
                        {userInfo?.imageUrl || userInfo?.profile_picture_url || userInfo?.profilePicture || userInfo?.avatar ? (
                          <img
                            className="w-8 h-8 rounded-full"
                            src={userInfo.imageUrl || userInfo.profile_picture_url || userInfo.profilePicture || userInfo.avatar}
                            alt="Profile"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                            <div className="text-white text-sm font-bold">
                              {userInfo?.userName?.charAt(0)?.toUpperCase() ||
                               userInfo?.name?.charAt(0)?.toUpperCase() ||
                               '🪨'}
                            </div>
                          </div>
                        )}
                        <div>
                          <h3 className="font-semibold text-green-400">Connected to Dropstone Server</h3>
                          <p className="text-sm text-gray-400">
                            Logged in as: {userInfo?.userName || userInfo?.name || 'User'}
                          </p>
                        </div>
                        <CustomModelButton
                          className="ml-auto px-3 py-1 text-sm"
                          onClick={logout}
                          disabled={false}
                        >
                          Logout
                        </CustomModelButton>
                      </div>
                    </div>
                    <h3 className="mb-2 mx-5">Select a model preset</h3>
                    {loadingModels ? (
                      <div className="flex justify-center items-center p-8">
                        <div className="text-gray-400">Loading models from Dropstone server...</div>
                      </div>
                    ) : (
                      <GridDiv>
                        {dynamicPackages.length > 0 ? (
                          dynamicPackages.map((pkg, idx) => {
                            return (
                              <ModelCard
                                key={idx}
                                disabled={false}
                                title={pkg.title}
                                description={pkg.description}
                                tags={pkg.tags}
                                refUrl={pkg.refUrl}
                                icon={pkg.icon || modelInfo?.icon}
                                dimensions={pkg.dimensions}
                                onClick={(e, dimensionChoices) => {
                                  const model = {
                                    ...pkg.params,
                                    ...modelInfo?.params,
                                    ..._.merge(
                                      {},
                                      ...(pkg.dimensions?.map((dimension, i) => {
                                        if (!dimensionChoices?.[i]) return {};
                                        return {
                                          ...dimension.options[dimensionChoices[i]],
                                        };
                                      }) || []),
                                    ),
                                    provider: modelInfo?.provider,
                                    requestOptions: {
                                      headers: {
                                        "Authorization": `Bearer ${token}`,
                                        "Content-Type": "application/json"
                                      }
                                    }
                                  };
                                  ideMessenger.post("config/addModel", { model });
                                  dispatch(
                                    setDefaultModel({ title: model.title, force: true }),
                                  );
                                  navigate("/");
                                }}
                              />
                            );
                          })
                        ) : (
                          <div className="text-center p-8 text-gray-400">
                            No models available from Dropstone server.
                            <br />
                            Please check your server connection.
                          </div>
                        )}
                      </GridDiv>
                    )}
                  </>
                ) : (
                  // User is not authenticated - show login options
                  <div className="m-5">
                    <div className="p-4 border border-orange-500/30 rounded-lg mb-4">
                      <h3 className="font-semibold text-orange-400 mb-2">Authentication Required</h3>
                      <p className="text-sm text-gray-400 mb-4">
                        Connect to Dropstone Server to access AI models with enterprise-grade security.
                      </p>
                      <div className="flex gap-2">
                        <CustomModelButton
                          className="px-4 py-2"
                          onClick={showAuthDialog}
                          disabled={false}
                        >
                          Sign In / Log In
                        </CustomModelButton>
                        <CustomModelButton
                          className="px-4 py-2"
                          onClick={() =>
                            ideMessenger.post(
                              "openUrl",
                              "https://dropstone-server-bjlp.onrender.com"
                            )
                          }
                          disabled={false}
                        >
                          Open Dropstone Server
                        </CustomModelButton>
                      </div>
                    </div>
                  </div>
                )}
            </>
            ) : (
              providerName !== "openrouter" && (
                <>
                <h3 className="mb-2">Select a model preset</h3>
                <GridDiv>
                  {modelInfo?.packages.map((pkg, idx) => {
                    return (
                      <ModelCard
                        key={idx}
                        disabled={
                          disableModelCards() &&
                          enablecardsForApikey() &&
                          enablecardsForCredentials()
                        }
                        title={pkg.title}
                        description={pkg.description}
                        tags={pkg.tags}
                        refUrl={pkg.refUrl}
                        icon={pkg.icon || modelInfo.icon}
                        dimensions={pkg.dimensions}
                        onClick={(e, dimensionChoices) => {
                          if (
                            disableModelCards() &&
                            enablecardsForApikey() &&
                            enablecardsForCredentials()
                          )
                            return;
                          let formParams: any = {};
                          for (const d of modelInfo.collectInputFor || []) {
                            const val = formMethods.watch(d.key);
                            if (val === "" || val === undefined || val === null) {
                              continue;
                            }
                            formParams = updatedObj(formParams, {
                              [d.key]: d.inputType === "text" ? val : parseFloat(val),
                            });
                          }
                          const model = {
                            ...pkg.params,
                            ...modelInfo.params,
                            ...formParams,
                            ..._.merge(
                              {},
                              ...(pkg.dimensions?.map((dimension, i) => {
                                if (!dimensionChoices?.[i]) return {};
                                return {
                                  ...dimension.options[dimensionChoices[i]],
                                };
                              }) || []),
                            ),
                            provider: modelInfo.provider,
                          };
                          ideMessenger.post("config/addModel", { model });
                          dispatch(
                            setDefaultModel({ title: model.title, force: true }),
                          );
                          navigate("/");
                        }}
                      />
                    );
                  })}
                </GridDiv>
              </>
            )
          )}
        </div>
      </div>
    </FormProvider>
  );
}

export default ConfigureProvider;
