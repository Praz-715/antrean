export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['@nuxt/ui', '@pinia/nuxt', '@nuxt/eslint'],

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      titleTemplate: '%s · ANTREAN',
      title: 'ANTREAN',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: 'ANTREAN — Kelola Antrean. Layani Lebih Cepat.' },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },

  runtimeConfig: {
    // server-only
    databaseUrl: process.env.DATABASE_URL,
    betterAuthSecret: process.env.BETTER_AUTH_SECRET,
    betterAuthUrl: process.env.BETTER_AUTH_URL,
    appEncryptionKey: process.env.APP_ENCRYPTION_KEY,
    storage: {
      driver: process.env.STORAGE_DRIVER || 'local',
      localPath: process.env.STORAGE_LOCAL_PATH || './storage/uploads',
      publicBase: process.env.STORAGE_PUBLIC_BASE || '/media',
    },
    rateLimit: {
      windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
      max: Number(process.env.RATE_LIMIT_MAX || 20),
    },
    turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY || '',

    public: {
      appName: process.env.APP_NAME || 'ANTREAN',
      appUrl: process.env.APP_URL || 'http://localhost:3000',
      defaultTimezone: process.env.DEFAULT_TIMEZONE || 'Asia/Jakarta',
      turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || '',
    },
  },

  nitro: {
    // Socket.IO di-bind ke instance Nitro lewat server/plugins/socket.ts
    experimental: { websocket: true },
  },

  experimental: {
    /**
     * Tab yang sudah lama terbuka memegang referensi ke chunk JavaScript lama.
     * Setelah server dev membangun ulang — atau setelah deploy baru — chunk itu
     * hilang dan navigasi berikutnya gagal dengan "Failed to fetch dynamically
     * imported module", biasanya disertai halaman yang tidak mau terbuka.
     * Muat ulang otomatis jauh lebih baik daripada layar yang macet.
     */
    emitRouteChunkError: 'automatic-immediate',
  },

  typescript: {
    strict: true,
    typeCheck: false,
  },

  ui: {
    colorMode: true,
  },

  eslint: {
    config: { stylistic: false },
  },
})
