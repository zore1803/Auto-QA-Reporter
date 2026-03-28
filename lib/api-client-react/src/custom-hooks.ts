import { useMutation } from "@tanstack/react-query";
import type { UseMutationOptions, UseMutationResult } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";
import type { ErrorType } from "./custom-fetch";

export const cancelScan = async (jobId: string): Promise<{ jobId: string; status: string }> => {
  return customFetch<{ jobId: string; status: string }>(`/api/scan/${jobId}`, {
    method: "DELETE",
  });
};

export function useCancelScan<TError = ErrorType<unknown>, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof cancelScan>>,
    TError,
    { jobId: string },
    TContext
  >;
}): UseMutationResult<Awaited<ReturnType<typeof cancelScan>>, TError, { jobId: string }, TContext> {
  const { mutation: mutationOptions } = options ?? {};

  const mutationFn = ({ jobId }: { jobId: string }) => cancelScan(jobId);

  return useMutation({
    mutationFn,
    ...mutationOptions,
  });
}
