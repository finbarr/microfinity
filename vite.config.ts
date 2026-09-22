import { defineConfig } from 'vite';
export default defineConfig({build:{outDir:'dist/client',emptyOutDir:true},worker:{format:'es'},server:{allowedHosts:['localhost','127.0.0.1']}});
