import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        mindmap: resolve(__dirname, 'mindmap.html'),
        adatvedelem: resolve(__dirname, 'adatvedelem.html'),
        aszf: resolve(__dirname, 'aszf.html'),
        cookie: resolve(__dirname, 'cookie.html'),
        impresszum: resolve(__dirname, 'impresszum.html'),
        diagnose: resolve(__dirname, 'diagnose.html'),
        testDiagnostica: resolve(__dirname, 'test-diagnostica.html'),
        testEmbedding: resolve(__dirname, 'test-embedding.html')
      }
    }
  }
});
