/** A content-free cancellation/deadline boundary shared by controlled transports.
 * The operation receives a signal; no retries, logging or persistence occur.
 */
export async function withReviewDeadline(
  operation,
  { signal, timeoutMs = 15000 } = {},
) {
  if (signal?.aborted) throw new Error("Review cancelled.");
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000)
    throw new Error("Invalid review deadline.");
  const controller = new AbortController();
  let rejectAbort;
  const cancellation = new Promise((_, reject) => {
    rejectAbort = reject;
  });
  const cancel = () => {
    controller.abort();
    rejectAbort(new Error("Review cancelled or timed out."));
  };
  signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, timeoutMs);
  try {
    return await Promise.race([
      Promise.resolve().then(() => {
        if (controller.signal.aborted) throw new Error("Review cancelled.");
        return operation(controller.signal);
      }),
      cancellation,
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
    controller.abort();
  }
}
