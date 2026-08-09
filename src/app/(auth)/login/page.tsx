import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NidMark } from "@/components/shared/nid-mark";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

const PROCESS_STEPS = [
  {
    title: "Issue Customer Claim Information",
    detail: "Pencatatan klaim, review QA Dept. Head, lalu distribusi Bad News & Quick Information.",
  },
  {
    title: "Issue Problem Countermeasure Request",
    detail: "Penetapan penanggung jawab dan penerbitan CPAR, atau penutupan klaim sebagai Ignored.",
  },
  {
    title: "CPAR Filling & Evidence Collection",
    detail: "Pengisian lintas departemen, unggah evidence, dan rantai verifikasi berjenjang.",
  },
  {
    title: "CAPA Implementation Monitoring",
    detail: "Pemantauan efektivitas countermeasure sampai klaim dinyatakan Verified Closed.",
  },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Dibaca di server agar halaman login tidak perlu useSearchParams (dan Suspense).
  const params = await searchParams;
  const raw = params.callbackUrl;
  const callbackUrl = typeof raw === "string" ? raw : undefined;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_480px]">
      <section className="hidden flex-col justify-between bg-nid-orange-500 p-10 text-white lg:flex">
        <NidMark />

        <div className="max-w-lg space-y-8">
          <div className="space-y-3">
            <h1 className="font-display text-3xl font-bold leading-tight">
              Satu klaim, satu record hidup.
            </h1>
            <p className="text-sm text-white/85">
              Portal penanganan klaim pelanggan PT Nifco Indonesia. Menggantikan register Excel, email
              manual, dan formulir PDF terpisah dengan satu alur yang tercatat penuh.
            </p>
          </div>

          <ol className="space-y-4">
            {PROCESS_STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/15 font-display text-xs font-bold ring-1 ring-white/25">
                  {index + 1}
                </span>
                <span className="space-y-0.5">
                  <span className="block text-sm font-semibold">{step.title}</span>
                  <span className="block text-xs text-white/75">{step.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <p className="text-xs text-white/60">PT Nifco Indonesia — Quality Assurance Department</p>
      </section>

      <section className="flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden">
            <NidMark tone="onLight" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Sign in to portal</CardTitle>
              <CardDescription>Masuk untuk mengelola klaim pelanggan, CPAR, dan monitoring CAPA.</CardDescription>
            </CardHeader>
            <CardContent>
              <LoginForm callbackUrl={callbackUrl} />
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
