import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.gamestrike.app',
  appName: 'GameStrike.io',
  webDir: 'dist',
  server: {
    url: 'https://gamestrike.io',
    androidScheme: 'https',
    cleartext: true,
    allowNavigation: [
      'gamestrike.io',
      '*.gamestrike.io',
      'accounts.google.com',
      '*.google.com',
      '*.googleapis.com',
      '*.gstatic.com',
    ],
  },
  plugins: {
    SystemBars: {
      insetsHandling: 'native',
      style: 'DARK',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;

