import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Dropdown memakai elemen <select> bawaan, bukan menu kustom.
 *
 * Form klaim dipakai di lantai produksi lewat ponsel dan tablet, dan di sana pemilih
 * bawaan sistem lebih cepat dipakai serta sudah benar untuk pembaca layar. Gayanya
 * tetap mengikuti token yang sama dengan Input.
 */
function SelectNative({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        data-slot="select-native"
        className={cn(
          "h-10 w-full appearance-none rounded-md border border-input bg-card px-3 pr-9 text-sm text-foreground shadow-xs",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "aria-invalid:border-destructive aria-invalid:outline-destructive",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

export { SelectNative };
