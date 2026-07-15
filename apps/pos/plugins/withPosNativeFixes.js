// Plugin de config local (determinístico) para o build Android do PDV.
// Faz duas coisas que precisam ser garantidas no APK:
//   1. hermesEnabled=false → usa o motor JSC. Evitamos o Hermes porque o
//      react-native 0.82.1 aponta o hermesc para o pacote `hermes-compiler`
//      (que vem vazio/quebrado) e as versões alternativas geram bytecode
//      possivelmente incompatível. JSC é estável e suficiente para o PDV.
//   2. android:usesCleartextTraffic="true" → a API roda em HTTP (sslip.io),
//      e o Android 9+ bloqueia HTTP por padrão.
const { withGradleProperties, withAndroidManifest } = require('@expo/config-plugins');

function setGradleProperty(properties, key, value) {
  const existing = properties.find((item) => item.type === 'property' && item.key === key);
  if (existing) {
    existing.value = value;
  } else {
    properties.push({ type: 'property', key, value });
  }
  return properties;
}

module.exports = function withPosNativeFixes(config) {
  config = withGradleProperties(config, (cfg) => {
    cfg.modResults = setGradleProperty(cfg.modResults, 'hermesEnabled', 'false');
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
