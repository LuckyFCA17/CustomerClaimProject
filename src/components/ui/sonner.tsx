"use client";

import { Toaster as Sonner } from "sonner";

/**
 * Toast portal. Nama aksi di toast harus sama persis dengan label tombol yang memicunya (§10).
 */
function Toaster(props: React.ComponentProps<typeof Sonner>) {
  return (
    <Sonner
      position="top-right"
      toastOptions={{
        classNames: {
          toast: "rounded-xl border border-nid-border bg-card text-foreground shadow-md",
          description: "text-muted-foreground",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
