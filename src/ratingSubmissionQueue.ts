// Home's MemoryPoW worker rejects overlapping writes with QDN_POW_BUSY.
// Queue the entire unlock/identity-check/approval/broadcast operation. The
// caller registers progress before enqueueing, so browsing and drafting other
// ratings stay available. Each job runs once; a failed job releases the next.
export function createRatingSubmissionQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(submit: () => Promise<T>): Promise<T> {
    const result = tail.then(submit);
    tail = result.catch(() => undefined);
    return result;
  };
}

// Survives unmounting an editor or navigating between accounts in this app.
export const enqueueRatingSubmission = createRatingSubmissionQueue();
