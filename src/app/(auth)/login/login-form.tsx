"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginFormAction, type LoginState } from "@/server/actions/auth";

const INITIAL_STATE: LoginState = {};

/**
 * Form login memakai server action pada atribut `action`, bukan handler `onSubmit`.
 *
 * Alasannya bukan gaya penulisan: dengan `onSubmit`, klik yang terjadi sebelum React
 * ter-hydrate akan jatuh ke submit bawaan browser dan mengirim email serta kata sandi
 * sebagai query string. Lewat server action, submit sebelum hydrate tetap menjadi POST.
 * Validasi awal ditangani atribut `required`/`type=email` (bekerja tanpa JavaScript),
 * dan validasi sebenarnya tetap di server dengan skema Zod yang sama.
 */
export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction, isPending] = useActionState(loginFormAction, INITIAL_STATE);

  return (
    <form action={formAction} className="space-y-4">
      {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}

      {state.message ? (
        <p
          role="alert"
          className="rounded-md bg-[var(--status-danger-bg)] px-3 py-2 text-sm text-destructive"
        >
          {state.message}
        </p>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          key={`email-${state.attempt ?? 0}`}
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          placeholder="nama@nifco.co.id"
          defaultValue={state.email ?? ""}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            className="pr-11"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
            className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-secondary"
          >
            {showPassword ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
          </button>
        </div>
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={isPending}>
        <LogIn aria-hidden />
        {isPending ? "Memproses…" : "Sign in to portal"}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Gunakan akun NIFCO Anda. Lupa kata sandi? Hubungi Administrator QA.
      </p>
    </form>
  );
}
