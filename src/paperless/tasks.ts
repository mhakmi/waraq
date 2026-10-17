import { z } from 'zod';

import { DocumentId, TaskId } from './schemas';

export type TaskStatus =
  | { kind: 'pending' }
  | { kind: 'succeeded'; documentId: DocumentId }
  | { kind: 'failed'; message: string }
  | { kind: 'unknown' };

export const Task = z.object({
  task_id: TaskId,
  status: z.string(),
  input_data: z.object({ filename: z.string().optional() }),
  result_data: z
    .object({
      document_id: DocumentId.optional(),
      error_message: z.string().optional(),
      reason: z.string().optional(),
      duplicate_of: z.number().int().optional(),
    })
    .nullable(),
  related_document_ids: z.array(DocumentId),
});
type Task = z.infer<typeof Task>;

function failureMessage(task: Task): string {
  const result = task.result_data;
  if (result?.error_message) {
    return result.error_message;
  }
  if (result?.reason) {
    return result.reason;
  }
  if (result?.duplicate_of !== undefined) {
    return `It is a duplicate of document ${result.duplicate_of}.`;
  }
  return `The task ended with status ${task.status}.`;
}

export function taskStatus(task: Task | undefined): TaskStatus {
  if (task === undefined) {
    return { kind: 'unknown' };
  }
  switch (task.status) {
    case 'pending':
    case 'started':
      return { kind: 'pending' };
    case 'success': {
      const documentId = task.result_data?.document_id ?? task.related_document_ids[0];
      return documentId === undefined ? { kind: 'unknown' } : { kind: 'succeeded', documentId };
    }
    case 'failure':
    case 'revoked':
      return { kind: 'failed', message: failureMessage(task) };
    default:
      return { kind: 'unknown' };
  }
}
