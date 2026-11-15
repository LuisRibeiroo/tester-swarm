import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://testerswarm.dev',
  output: 'static',
  integrations: [sitemap()],
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'pt-br'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
});
