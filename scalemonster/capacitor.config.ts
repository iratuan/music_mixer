import type { CapacitorConfig } from '@capacitor/cli';

/**
 * ScaleMonster no Android: o mesmo build web (apps/academy/dist) dentro do WebView do sistema.
 * appId oficial (Decisão 1): não mudar depois de publicado, é a identidade do app no Android.
 */
const config: CapacitorConfig = {
  appId: 'br.local.scalemonster',
  appName: 'ScaleMonster',
  webDir: 'dist',
  // Nunca registrar chamadas de plugin no logcat: incluiriam o banco do aluno (Filesystem.writeFile).
  loggingBehavior: 'none',
  android: {
    // Nada de conteúdo misto nem depuração do WebView em release.
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
