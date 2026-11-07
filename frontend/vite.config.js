import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    plugins: [react(), {
        name: 'careconnect-static-portals',
        closeBundle() {
            for (const dir of ['buyer-family', 'doctor-telehealth', 'pharmacy-portal', 'shared', 'uploads']) {
                cpSync(fileURLToPath(new URL(`./${dir}`, import.meta.url)), fileURLToPath(new URL(`./dist/${dir}`, import.meta.url)), { recursive: true });
            }
        },
    }],
    server: {
        port: 5173,
        strictPort: true,
        proxy: {
            '/admin-api': 'http://127.0.0.1:5001',
            '/shop': { target: 'http://127.0.0.1:3001', ws: true },
            '/demo-api': { target: 'http://127.0.0.1:8000', rewrite: path => path.replace(/^\/demo-api/, '') },
            '/static': 'http://127.0.0.1:8000',
            '/api': 'http://127.0.0.1:5000',
        },
    },
});
