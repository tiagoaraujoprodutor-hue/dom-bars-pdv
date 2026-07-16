// Plugin de config local (determinístico) para o build Android do PDV.
// Faz dois ajustes que precisam ser garantidos no APK:
//
//   1. hermesCommand → react-native/sdks/hermesc
//      O Expo/RN 0.82.1 aponta o compilador Hermes para o pacote npm
//      `hermes-compiler`, que o RN declara como 0.0.0 (stub VAZIO, sem binário)
//      — daí a falha em :app:createBundleReleaseJsAndAssets. O hermesc correto,
//      casado com o runtime `hermes-android` do RN 0.82.1, é o que vem dentro do
//      próprio react-native, em sdks/hermesc. Redirecionamos para lá.
//      (Mantemos o Hermes porque o expo-modules-core exige o motor Hermes; trocar
//      para JSC quebra a compilação do expo-modules-core.)
//
//   2. android:usesCleartextTraffic="true"
//      A API roda em HTTP (sslip.io) e o Android 9+ bloqueia HTTP por padrão.
const { withAppBuildGradle, withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withPosNativeFixes(config) {
  config = withAppBuildGradle(config, (cfg) => {
    // Resolve o hermesc que acompanha o react-native (compatível com o runtime).
    const sdksHermesCommand =
      'hermesCommand = new File(["node", "--print", ' +
      '"require.resolve(\'react-native/package.json\')"]' +
      '.execute(null, rootDir).text.trim()).getParentFile().getAbsolutePath()' +
      ' + "/sdks/hermesc/%OS-BIN%/hermesc"';
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /hermesCommand = new File\(\["node".*?%OS-BIN%\/hermesc"/,
      sdksHermesCommand,
    );
    return cfg;
  });

  config = withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (application) {
      application.$['android:usesCleartextTraffic'] = 'true';
    }
    return cfg;
  });

  return config;
};
