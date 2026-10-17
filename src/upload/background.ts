import { BackgroundTaskResult, registerTaskAsync } from 'expo-background-task';
import { defineTask, isTaskRegisteredAsync } from 'expo-task-manager';

import { runUploads } from './queue';

export const uploadTaskName = 'waraq-upload-drain';

defineTask(uploadTaskName, async () => {
  await runUploads();
  return BackgroundTaskResult.Success;
});

export async function registerUploadTask(): Promise<void> {
  if (!(await isTaskRegisteredAsync(uploadTaskName))) {
    await registerTaskAsync(uploadTaskName, { minimumInterval: 15 });
  }
}
