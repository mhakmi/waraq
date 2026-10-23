import { type ConfigPlugin, withAppBuildGradle, withGradleProperties } from 'expo/config-plugins';

const uploadSigningConfig = `signingConfigs {
        if (System.getenv('WARAQ_UPLOAD_STORE_FILE')) {
            upload {
                storeFile file(System.getenv('WARAQ_UPLOAD_STORE_FILE'))
                storePassword System.getenv('WARAQ_UPLOAD_STORE_PASSWORD')
                keyAlias System.getenv('WARAQ_UPLOAD_KEY_ALIAS')
                keyPassword System.getenv('WARAQ_UPLOAD_KEY_PASSWORD')
            }
        }`;

const releaseSigning =
  "signingConfig System.getenv('WARAQ_UPLOAD_STORE_FILE') ? signingConfigs.upload : signingConfigs.debug";

const releaseProperties: Record<string, string> = {
  'android.enableMinifyInReleaseBuilds': 'true',
  'android.enableShrinkResourcesInReleaseBuilds': 'true',
};

function replaceOnce(text: string, pattern: RegExp, replacement: string): string {
  if (!pattern.test(text)) {
    throw new Error(`release-build plugin: app/build.gradle no longer matches ${pattern}`);
  }
  return text.replace(pattern, replacement);
}

const withReleaseBuild: ConfigPlugin = (config) => {
  const withSigning = withAppBuildGradle(config, (modConfig) => {
    let gradle = modConfig.modResults.contents;
    gradle = replaceOnce(gradle, /signingConfigs \{/, uploadSigningConfig);
    gradle = replaceOnce(gradle, /(release \{[^}]*?)signingConfig signingConfigs\.debug/, `$1${releaseSigning}`);
    modConfig.modResults.contents = gradle;
    return modConfig;
  });
  return withGradleProperties(withSigning, (modConfig) => {
    for (const [key, value] of Object.entries(releaseProperties)) {
      const existing = modConfig.modResults.find((item) => item.type === 'property' && item.key === key);
      if (existing && existing.type === 'property') {
        existing.value = value;
      } else {
        modConfig.modResults.push({ type: 'property', key, value });
      }
    }
    return modConfig;
  });
};

export default withReleaseBuild;
