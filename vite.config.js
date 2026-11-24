import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/pdfjs-dist')) return 'resume-pdf';
          if (id.includes('node_modules/fflate')) return 'resume-docx';
          if (id.includes('node_modules')) {
            return 'vendor';
          }

          if (id.endsWith('/src/opportunities.js')) {
            return 'opportunities';
          }

          return undefined;
        },
      },
    },
  },
});
