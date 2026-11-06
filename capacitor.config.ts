import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nikcirri.armadio',
  appName: 'Armadio',
  webDir: 'dist',
  android: {
    // Nessun contenuto caricato da internet: l'app gira tutta in locale.
    allowMixedContent: false,
  },
  plugins: {
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
    LocalNotifications: {
      // Icona bianca della barra di stato (gruccia) e colore dell'app.
      smallIcon: 'ic_stat_armadio',
      iconColor: '#7a5c3f',
    },
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      backgroundColor: '#f5efe6',
      showSpinner: false,
    },
  },
};

export default config;
