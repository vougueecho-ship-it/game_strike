import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.gamestrike.app',
  appName: 'GameStrike.io',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
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

