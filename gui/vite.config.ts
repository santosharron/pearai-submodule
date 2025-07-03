import path from "path"
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Improve sourcemap generation
    sourcemap: true,
    rollupOptions: {
      // external: ["vscode-webview"],
      onwarn: (warning, warn) => {
        // Suppress eval warnings from onnxruntime-web as they are expected
        if (warning.code === 'EVAL' && warning.id?.includes('onnxruntime-web')) {
          return;
        }
        // Suppress sourcemap warnings for external modules
        if (warning.code === 'SOURCEMAP_ERROR') {
          return;
        }
        warn(warning);
      },
      output: {
        entryFileNames: `assets/[name].js`,
        chunkFileNames: `assets/[name].js`,
        assetFileNames: `assets/[name].[ext]`,
        // Better chunk splitting to reduce bundle size - only include packages that are actually used
        manualChunks: {
          vendor: ['react', 'react-dom'],
          ui: ['@radix-ui/react-checkbox', '@radix-ui/react-progress', '@radix-ui/react-slot', '@radix-ui/react-switch', '@radix-ui/react-tabs', '@radix-ui/react-tooltip'],
          editor: ['@monaco-editor/react', '@tiptap/core', '@tiptap/react'],
          motion: ['framer-motion'],
          markdown: ['react-markdown', 'rehype-katex', 'rehype-highlight', 'remark-math']
        }
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Handle font assets properly
  assetsInclude: ['**/*.woff', '**/*.woff2', '**/*.ttf'],
  // Define environment variables for better builds
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
  },
});
