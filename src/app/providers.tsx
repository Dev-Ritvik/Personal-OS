"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            retry: 1,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );

  // Flush queued offline ops when connectivity returns.
  useEffect(() => {
    (window as unknown as { __POS_HYDRATED?: boolean }).__POS_HYDRATED = true;
    void import("@/lib/client/api").then((m) => m.flushOnEvents());
  }, []);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
