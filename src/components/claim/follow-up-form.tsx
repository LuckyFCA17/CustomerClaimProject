"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckboxField } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SelectNative } from "@/components/ui/select-native";
import { Textarea } from "@/components/ui/textarea";
import { followUpClaim } from "@/server/actions/cpar";

export interface DepartmentOption {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  /** Calon User Dept. Head: seluruh anggota aktif departemen ini. */
  readonly members: readonly MemberOption[];
}

export interface MemberOption {
  readonly id: string;
  readonly name: string;
  readonly jobTitle: string;
}

export interface DocumentOption {
  readonly id: string;
  readonly name: string;
}

/**
 * Jalur Follow Up (§6 Modul 2): menetapkan penanggung jawab lalu menerbitkan CPAR.
 *
 * Pilihan CFT dan User Department tidak sekadar mengubah label — pada CFT, departemen
 * yang dipilih pertama berperan sebagai Main Responsible Department dan hanya satu
 * orang dari sana yang menjadi verifier User Dept. Head (asumsi A-04).
 *
 * Orang itu ditunjuk di sini, bukan disimpulkan dari role. Sebelumnya portal mencari
 * sendiri pemegang role USER_HEAD di departemen tersebut, dan pada departemen yang tidak
 * punya satu pun — QA, misalnya — CPAR berhenti selamanya pada tiga dari empat keputusan
 * tanpa menunjukkan apa yang kurang.
 */
export function FollowUpForm({
  claimId,
  departments,
  documents,
  defaultDueDate,
}: {
  claimId: string;
  departments: readonly DepartmentOption[];
  documents: readonly DocumentOption[];
  defaultDueDate: string;
}) {
  const router = useRouter();

  const [responsibilityType, setResponsibilityType] = useState("USER_DEPT");
  const [responsibleDeptId, setResponsibleDeptId] = useState("");
  const [userHeadVerifierId, setUserHeadVerifierId] = useState("");
  const [cftMemberDeptIds, setCftMemberDeptIds] = useState<string[]>([]);
  const [initialDocumentIds, setInitialDocumentIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [note, setNote] = useState("");

  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);

  const isCft = responsibilityType === "CFT";
  const selectedDept = departments.find((department) => department.id === responsibleDeptId) ?? null;
  const members = selectedDept?.members ?? [];

  function toggle(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
  }

  async function submit() {
    setErrors({});
    setPending(true);

    try {
      const result = await followUpClaim(claimId, {
        responsibilityType,
        responsibleDeptId,
        // Anggota CFT hanya bermakna pada tipe CFT; pada User Department dikosongkan
        // supaya pilihan yang sempat dicentang tidak ikut tersimpan diam-diam.
        cftMemberDeptIds: isCft ? cftMemberDeptIds : [],
        userHeadVerifierId,
        initialDocumentIds,
        dueDate,
        note,
      });

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error("Submit problem countermeasure request gagal", { description: result.message });
        return;
      }

      toast.success("Submit problem countermeasure request", { description: result.message });
      router.push(`/claims/${claimId}`);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Responsibility</CardTitle>
          <CardDescription>
            Siapa yang menanggung penanganan klaim ini, dan siapa dari sana yang memverifikasi
            CPAR sebagai User Dept. Head.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <RadioGroup
            value={responsibilityType}
            onValueChange={setResponsibilityType}
            className="sm:grid-cols-2"
          >
            <RadioGroupItem value="USER_DEPT">
              <span className="block font-medium">User Department</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Satu departemen menangani sendiri.
              </span>
            </RadioGroupItem>
            <RadioGroupItem value="CFT">
              <span className="block font-medium">Cross Functional Team</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Main Responsible Department dibantu departemen lain.
              </span>
            </RadioGroupItem>
          </RadioGroup>

          <div className="space-y-1.5">
            <Label htmlFor="responsibleDeptId">
              {isCft ? "Main Responsible Department" : "Departemen penanggung jawab"}
              <span className="ml-0.5 text-destructive">*</span>
            </Label>
            <SelectNative
              id="responsibleDeptId"
              value={responsibleDeptId}
              onChange={(event) => {
                setResponsibleDeptId(event.target.value);
                setCftMemberDeptIds((list) => list.filter((id) => id !== event.target.value));
                // Penunjukan ikut direset: orang dari departemen lama bukan calon yang sah
                // lagi, dan membiarkannya terpilih akan ditolak server tanpa terlihat.
                setUserHeadVerifierId("");
              }}
            >
              <option value="">Pilih departemen…</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.code} — {department.name}
                </option>
              ))}
            </SelectNative>
            <FieldError messages={errors.responsibleDeptId} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="userHeadVerifierId">
              User Dept. Head untuk verifikasi CPAR
              <span className="ml-0.5 text-destructive">*</span>
            </Label>
            <SelectNative
              id="userHeadVerifierId"
              value={userHeadVerifierId}
              onChange={(event) => setUserHeadVerifierId(event.target.value)}
              disabled={!selectedDept}
            >
              <option value="">
                {selectedDept ? "Pilih orang…" : "Pilih departemen lebih dulu"}
              </option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} — {member.jobTitle}
                </option>
              ))}
            </SelectNative>
            {selectedDept && members.length === 0 ? (
              <p className="text-xs text-destructive">
                {selectedDept.code} belum punya anggota aktif. Tambahkan dulu di master data
                pengguna, atau pilih departemen lain sebagai penanggung jawab.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Keputusannya satu dari empat verifikasi wajib. Orang ini tetap dapat
                memverifikasi dalam kapasitas lain yang ia pegang, dan keduanya dihitung
                terpisah.
              </p>
            )}
            <FieldError messages={errors.userHeadVerifierId} />
          </div>

          {isCft ? (
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">
                Anggota CFT<span className="ml-0.5 text-destructive">*</span>
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {departments.map((department) => (
                  <CheckboxField
                    key={department.id}
                    label={`${department.code} — ${department.name}`}
                    checked={cftMemberDeptIds.includes(department.id)}
                    disabled={department.id === responsibleDeptId}
                    hint={
                      department.id === responsibleDeptId
                        ? "Sudah menjadi Main Responsible Department"
                        : undefined
                    }
                    onCheckedChange={() =>
                      setCftMemberDeptIds((list) => toggle(list, department.id))
                    }
                  />
                ))}
              </div>
              <FieldError messages={errors.cftMemberDeptIds} />
            </fieldset>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Initial Document Request</CardTitle>
          <CardDescription>
            Dokumen yang harus dilampirkan bersama CPAR. Daftarnya dikelola Administrator di master
            data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            {documents.map((document) => (
              <CheckboxField
                key={document.id}
                label={document.name}
                checked={initialDocumentIds.includes(document.id)}
                onCheckedChange={() => setInitialDocumentIds((list) => toggle(list, document.id))}
              />
            ))}
          </div>
          <FieldError messages={errors.initialDocumentIds} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tenggat dan catatan</CardTitle>
          <CardDescription>
            Bawaannya tiga hari kerja dari hari ini. Hari libur nasional belum diperhitungkan, jadi
            sesuaikan bila perlu.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="dueDate">
              Tenggat pengisian CPAR<span className="ml-0.5 text-destructive">*</span>
            </Label>
            <Input
              id="dueDate"
              type="date"
              className="max-w-56"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
            <FieldError messages={errors.dueDate} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="note">Catatan untuk departemen penanggung jawab</Label>
            <Textarea
              id="note"
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Opsional — konteks tambahan yang tidak termuat di informasi klaim."
            />
            <FieldError messages={errors.note} />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={() => void submit()} disabled={pending}>
          {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Send aria-hidden />}
          Submit problem countermeasure request
        </Button>
        <span className="text-xs text-muted-foreground">
          CPAR ID terbit setelah ini dan tidak dapat ditarik kembali.
        </span>
      </div>
    </div>
  );
}

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;

  return <p className="text-xs text-destructive">{messages[0]}</p>;
}
