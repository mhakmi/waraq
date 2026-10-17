import { appendFile } from 'node:fs/promises';
import path from 'node:path';

import { type ConfigPlugin, withDangerousMod } from 'expo/config-plugins';

// WorkManager builds its database and its input mergers by name and calls their no-argument
// constructors. R8 keeps the classes through the libraries' own rules but drops the constructors,
// so the app crashed on start and, once that was kept, the background task could not run.
const rules = `
# WorkManager makes these through reflection and needs their constructors.
-keep class * extends androidx.room.RoomDatabase { <init>(); }
-keep class * extends androidx.work.InputMerger { <init>(); }
`;

const withProguardRules: ConfigPlugin = (config) =>
  withDangerousMod(config, [
    'android',
    async (modConfig) => {
      await appendFile(path.join(modConfig.modRequest.platformProjectRoot, 'app/proguard-rules.pro'), rules);
      return modConfig;
    },
  ]);

export default withProguardRules;
