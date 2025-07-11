/// <reference types="vite/client" />

declare global {
    interface Window {
      isPearOverlay?: boolean;
      viewType?: 'dropstone.chatView' | 'dropstone.mem0View' | 'dropstone.searchView';
    }
  }

export {}