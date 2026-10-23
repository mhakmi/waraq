import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { appendRolling, type CrashKind, describeThrown, formatEntry, redact, type Secrets } from './log';

type RejectionTracker = {
  allRejections: boolean;
  onUnhandled: (id: number, rejection: unknown) => void;
  onHandled: (id: number) => void;
};


let secrets: Secrets = { values: [], headerNames: [] };

export function rememberSecrets(known: Secrets) {
  secrets = known;
}

export function crashLogFile(): File {
  return new File(Paths.document, 'crash.log');
}

export function readCrashLog(): string {
  const file = crashLogFile();
  return file.exists ? file.textSync() : '';
}

export function clearCrashLog() {
  const file = crashLogFile();
  if (file.exists) {
    file.delete();
  }
}

function androidVersion(): string {
  return Platform.OS === 'android' ? `${Platform.constants.Release} (API ${Platform.Version})` : String(Platform.Version);
}

// It writes synchronously, because a fatal error ends the process as soon as the handler returns.
export function recordCrash(kind: CrashKind, thrown: unknown) {
  try {
    const { message, stack } = describeThrown(thrown);
    const entry = formatEntry({
      kind,
      time: new Date(),
      appVersion: Constants.expoConfig?.version ?? '',
      android: androidVersion(),
      message: redact(message, secrets),
      stack: redact(stack, secrets),
    });
    crashLogFile().writeSync(appendRolling(readCrashLog(), entry));
  } catch (error) {
    console.warn('The crash log could not be written', error);
  }
}

export function installCrashHandlers() {
  const previous = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    recordCrash(isFatal ? 'fatal' : 'error', error);
    previous(error, isFatal);
  });
  const hermes = (globalThis as { HermesInternal?: { enablePromiseRejectionTracker?: (options: RejectionTracker) => void } })
    .HermesInternal;
  hermes?.enablePromiseRejectionTracker?.({
    allRejections: true,
    onUnhandled: (id, rejection) => {
      recordCrash('promise', rejection);
      console.warn(`A promise was rejected and nothing handled it (id ${id})`, rejection);
    },
    onHandled: () => {},
  });
}
