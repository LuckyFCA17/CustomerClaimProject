"use client";

import * as React from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";

import { cn } from "@/lib/utils";

function RadioGroup({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn("grid gap-2", className)}
      {...props}
    />
  );
}

function RadioGroupItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-lg border border-nid-border bg-card px-3 py-2.5 text-sm transition-colors",
        "hover:border-nid-orange-600 has-[[data-state=checked]]:border-nid-orange-600 has-[[data-state=checked]]:bg-accent",
        className,
      )}
    >
      <RadioGroupPrimitive.Item
        data-slot="radio-group-item"
        className={cn(
          "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2 border-nid-border bg-card",
          "data-[state=checked]:border-nid-orange-600",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
        {...props}
      >
        <RadioGroupPrimitive.Indicator className="size-2 rounded-full bg-nid-orange-600" />
      </RadioGroupPrimitive.Item>
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}

export { RadioGroup, RadioGroupItem };
