import Constants from 'expo-constants';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';

const isCrashTestBuild = Constants.expoConfig?.extra?.crashTestScreen === true;

export default function CrashTestScreen() {
  if (!isCrashTestBuild) {
    return <Redirect href="/settings" />;
  }
  return <Crash />;
}

function Crash() {
  const [crashed, setCrashed] = useState(false);
  useEffect(() => {
    Promise.reject(new Error('Test rejection from the settings flow'));
    setCrashed(true);
  }, []);
  if (crashed) {
    throw new Error('Test crash from the settings flow');
  }
  return null;
}
