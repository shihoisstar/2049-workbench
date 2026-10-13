import { createHash } from 'node:crypto';
import type { ObjectStore } from '@wb/media';
import type { DramaImageJobLocator, DramaImageSubmission, Services } from '@wb/server';

export const MOCK_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAADUlEQVR4nGNgGAWjYBSMAAABEAAB9n9eSAAAAABJRU5ErkJggg==', 'base64');

export function createCandidateImageSubmissionActivity({ services }: { services: Pick<Services, 'dramaImages' | 'dramaImageSubmissions'> }) {
  return async (input: DramaImageJobLocator): Promise<DramaImageSubmission | { status: 'terminal'; jobId: string }> => {
    const job = await services.dramaImages.get(input);
    if (job.target !== 'candidate') throw new Error('Candidate image target required');
    if (job.status !== 'accepted') return { status: 'terminal', jobId: job.id };
    const claim = await services.dramaImageSubmissions.begin({ ...input, providerKey: 'mock-candidate-image:v1' });
    if (!claim.claimed) return claim.submission;
    return services.dramaImageSubmissions.accepted({ ...input, token: claim.token, providerTaskId: `mock-image:${job.id}` });
  };
}

export function createCandidateImagePublishingActivity({ services, objectStore }: {
  services: Pick<Services, 'dramaImages' | 'dramaImageSubmissions' | 'dramaImageAssets'>;
  objectStore?: ObjectStore;
}) {
  return async (input: DramaImageJobLocator): Promise<{ status: 'published' | 'terminal' | 'awaiting_receipt'; jobId: string }> => {
    const job = await services.dramaImages.get(input);
    if (job.status !== 'accepted') return { status: 'terminal', jobId: job.id };
    const submission = await services.dramaImageSubmissions.get(input);
    if (!submission || submission.status !== 'submitted') return { status: 'awaiting_receipt', jobId: job.id };
    if (submission.providerKey !== 'mock-candidate-image:v1') throw new Error('Candidate image provider configuration changed');
    if (!objectStore) throw new Error('Object store unavailable for candidate image publication');
    const sha256 = createHash('sha256').update(MOCK_PNG).digest('hex');
    const objectKey = `drama-image-jobs/${job.id}/${sha256}.png`;
    await objectStore.put(objectKey, MOCK_PNG, sha256, 'image/png');
    await services.dramaImageAssets.publish({ ...input, objectKey, sha256, byteLength: MOCK_PNG.length, width: 16, height: 16 });
    return { status: 'published', jobId: job.id };
  };
}

/** Only accepted jobs are failed; a settled job is left untouched so refunds never double-apply. */
export function createCandidateImageFailActivity({ services }: { services: Pick<Services, 'dramaImages'> }) {
  return async (input: DramaImageJobLocator): Promise<void> => {
    const job = await services.dramaImages.get(input);
    if (job.target === 'candidate' && job.status === 'accepted') {
      await services.dramaImages.fail({ ...input, failureCode: 'CANDIDATE_IMAGE_PUBLISH_FAILED' });
    }
  };
}
