import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { useDropstoneAuth } from '../../context/DropstoneAuthContext';
import { lightGray, vscBackground, vscForeground, vscInputBackground } from '..';

const ModelSelectorContainer = styled.div`
  margin-bottom: 16px;
`;

const ModelGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
  margin-top: 12px;
`;

const ModelCard = styled.div<{ isPremium: boolean; userHasAccess: boolean }>`
  border: 1px solid ${lightGray};
  border-radius: 8px;
  padding: 16px;
  background-color: ${vscInputBackground};
  position: relative;
  opacity: ${props => !props.userHasAccess && props.isPremium ? 0.6 : 1};
  cursor: ${props => !props.userHasAccess && props.isPremium ? 'not-allowed' : 'pointer'};
  transition: all 0.2s ease;

  &:hover {
    border-color: ${props => !props.userHasAccess && props.isPremium ? lightGray : '#007acc'};
    background-color: ${props => !props.userHasAccess && props.isPremium ? vscInputBackground : `${vscInputBackground}dd`};
  }
`;

const ModelName = styled.h4`
  margin: 0 0 8px 0;
  color: ${vscForeground};
  font-size: 14px;
  font-weight: 600;
`;

const ModelProvider = styled.div`
  color: ${lightGray};
  font-size: 12px;
  margin-bottom: 8px;
  text-transform: capitalize;
`;

const ModelFeatures = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
`;

const FeatureTag = styled.span`
  background-color: #007acc;
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 500;
`;

const PremiumBadge = styled.div`
  position: absolute;
  top: 8px;
  right: 8px;
  background-color: #ffd700;
  color: #000;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
`;

const UpgradePrompt = styled.div`
  color: ${lightGray};
  font-size: 11px;
  margin-top: 8px;
  font-style: italic;
`;

const SectionTitle = styled.h3`
  color: ${vscForeground};
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 8px 0;
`;

const PlanBadge = styled.span<{ isPremium: boolean }>`
  background-color: ${props => props.isPremium ? '#ffd700' : '#28a745'};
  color: ${props => props.isPremium ? '#000' : '#fff'};
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  margin-left: 8px;
`;

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

export const DropstoneModelSelector: React.FC = () => {
  const { isLoggedIn, isPremiumUser, fetchAvailableModels, showAuthDialog } = useDropstoneAuth();
  const [models, setModels] = useState<{ [key: string]: Model }>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadModels = async () => {
      setLoading(true);
      try {
        const availableModels = await fetchAvailableModels();
        setModels(availableModels);
      } catch (error) {
        console.error('Failed to load models:', error);
      } finally {
        setLoading(false);
      }
    };

    loadModels();
  }, [fetchAvailableModels]);

  const getFeatureTags = (features: Model['features']) => {
    const tags = [];
    if (features.supportsImages) tags.push('Images');
    if (features.supportsComputerUse) tags.push('Computer Use');
    if (features.supportsBrowserUse) tags.push('Browser');
    if (features.supportsThinking) tags.push('Thinking');
    if (features.supportsReasoning) tags.push('Reasoning');
    return tags;
  };

  const freeModels = Object.values(models).filter(model => model.category === 'free');
  const premiumModels = Object.values(models).filter(model => model.category === 'premium');

  if (loading) {
    return (
      <ModelSelectorContainer>
        <SectionTitle>Available Models</SectionTitle>
        <div>Loading models...</div>
      </ModelSelectorContainer>
    );
  }

  if (!isLoggedIn) {
    return (
      <ModelSelectorContainer>
        <SectionTitle>Available Models</SectionTitle>
        <div style={{ color: lightGray, fontStyle: 'italic' }}>
          Please sign in to view available models
        </div>
      </ModelSelectorContainer>
    );
  }

  return (
    <ModelSelectorContainer>
      <SectionTitle>
        Available Models
        <PlanBadge isPremium={isPremiumUser}>
          {isPremiumUser ? 'Premium' : 'Free'}
        </PlanBadge>
      </SectionTitle>

      {freeModels.length > 0 && (
        <>
          <h4 style={{ color: vscForeground, margin: '16px 0 8px 0' }}>Free Models</h4>
          <ModelGrid>
            {freeModels.map((model) => (
              <ModelCard
                key={model.id}
                isPremium={false}
                userHasAccess={true}
              >
                <ModelName>{model.name}</ModelName>
                <ModelProvider>{model.provider}</ModelProvider>
                <ModelFeatures>
                  {getFeatureTags(model.features).map((feature) => (
                    <FeatureTag key={feature}>{feature}</FeatureTag>
                  ))}
                </ModelFeatures>
                <div style={{ color: lightGray, fontSize: '11px' }}>
                  Max tokens: {model.maxTokens.toLocaleString()}
                </div>
              </ModelCard>
            ))}
          </ModelGrid>
        </>
      )}

      {premiumModels.length > 0 && (
        <>
          <h4 style={{ color: vscForeground, margin: '16px 0 8px 0' }}>Premium Models</h4>
          <ModelGrid>
            {premiumModels.map((model) => (
              <ModelCard
                key={model.id}
                isPremium={true}
                userHasAccess={isPremiumUser}
              >
                <PremiumBadge>Premium</PremiumBadge>
                <ModelName>{model.name}</ModelName>
                <ModelProvider>{model.provider}</ModelProvider>
                <ModelFeatures>
                  {getFeatureTags(model.features).map((feature) => (
                    <FeatureTag key={feature}>{feature}</FeatureTag>
                  ))}
                </ModelFeatures>
                <div style={{ color: lightGray, fontSize: '11px' }}>
                  Max tokens: {model.maxTokens.toLocaleString()}
                </div>
                {!isPremiumUser && (
                  <UpgradePrompt>
                    Upgrade to Premium to access this model
                  </UpgradePrompt>
                )}
              </ModelCard>
            ))}
          </ModelGrid>
        </>
      )}

      {!isPremiumUser && premiumModels.length > 0 && (
        <div style={{
          marginTop: '16px',
          padding: '12px',
          backgroundColor: `${lightGray}20`,
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{ color: vscForeground, fontWeight: '600', marginBottom: '4px' }}>
            Want access to premium models?
          </div>
          <div style={{ color: lightGray, fontSize: '12px' }}>
            Upgrade to Premium to unlock advanced AI models with enhanced capabilities
          </div>
        </div>
      )}
    </ModelSelectorContainer>
  );
};
