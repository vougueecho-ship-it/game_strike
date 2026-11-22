import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.gamestrike.admin',
  appName: 'GameStrike Admin',
  webDir: '../dist',
  server: {
    // In production, point this to your live domain:
    url: 'https://gamestrike.io/#/admin',
    androidScheme: 'https',
    cleartext: true,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
