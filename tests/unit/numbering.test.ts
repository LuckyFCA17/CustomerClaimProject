import { describe, expect, it } from "vitest";

import { draftLabel, nextClaimNo, nextCparNo, type CounterClient } from "@/lib/numbering";

/**
 * Klien palsu yang meniru `INSERT … ON CONFLICT DO UPDATE … RETURNING value`:
 * satu pencacah per bucket, naik satu tiap panggilan.
 */
function fakeClient(): CounterClient & { calls: string[] } {
  const counters = new Map<string, number>();
  const calls: string[] = [];

  return {
    calls,
    async $queryRaw<T>(_query: TemplateStringsArray, ...values: unknown[]): Promise<T> {
      const key = `${String(values[0])}/${String(values[1])}`;
      calls.push(key);

      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);

      return [{ value: next }] as T;
    },
  };
}

describe("penomoran klaim", () => {
  it("mengikuti format NID/CC/{YY}/{MM}/{0001}", async () => {
    const client = fakeClient();
    const claimNo = await nextClaimNo(client, new Date("2026-08-09T03:00:00Z"));

    expect(claimNo).toBe("NID/CC/26/08/0001");
  });

  it("memakai nol di depan sampai empat digit", async () => {
    const client = fakeClient();
    const date = new Date("2026-08-09T03:00:00Z");

    let last = "";
    for (let index = 0; index < 12; index += 1) {
      last = await nextClaimNo(client, date);
    }

    expect(last).toBe("NID/CC/26/08/0012");
  });

  it("mereset pencacah tiap bulan", async () => {
    const client = fakeClient();

    await nextClaimNo(client, new Date("2026-07-31T03:00:00Z"));
    const august = await nextClaimNo(client, new Date("2026-08-01T03:00:00Z"));

    expect(august).toBe("NID/CC/26/08/0001");
    expect(client.calls).toEqual(["CLAIM/26-07", "CLAIM/26-08"]);
  });

  it("tidak pernah mengeluarkan nomor kembar walau permintaan datang bersamaan", async () => {
    const client = fakeClient();
    const date = new Date("2026-08-09T03:00:00Z");

    const numbers = await Promise.all(
      Array.from({ length: 50 }, () => nextClaimNo(client, date)),
    );

    expect(new Set(numbers).size).toBe(50);
  });
});

describe("penomoran CPAR", () => {
  it("mengikuti format NID/CPAR/{YY}/{0001} dan direset tiap tahun", async () => {
    const client = fakeClient();

    expect(await nextCparNo(client, new Date("2026-03-02T03:00:00Z"))).toBe("NID/CPAR/26/0001");
    expect(await nextCparNo(client, new Date("2026-11-20T03:00:00Z"))).toBe("NID/CPAR/26/0002");
    expect(await nextCparNo(client, new Date("2027-01-04T03:00:00Z"))).toBe("NID/CPAR/27/0001");
  });

  it("memakai bucket tahunan, bukan bulanan", async () => {
    const client = fakeClient();

    await nextCparNo(client, new Date("2026-03-02T03:00:00Z"));

    expect(client.calls).toEqual(["CPAR/26"]);
  });
});

describe("label draft", () => {
  it("memberi penanda ringkas untuk klaim yang belum punya Claim No", () => {
    expect(draftLabel("cmslrzvtk001ldx7dcvqgtocf")).toBe("DRAFT-QGTOCF");
  });
});
