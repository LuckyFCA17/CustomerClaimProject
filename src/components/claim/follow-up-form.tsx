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
}

export interface DocumentOption {
  readonly id: string;
  readonly name: string;
}

/**
 * Jalur Follow Up (§6 Modul 2): menetapkan penanggung jawab lalu menerbitkan CPAR.
 *
 * Pilihan CFT dan User Department tidak sekadar mengubah label — pada CFT, departemen
 * yang dipilih pertama berperan sebagai lead dept dan hanya head-nya yang menjadi
 * verifier wajib (asumsi A-04).
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
  const [cftMemberDeptIds, setCftMemberDeptIds] = useState<string[]>([]);
  const [initialDocumentIds, setInitialDocumentIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [note, setNote] = useState("");

  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);

  const isCft = responsibilityType === "CFT";

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
            Siapa yang menanggung penanganan klaim ini. Pada CFT, lead dept adalah departemen yang
            head-nya ikut memverifikasi CPAR.
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
                Lead dept dibantu departemen lain.
              </span>
            </RadioGroupItem>
          </RadioGroup>

          <div className="space-y-1.5">
            <Label htmlFor="responsibleDeptId">
              {isCft ? "Lead department" : "Departemen penanggung jawab"}
              <span className="ml-0.5 text-destructive">*</span>
            </Label>
            <SelectNative
              id="responsibleDeptId"
              value={responsibleDeptId}
              onChange={(event) => {
                setResponsibleDeptId(event.target.value);
                setCftMemberDeptIds((list) => list.filter((id) => id !== event.target.value));
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
                    hint={department.id === responsibleDeptId ? "Sudah menjadi lead dept" : undefined}
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
