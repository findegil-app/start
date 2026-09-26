import type { CapacitorConfig } from '@capacitor/cli'

// App Android (APK) de Findegil: empaqueta la misma web (dist/, compilada con BASE_PATH=/).
const config: CapacitorConfig = {
  appId: 'app.findegil',
  appName: 'Findegil',
  webDir: 'dist',
  android: {
    backgroundColor: '#0f1220',
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_findegil',
      iconColor: '#e3c27a',
    },
  },
}

export default config
