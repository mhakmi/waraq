import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { AndroidConfig, type ConfigPlugin, withAndroidManifest, withDangerousMod } from 'expo/config-plugins';

// Android cannot limit cleartext to address ranges, so plain HTTP is allowed here and
// normalizeServerUrl refuses it for public hosts.
const networkSecurityConfig = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="true">
    <trust-anchors>
      <certificates src="system" />
      <certificates src="user" />
    </trust-anchors>
  </base-config>
</network-security-config>
`;

const withNetworkSecurity: ConfigPlugin = (config) => {
  const withFile = withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const folder = path.join(modConfig.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      await mkdir(folder, { recursive: true });
      await writeFile(path.join(folder, 'network_security_config.xml'), networkSecurityConfig);
      return modConfig;
    },
  ]);
  return withAndroidManifest(withFile, (modConfig) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(modConfig.modResults);
    application.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    return modConfig;
  });
};

export default withNetworkSecurity;
