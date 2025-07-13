// Static models that should always be available in the Dropstone Chat
export interface StaticModel {
  id: string;
  name: string;
  provider: string;
  title: string;
}

export const STATIC_DROPSTONE_MODELS: StaticModel[] = [
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    title: 'GPT-4o Mini'
  },
  {
    id: 'claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    title: 'Claude 3.5 Sonnet'
  },
  {
    id: 'claude-3.7-sonnet',
    name: 'Claude 3.7 Sonnet',
    provider: 'anthropic',
    title: 'Claude 3.7 Sonnet'
  },
  {
    id: 'gemini-flash-2.0',
    name: 'Gemini Flash 2.0',
    provider: 'google',
    title: 'Gemini Flash 2.0'
  },
  {
    id: 'o3',
    name: 'O3',
    provider: 'openai',
    title: 'O3'
  }
];

// Function to check if dropstone server is connected
export const checkDropstoneConnection = async (): Promise<boolean> => {
  try {
    const response = await fetch('https://server.dropstone.io/api/models/public', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    return response.ok;
  } catch (error) {
    return false;
  }
};

// Function to get models from dropstone server
export const getDropstoneModels = async (token?: string): Promise<StaticModel[]> => {
  try {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch('https://server.dropstone.io/api/models', {
      method: 'GET',
      headers
    });

    if (response.ok) {
      const data = await response.json();
      return Object.values(data.models).map((model: any) => ({
        id: model.id,
        name: model.name,
        provider: model.provider,
        title: model.name
      }));
    }

    // If authenticated request fails, try public endpoint
    const publicResponse = await fetch('https://server.dropstone.io/api/models/public', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (publicResponse.ok) {
      const data = await publicResponse.json();
      return Object.values(data.models).map((model: any) => ({
        id: model.id,
        name: model.name,
        provider: model.provider,
        title: model.name
      }));
    }
  } catch (error) {
    console.error('Failed to fetch models from Dropstone server:', error);
  }

  return [];
};

// Function to save models to localStorage
export const saveModelsToStorage = (models: StaticModel[]) => {
  localStorage.setItem('dropstone_models', JSON.stringify(models));
};

// Function to get saved models from localStorage
export const getSavedModels = (): StaticModel[] => {
  try {
    const saved = localStorage.getItem('dropstone_models');
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    return [];
  }
};

// Function to get combined models (static + server + saved)
export const getCombinedModels = async (token?: string): Promise<StaticModel[]> => {
  // Always start with static models
  let allModels = [...STATIC_DROPSTONE_MODELS];

  try {
    // Try to get models from server
    const serverModels = await getDropstoneModels(token);

    if (serverModels.length > 0) {
      // Save to localStorage
      saveModelsToStorage(serverModels);
      // Merge with static models, removing duplicates
      serverModels.forEach(serverModel => {
        if (!allModels.find(model => model.id === serverModel.id)) {
          allModels.push(serverModel);
        }
      });
    } else {
      // If server not available, get saved models
      const savedModels = getSavedModels();
      savedModels.forEach(savedModel => {
        if (!allModels.find(model => model.id === savedModel.id)) {
          allModels.push(savedModel);
        }
      });
    }
  } catch (error) {
    console.error('getCombinedModels: Error fetching models:', error);
    // Even if there's an error, we still have static models
  }

  return allModels;
};

// Function to convert StaticModel to ModelPackage format for provider configuration
export const convertStaticModelsToPackages = (models: StaticModel[]): any[] => {
  return models.map(model => ({
    title: model.title,
    description: `${model.name} - Advanced AI model via Dropstone Server`,
    params: {
      title: model.title,
      model: model.id,
      contextLength: 100000,
      provider: "openai", // Use openai provider for OpenAI-compatible API
      apiBase: "https://server.dropstone.io/v1",
      systemMessage: "You are an expert software developer. You give helpful and concise responses based on latest documentation and software engineering best practices.",
    },
    icon: getModelIcon(model.provider),
    providerOptions: ["pearai_server"],
    isOpenSource: false,
    tags: [],
  }));
};

// Helper function to get appropriate icon based on provider
const getModelIcon = (provider: string): string => {
  switch (provider.toLowerCase()) {
    case 'openai':
      return 'openai.png';
    case 'anthropic':
      return 'anthropic.png';
    case 'google':
      return 'gemini.png';
    default:
      return 'dropstone.png';
  }
};
