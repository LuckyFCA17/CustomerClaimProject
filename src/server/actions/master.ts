"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

import { RoleCode } from "@/generated/prisma/enums";
import { readRequestContext, writeAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { assertCan } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import {
  ADMIN_ROLE,
  createUserSchema,
  departmentSchema,
  hasAdminRole,
  resetPasswordSchema,
  updateUserSchema,
  wouldRemoveLastAdmin,
} from "@/schemas/master";

/**
 * Server action data acuan (§6 master data).
 *
 * Dua aturan dijaga di sini dan tidak diserahkan ke layar:
 *   · kode departemen dan email pengguna tetap unik, dan bentrokannya dijelaskan
 *     pada kolomnya — bukan dilempar sebagai galat basis data;
 *   · portal tidak pernah kehabisan Administrator aktif, karena keadaan itu tidak
 *     dapat diperbaiki dari dalam portal.
 *
 * Tidak ada penghapusan permanen. Departemen dan pengguna tertinggal di klaim lama
 * sebagai pembuat, verifier, dan penanggung jawab; menghapus barisnya akan membuat
 * lembar yang sudah ditandatangani kehilangan namanya. Yang ada hanya menonaktifkan:
 * hilang dari pilihan baru, tetap terbaca pada yang lama.
 */

export interface MasterResult {
  readonly ok: boolean;
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

function flattenZodErrors(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }

  return fieldErrors;
}

function failure(error: unknown): MasterResult {
  if (error instanceof Error && "httpStatus" in error) {
    return { ok: false, message: error.message };
  }

  throw error;
}

function revalidateMaster(): void {
  revalidatePath("/master/departments");
  revalidatePath("/master/users");
}

// ─────────────────────── Departemen ───────────────────────

export async function saveDepartment(
  id: string | null,
  input: unknown,
): Promise<MasterResult> {
  try {
    const actor = await requireActor();
    assertCan(actor, "master.manage");

    const parsed = departmentSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        message: "Periksa kembali isian departemen.",
        fieldErrors: flattenZodErrors(parsed.error),
      };
    }

    const { code, name, email, isActive } = parsed.data;

    const clash = await db.department.findFirst({
      where: { code, ...(id ? { NOT: { id } } : {}) },
      select: { id: true },
    });

    if (clash) {
      return {
        ok: false,
        message: "Kode departemen sudah dipakai.",
        fieldErrors: { code: [`Kode ${code} sudah dipakai departemen lain.`] },
      };
    }

    const requestContext = await readRequestContext();
    const data = { code, name, email: email || null, isActive };

    await db.$transaction(async (tx) => {
      const saved = id
        ? await tx.department.update({ where: { id }, data })
        : await tx.department.create({ data });

      await writeAuditLog(
        tx,
        {
          actorId: actor.id,
          entityType: "Department",
          entityId: saved.id,
          action: "master.manage",
          payloadDiff: { code, name, isActive, created: !id },
        },
        requestContext,
      );
    });

    revalidateMaster();

    return { ok: true, message: id ? `Departemen ${code} diperbarui.` : `Departemen ${code} dibuat.` };
  } catch (error) {
    return failure(error);
  }
}

export async function setDepartmentActive(id: string, isActive: boolean): Promise<MasterResult> {
  try {
    const actor = await requireActor();
    assertCan(actor, "master.manage");

    const department = await db.department.findUnique({
      where: { id },
      select: { code: true },
    });

    if (!department) throw new NotFoundError("Departemen tidak ditemukan.");

    const requestContext = await readRequestContext();

    await db.$transaction(async (tx) => {
      await tx.department.update({ where: { id }, data: { isActive } });

      await writeAuditLog(
        tx,
        {
          actorId: actor.id,
          entityType: "Department",
          entityId: id,
          action: "master.manage",
          payloadDiff: { code: department.code, isActive },
        },
        requestContext,
      );
    });

    revalidateMaster();

    return {
      ok: true,
      message: isActive
        ? `Departemen ${department.code} diaktifkan.`
        : `Departemen ${department.code} dinonaktifkan.`,
    };
  } catch (error) {
    return failure(error);
  }
}

// ─────────────────────── Pengguna ───────────────────────

/** Jumlah Administrator yang masih aktif; dipakai menjaga pintu terakhir. */
async function countActiveAdmins(): Promise<number> {
  return db.user.count({
    where: { isActive: true, roles: { some: { role: { code: ADMIN_ROLE } } } },
  });
}

async function roleIdsFor(codes: readonly RoleCode[]): Promise<string[]> {
  const roles = await db.role.findMany({
    where: { code: { in: [...codes] } },
    select: { id: true, code: true },
  });

  if (roles.length !== new Set(codes).size) {
    throw new ValidationError("Sebagian role tidak dikenal; muat ulang halaman lalu coba lagi.");
  }

  return roles.map((role) => role.id);
}

async function assertDepartmentExists(departmentId: string): Promise<void> {
  const department = await db.department.findUnique({
    where: { id: departmentId },
    select: { id: true },
  });

  if (!department) throw new ValidationError("Departemen tidak ditemukan.");
}

export async function createUser(input: unknown): Promise<MasterResult> {
  try {
    const actor = await requireActor();
    assertCan(actor, "user.manage");

    const parsed = createUserSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        message: "Periksa kembali isian pengguna.",
        fieldErrors: flattenZodErrors(parsed.error),
      };
    }

    const { name, email, jobTitle, employeeNo, departmentId, roles, isActive, password } =
      parsed.data;

    const clash = await db.user.findFirst({ where: { email }, select: { id: true } });
    if (clash) {
      return {
        ok: false,
        message: "Email sudah terdaftar.",
        fieldErrors: { email: [`${email} sudah dipakai pengguna lain.`] },
      };
    }

    if (departmentId) await assertDepartmentExists(departmentId);

    const roleIds = await roleIdsFor(roles);
    const requestContext = await readRequestContext();

    await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          jobTitle,
          employeeNo: employeeNo || null,
          departmentId: departmentId || null,
          isActive,
          passwordHash: await bcrypt.hash(password, 10),
          roles: { create: roleIds.map((roleId) => ({ roleId })) },
        },
      });

      await writeAuditLog(
        tx,
        {
          actorId: actor.id,
          entityType: "User",
          entityId: user.id,
          action: "user.manage",
          payloadDiff: { email, roles, isActive, created: true },
        },
        requestContext,
      );
    });

    revalidateMaster();

    return { ok: true, message: `Pengguna ${name} dibuat.` };
  } catch (error) {
    return failure(error);
  }
}

export async function updateUser(input: unknown): Promise<MasterResult> {
  try {
    const actor = await requireActor();
    assertCan(actor, "user.manage");

    const parsed = updateUserSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        message: "Periksa kembali isian pengguna.",
        fieldErrors: flattenZodErrors(parsed.error),
      };
    }

    const { id, name, email, jobTitle, employeeNo, departmentId, roles, isActive } = parsed.data;

    const existing = await db.user.findUnique({
      where: { id },
      select: { isActive: true, roles: { select: { role: { select: { code: true } } } } },
    });

    if (!existing) throw new NotFoundError("Pengguna tidak ditemukan.");

    const clash = await db.user.findFirst({
      where: { email, NOT: { id } },
      select: { id: true },
    });

    if (clash) {
      return {
        ok: false,
        message: "Email sudah terdaftar.",
        fieldErrors: { email: [`${email} sudah dipakai pengguna lain.`] },
      };
    }

    const wasActiveAdmin =
      existing.isActive && hasAdminRole(existing.roles.map((entry) => entry.role.code));

    if (
      wouldRemoveLastAdmin({
        activeAdmins: await countActiveAdmins(),
        wasActiveAdmin,
        willBeActiveAdmin: isActive && hasAdminRole(roles),
      })
    ) {
      return {
        ok: false,
        message:
          "Ini satu-satunya Administrator yang aktif. Angkat Administrator lain lebih dulu — " +
          "portal tanpa Administrator tidak dapat diperbaiki dari dalam.",
        fieldErrors: { roles: ["Harus tersisa satu Administrator aktif."] },
      };
    }

    if (departmentId) await assertDepartmentExists(departmentId);

    const roleIds = await roleIdsFor(roles);
    const requestContext = await readRequestContext();

    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          name,
          email,
          jobTitle,
          employeeNo: employeeNo || null,
          departmentId: departmentId || null,
          isActive,
          // Role ditulis ulang seluruhnya: menghitung selisihnya menghasilkan kode yang
          // lebih panjang untuk hasil yang sama, dan jumlah rolenya tidak pernah banyak.
          roles: { deleteMany: {}, create: roleIds.map((roleId) => ({ roleId })) },
        },
      });

      await writeAuditLog(
        tx,
        {
          actorId: actor.id,
          entityType: "User",
          entityId: id,
          action: "user.manage",
          payloadDiff: { email, roles, isActive },
        },
        requestContext,
      );
    });

    revalidateMaster();

    return { ok: true, message: `Pengguna ${name} diperbarui.` };
  } catch (error) {
    return failure(error);
  }
}

export async function resetUserPassword(input: unknown): Promise<MasterResult> {
  try {
    const actor = await requireActor();
    assertCan(actor, "user.manage");

    const parsed = resetPasswordSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        message: "Kata sandi belum memenuhi syarat.",
        fieldErrors: flattenZodErrors(parsed.error),
      };
    }

    const user = await db.user.findUnique({
      where: { id: parsed.data.id },
      select: { name: true },
    });

    if (!user) throw new NotFoundError("Pengguna tidak ditemukan.");

    const requestContext = await readRequestContext();

    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: parsed.data.id },
        data: { passwordHash: await bcrypt.hash(parsed.data.password, 10) },
      });

      // Kata sandinya sendiri tidak pernah masuk audit — yang dicatat hanya peristiwanya.
      await writeAuditLog(
        tx,
        {
          actorId: actor.id,
          entityType: "User",
          entityId: parsed.data.id,
          action: "user.manage",
          payloadDiff: { passwordReset: true },
        },
        requestContext,
      );
    });

    return { ok: true, message: `Kata sandi ${user.name} diganti.` };
  } catch (error) {
    return failure(error);
  }
}
