// Plugin de config local para o build Android do PDV.
// Libera HTTP: a API roda em HTTP (sslip.io) e o Android 9+ bloqueia
// tráfego cleartext por padrão. Sem isto o app não conecta na API.
const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withPosNativeFixes(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (application) {
      application.$['android:usesCleartextTraffic'] = 'true';
    }
    return cfg;
  });
};
