import "dotenv/config";
import bcrypt from "bcryptjs";

import { db } from "../src/lib/db";
import { nextClaimNo, nextCparNo } from "../src/lib/numbering";
import type { RoleCode } from "../src/generated/prisma/enums";

/**
 * Data awal portal: 7 role, 6 departemen, 12 pengguna contoh, master data §7, dan
 * 3 klaim contoh pada status yang berbeda supaya dashboard dan daftar klaim langsung
 * punya isi yang bisa ditelusuri.
 *
 * Seed bersifat idempotent — dijalankan berulang tidak menggandakan data.
 */

const DEMO_PASSWORD = "Nifco#2026";

const ROLES: { code: RoleCode; name: string }[] = [
  { code: "QA", name: "QA Staff" },
  { code: "QA_HEAD", name: "QA Dept. Head" },
  { code: "USER_DEPT", name: "User Department" },
  { code: "USER_HEAD", name: "User Dept. Head" },
  { code: "FACTORY_MGR", name: "Factory Manager" },
  { code: "PRESDIR", name: "President Director" },
  { code: "ADMIN", name: "Administrator" },
];

const DEPARTMENTS = [
  { code: "QA", name: "Quality Assurance", email: "qa@nifco.co.id" },
  { code: "PRD", name: "Production", email: "production@nifco.co.id" },
  { code: "ENG", name: "Engineering", email: "engineering@nifco.co.id" },
  { code: "PPIC", name: "PPIC & Warehouse", email: "ppic@nifco.co.id" },
  { code: "MTC", name: "Maintenance", email: "maintenance@nifco.co.id" },
  { code: "PUR", name: "Purchasing", email: "purchasing@nifco.co.id" },
];

const USERS: {
  employeeNo: string;
  name: string;
  email: string;
  jobTitle: string;
  departmentCode: string | null;
  roles: RoleCode[];
}[] = [
  {
    employeeNo: "NID-0001",
    name: "Rina Kusuma",
    email: "rina.kusuma@nifco.co.id",
    jobTitle: "QA Dept. Head",
    departmentCode: "QA",
    roles: ["QA_HEAD", "QA"],
  },
  {
    employeeNo: "NID-0002",
    name: "Dimas Prayoga",
    email: "dimas.prayoga@nifco.co.id",
    jobTitle: "QA Staff",
    departmentCode: "QA",
    roles: ["QA"],
  },
  {
    employeeNo: "NID-0003",
    name: "Sari Wulandari",
    email: "sari.wulandari@nifco.co.id",
    jobTitle: "QA Engineer",
    departmentCode: "QA",
    roles: ["QA"],
  },
  {
    employeeNo: "NID-0004",
    name: "Bambang Setiawan",
    email: "bambang.setiawan@nifco.co.id",
    jobTitle: "Production Dept. Head",
    departmentCode: "PRD",
    roles: ["USER_HEAD", "USER_DEPT"],
  },
  {
    employeeNo: "NID-0005",
    name: "Yusuf Ramadhan",
    email: "yusuf.ramadhan@nifco.co.id",
    jobTitle: "Production Supervisor",
    departmentCode: "PRD",
    roles: ["USER_DEPT"],
  },
  {
    employeeNo: "NID-0006",
    name: "Anita Rahmawati",
    email: "anita.rahmawati@nifco.co.id",
    jobTitle: "Engineering Dept. Head",
    departmentCode: "ENG",
    roles: ["USER_HEAD", "USER_DEPT"],
  },
  {
    employeeNo: "NID-0007",
    name: "Hendra Gunawan",
    email: "hendra.gunawan@nifco.co.id",
    jobTitle: "Design Engineer",
    departmentCode: "ENG",
    roles: ["USER_DEPT"],
  },
  {
    employeeNo: "NID-0008",
    name: "Lestari Ningsih",
    email: "lestari.ningsih@nifco.co.id",
    jobTitle: "PPIC Dept. Head",
    departmentCode: "PPIC",
    roles: ["USER_HEAD", "USER_DEPT"],
  },
  {
    employeeNo: "NID-0009",
    name: "Agus Salim",
    email: "agus.salim@nifco.co.id",
    jobTitle: "Maintenance Staff",
    departmentCode: "MTC",
    roles: ["USER_DEPT"],
  },
  {
    employeeNo: "NID-0010",
    name: "Toshiro Tanaka",
    email: "toshiro.tanaka@nifco.co.id",
    jobTitle: "Factory Manager",
    departmentCode: null,
    roles: ["FACTORY_MGR"],
  },
  {
    employeeNo: "NID-0011",
    name: "Kenji Yamamoto",
    email: "kenji.yamamoto@nifco.co.id",
    jobTitle: "President Director",
    departmentCode: null,
    roles: ["PRESDIR"],
  },
  {
    employeeNo: "NID-0012",
    name: "Fajar Nugroho",
    email: "fajar.nugroho@nifco.co.id",
    jobTitle: "System Administrator",
    departmentCode: null,
    roles: ["ADMIN"],
  },
];

/** §7 A.13 — dipakai juga sebagai sumbu pareto di dashboard. */
const NC_DETAILS = [
  ["POST_INJECTION_DEFECT", "Post Injection Defect"],
  ["POST_ASSY_DEFECT", "Post Assy Defect"],
  ["CRACK_BROKEN", "Crack / Broken"],
  ["MIXED_WRONG_ITEM", "Mixed Wrong Item"],
  ["DIMENSION_DEFECT", "Dimension Defect"],
  ["APPEARANCE_DEFECT", "Appearance Defect"],
  ["FUNCTIONAL_DEFECT", "Functional Defect"],
  ["DELIVERY_WRONG_ITEM", "Delivery Wrong Item"],
  ["OVER_SHORT_DELIVERY", "Over / Short Delivery"],
  ["PACKAGING_DEFECT", "Packaging Defect"],
  ["HEIGHT_GATE", "Height Gate"],
] as const;

/** §7 A.10 — tabel master (asumsi A-11), tetap tampil sebagai radio di form. */
const PRODUCT_CATEGORIES = [
  ["CRITICAL_PART", "Critical Part"],
  ["IMPORTANT_PART", "Important Part"],
  ["GENERAL_PART", "General Part"],
] as const;

/** §6 Modul 2 — daftar dokumen yang dapat diminta saat menerbitkan CPAR. */
const INITIAL_DOCUMENTS = [
  ["4M_CHANGE_SHEET", "4M Change Sheet"],
  ["INSPECTION_STANDARD", "Inspection Standard"],
  ["WORK_INSTRUCTION", "Work Instruction"],
  ["QC_PROCESS_CHART", "QC Process Chart"],
  ["TRIAL_REPORT", "Trial Report"],
  ["DELIVERY_RECORD", "Delivery Record"],
  ["KANBAN_RECORD", "Kanban Record"],
  ["PROCESS_CAPABILITY", "Process Capability Data"],
  ["MATERIAL_CERTIFICATE", "Material Certificate"],
] as const;

const CUSTOMERS = [
  ["TMMIN", "PT Toyota Motor Manufacturing Indonesia"],
  ["HPM", "PT Honda Prospect Motor"],
  ["SIM", "PT Suzuki Indomobil Motor"],
  ["DNIA", "PT Denso Indonesia"],
] as const;

const PARTS = [
  ["NID-4451-02", "90467-09201", "Clip Fastener Bumper"],
  ["NID-7712-11", "76802-K59", "Cover Cap Assy"],
  ["NID-3320-08", "85820-BZ120", "Grommet Wire Harness"],
] as const;

async function seedRolesAndDepartments() {
  for (const role of ROLES) {
    await db.role.upsert({
      where: { code: role.code },
      update: { name: role.name },
      create: role,
    });
  }

  for (const dept of DEPARTMENTS) {
    await db.department.upsert({
      where: { code: dept.code },
      update: { name: dept.name, email: dept.email },
      create: dept,
    });
  }
}

async function seedMasterData() {
  for (const [index, [code, name]] of NC_DETAILS.entries()) {
    await db.nonConformanceDetail.upsert({
      where: { code },
      update: { name, sortOrder: index },
      create: { code, name, sortOrder: index },
    });
  }

  for (const [index, [code, name]] of PRODUCT_CATEGORIES.entries()) {
    await db.productCategory.upsert({
      where: { code },
      update: { name, sortOrder: index },
      create: { code, name, sortOrder: index },
    });
  }

  for (const [index, [code, name]] of INITIAL_DOCUMENTS.entries()) {
    await db.initialDocument.upsert({
      where: { code },
      update: { name, sortOrder: index },
      create: { code, name, sortOrder: index },
    });
  }

  for (const [code, name] of CUSTOMERS) {
    await db.customer.upsert({ where: { code }, update: { name }, create: { code, name } });
  }

  for (const [internalPartNo, customerPartNo, name] of PARTS) {
    await db.part.upsert({
      where: { internalPartNo },
      update: { customerPartNo, name },
      create: { internalPartNo, customerPartNo, name },
    });
  }

  await db.recipientGroup.upsert({
    where: { code: "ALL_PORTAL_USERS" },
    update: {},
    create: {
      code: "ALL_PORTAL_USERS",
      name: "Seluruh user portal",
      roleCodes: ["QA", "QA_HEAD", "USER_DEPT", "USER_HEAD", "FACTORY_MGR", "PRESDIR"],
      extraEmails: [],
    },
  });

  await db.recipientGroup.upsert({
    where: { code: "MANAGEMENT" },
    update: {},
    create: {
      code: "MANAGEMENT",
      name: "Manajemen",
      roleCodes: ["FACTORY_MGR", "PRESDIR"],
      extraEmails: [],
    },
  });
}

async function seedUsers() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const departments = await db.department.findMany();
  const roles = await db.role.findMany();

  const deptByCode = new Map(departments.map((dept) => [dept.code, dept.id]));
  const roleByCode = new Map(roles.map((role) => [role.code, role.id]));

  for (const user of USERS) {
    const departmentId = user.departmentCode ? (deptByCode.get(user.departmentCode) ?? null) : null;

    const record = await db.user.upsert({
      where: { email: user.email },
      update: { name: user.name, jobTitle: user.jobTitle, departmentId, passwordHash },
      create: {
        employeeNo: user.employeeNo,
        name: user.name,
        email: user.email,
        jobTitle: user.jobTitle,
        departmentId,
        passwordHash,
      },
    });

    for (const roleCode of user.roles) {
      const roleId = roleByCode.get(roleCode);
      if (!roleId) continue;

      await db.userRole.upsert({
        where: { userId_roleId: { userId: record.id, roleId } },
        update: {},
        create: { userId: record.id, roleId },
      });
    }
  }
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(8, 0, 0, 0);
  return date;
}

function daysAhead(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(17, 0, 0, 0);
  return date;
}

async function seedSampleClaims() {
  const existing = await db.claim.count();
  if (existing > 0) {
    console.log(`  · ${existing} klaim sudah ada, pembuatan contoh dilewati.`);
    return;
  }

  const qa = await db.user.findUniqueOrThrow({ where: { email: "dimas.prayoga@nifco.co.id" } });
  const qaHead = await db.user.findUniqueOrThrow({ where: { email: "rina.kusuma@nifco.co.id" } });
  const production = await db.department.findUniqueOrThrow({ where: { code: "PRD" } });
  const engineering = await db.department.findUniqueOrThrow({ where: { code: "ENG" } });
  const criticalPart = await db.productCategory.findUniqueOrThrow({ where: { code: "CRITICAL_PART" } });
  const generalPart = await db.productCategory.findUniqueOrThrow({ where: { code: "GENERAL_PART" } });
  const crackBroken = await db.nonConformanceDetail.findUniqueOrThrow({ where: { code: "CRACK_BROKEN" } });
  const dimensionDefect = await db.nonConformanceDetail.findUniqueOrThrow({
    where: { code: "DIMENSION_DEFECT" },
  });
  const appearanceDefect = await db.nonConformanceDetail.findUniqueOrThrow({
    where: { code: "APPEARANCE_DEFECT" },
  });
  const tmmin = await db.customer.findUniqueOrThrow({ where: { code: "TMMIN" } });
  const hpm = await db.customer.findUniqueOrThrow({ where: { code: "HPM" } });

  // ── Klaim 1: DRAFT — belum punya Claim No, masih disusun QA ──────────────
  const draft = await db.claim.create({
    data: {
      status: "DRAFT",
      type: "NON_OFFICIAL",
      dateOfOccurrence: daysAgo(2),
      shiftOfOccurrence: "MORNING",
      dateOfReceived: daysAgo(1),
      shiftOfReceived: "MORNING",
      failurePlace: "Line Assy 2 — Customer Plant Karawang",
      failurePlaceType: "DOMESTIC",
      contactPerson: "Andi Wijaya",
      contactEmail: "andi.wijaya@tmmin.co.id",
      contactPhone: "+62 812-1100-2200",
      internalPartNo: "NID-3320-08",
      customerPartNo: "85820-BZ120",
      partName: "Grommet Wire Harness",
      productCategoryId: generalPart.id,
      originPlantType: "NID",
      occurrence: "FIRST_TIME",
      ncDetailId: appearanceDefect.id,
      customerId: tmmin.id,
      abnormalSource: "Laporan incoming inspection customer",
      qualityProblem: "Permukaan grommet tergores pada sisi flange, terlihat pada 12 dari 200 pcs.",
      lotNo: "LOT-26-0731",
      kanbanNo: "KB-3320-114",
      injectionDate: daysAgo(9),
      assemblyDate: daysAgo(7),
      deliveryDate: daysAgo(4),
      suspectedProcessLine: "Injection line 3, mold cavity 2",
      createdById: qa.id,
      parts: {
        create: [
          {
            side: "STANDARD",
            partName: "Grommet Wire Harness",
            nidPartNo: "NID-3320-08",
            qty: 1,
            qtyUnit: "PCS",
            dimensionItem: "OD 24.0 ± 0.2 mm",
            appearanceItem: "Permukaan rata, tanpa goresan",
          },
          {
            side: "ACTUAL",
            partName: "Grommet Wire Harness",
            nidPartNo: "NID-3320-08",
            qty: 12,
            qtyUnit: "PCS",
            dimensionItem: "OD 24.1 mm",
            appearanceItem: "Goresan memanjang pada flange",
          },
        ],
      },
    },
  });

  // ── Klaim 2: PENDING_QA_HEAD_REVIEW — menunggu keputusan QA Dept. Head ───
  const pendingClaimNo = await nextClaimNo(db, daysAgo(3));
  const pending = await db.claim.create({
    data: {
      claimNo: pendingClaimNo,
      status: "PENDING_QA_HEAD_REVIEW",
      type: "OFFICIAL",
      dateOfOccurrence: daysAgo(5),
      shiftOfOccurrence: "NIGHT",
      dateOfReceived: daysAgo(3),
      shiftOfReceived: "MORNING",
      failurePlace: "Warehouse customer — Sunter",
      failurePlaceType: "REGULAR",
      contactPerson: "Ratna Dewi",
      contactEmail: "ratna.dewi@hpm.co.id",
      contactPhone: "+62 813-5566-7788",
      internalPartNo: "NID-7712-11",
      customerPartNo: "76802-K59",
      partName: "Cover Cap Assy",
      productCategoryId: criticalPart.id,
      originPlantType: "PASSTHROUGH",
      originPlantDetail: "NID Plant 2 — Cikarang",
      occurrence: "SECOND_TIME",
      ncDetailId: dimensionDefect.id,
      customerId: hpm.id,
      abnormalSource: "Klaim resmi via email QA customer",
      qualityProblem:
        "Diameter dudukan cover di luar toleransi sehingga cap tidak terkunci penuh saat assembly.",
      lotNo: "LOT-26-0722",
      kanbanNo: "KB-7712-207",
      injectionDate: daysAgo(14),
      assemblyDate: daysAgo(12),
      deliveryDate: daysAgo(8),
      suspectedProcessLine: "Assy line 1, station 4",
      submittedAt: daysAgo(3),
      createdById: qa.id,
      parts: {
        create: [
          {
            side: "STANDARD",
            partName: "Cover Cap Assy",
            nidPartNo: "NID-7712-11",
            qty: 1,
            qtyUnit: "PCS",
            dimensionItem: "ID 12.50 ± 0.05 mm",
            appearanceItem: "Tidak ada flash pada parting line",
          },
          {
            side: "ACTUAL",
            partName: "Cover Cap Assy",
            nidPartNo: "NID-7712-11",
            qty: 3,
            qtyUnit: "BOX",
            dimensionItem: "ID 12.72 mm",
            appearanceItem: "Flash tipis pada parting line",
          },
        ],
      },
    },
  });

  // ── Klaim 3: CPAR_IN_PROGRESS — CPAR terbit, pengisian berjalan ──────────
  const cparClaimNo = await nextClaimNo(db, daysAgo(20));
  const withCpar = await db.claim.create({
    data: {
      claimNo: cparClaimNo,
      status: "CPAR_IN_PROGRESS",
      type: "OFFICIAL",
      dateOfOccurrence: daysAgo(24),
      shiftOfOccurrence: "MORNING",
      dateOfReceived: daysAgo(22),
      shiftOfReceived: "NIGHT",
      failurePlace: "Line Assy 5 — Customer Plant Karawang",
      failurePlaceType: "DOMESTIC",
      contactPerson: "Andi Wijaya",
      contactEmail: "andi.wijaya@tmmin.co.id",
      contactPhone: "+62 812-1100-2200",
      internalPartNo: "NID-4451-02",
      customerPartNo: "90467-09201",
      partName: "Clip Fastener Bumper",
      productCategoryId: criticalPart.id,
      originPlantType: "NID",
      occurrence: "THIRD_OR_MORE",
      ncDetailId: crackBroken.id,
      customerId: tmmin.id,
      abnormalSource: "Temuan line stop customer",
      qualityProblem:
        "Clip patah pada kaki pengunci saat pemasangan bumper, menyebabkan line stop selama 25 menit.",
      lotNo: "LOT-26-0705",
      kanbanNo: "KB-4451-889",
      injectionDate: daysAgo(31),
      assemblyDate: daysAgo(29),
      deliveryDate: daysAgo(26),
      suspectedProcessLine: "Injection line 1, mold cavity 4",
      submittedAt: daysAgo(22),
      reviewedById: qaHead.id,
      reviewedAt: daysAgo(21),
      publishedAt: daysAgo(21),
      createdById: qa.id,
      parts: {
        create: [
          {
            side: "STANDARD",
            partName: "Clip Fastener Bumper",
            nidPartNo: "NID-4451-02",
            qty: 1,
            qtyUnit: "PCS",
            dimensionItem: "Tebal kaki 1.80 ± 0.10 mm",
            appearanceItem: "Tanpa retak, warna hitam merata",
          },
          {
            side: "ACTUAL",
            partName: "Clip Fastener Bumper",
            nidPartNo: "NID-4451-02",
            qty: 46,
            qtyUnit: "PCS",
            dimensionItem: "Tebal kaki 1.62 mm",
            appearanceItem: "Retak rambut pada pangkal kaki pengunci",
          },
        ],
      },
    },
  });

  const cparNo = await nextCparNo(db, daysAgo(20));
  const cpar = await db.cpar.create({
    data: {
      claimId: withCpar.id,
      cparNo,
      responsibilityType: "CFT",
      responsibleDeptId: production.id,
      dueDate: daysAhead(2),
      issuedAt: daysAgo(20),
      cftMembers: { create: [{ departmentId: engineering.id }] },
      sections: {
        create: [
          {
            key: "PROBLEM_DESCRIPTION",
            content:
              "Clip patah pada kaki pengunci saat pemasangan bumper di line customer; 46 pcs terdampak dari lot LOT-26-0705.",
            filledById: qa.id,
            filledAt: daysAgo(19),
          },
          {
            key: "TEMPORARY_ACTION",
            content:
              "Sortir 100% stok di customer dan warehouse NID, ganti part terdampak, dan tahan pengiriman lot terkait.",
            filledById: qa.id,
            filledAt: daysAgo(19),
          },
          { key: "ROOT_CAUSE_OCCURRENCE" },
          { key: "ROOT_CAUSE_OUTFLOW" },
          { key: "PERMANENT_COUNTERMEASURE" },
          { key: "STANDARDIZATION_HORIZONTAL" },
          { key: "EFFECTIVENESS_PLAN" },
        ],
      },
    },
  });

  const requestedDocs = await db.initialDocument.findMany({
    where: { code: { in: ["4M_CHANGE_SHEET", "INSPECTION_STANDARD", "QC_PROCESS_CHART"] } },
  });

  for (const doc of requestedDocs) {
    await db.cparInitialDocument.create({
      data: { cparId: cpar.id, initialDocumentId: doc.id },
    });
  }

  // Jejak audit agar timeline pada halaman detail klaim tidak kosong sejak awal.
  await db.auditLog.createMany({
    data: [
      {
        actorId: qa.id,
        entityType: "Claim",
        entityId: withCpar.id,
        claimId: withCpar.id,
        action: "claim.submit",
        fromStatus: "DRAFT",
        toStatus: "PENDING_QA_HEAD_REVIEW",
        createdAt: daysAgo(22),
      },
      {
        actorId: qaHead.id,
        entityType: "Claim",
        entityId: withCpar.id,
        claimId: withCpar.id,
        action: "claim.review.approve",
        fromStatus: "PENDING_QA_HEAD_REVIEW",
        toStatus: "PUBLISHED",
        createdAt: daysAgo(21),
      },
      {
        actorId: qa.id,
        entityType: "Cpar",
        entityId: cpar.id,
        claimId: withCpar.id,
        action: "claim.followUp",
        fromStatus: "PUBLISHED",
        toStatus: "CPAR_ISSUED",
        createdAt: daysAgo(20),
      },
      {
        actorId: qa.id,
        entityType: "CparSection",
        entityId: cpar.id,
        claimId: withCpar.id,
        action: "cpar.section.fill",
        fromStatus: "CPAR_ISSUED",
        toStatus: "CPAR_IN_PROGRESS",
        createdAt: daysAgo(19),
      },
      {
        actorId: qa.id,
        entityType: "Claim",
        entityId: pending.id,
        claimId: pending.id,
        action: "claim.submit",
        fromStatus: "DRAFT",
        toStatus: "PENDING_QA_HEAD_REVIEW",
        createdAt: daysAgo(3),
      },
    ],
  });

  console.log(`  · DRAFT              ${draft.id}`);
  console.log(`  · PENDING_QA_HEAD_REVIEW  ${pending.claimNo}`);
  console.log(`  · CPAR_IN_PROGRESS   ${withCpar.claimNo} (${cpar.cparNo})`);
}

async function main() {
  console.log("Seeding NCC Portal…");

  await seedRolesAndDepartments();
  console.log(`  · ${ROLES.length} role, ${DEPARTMENTS.length} departemen`);

  await seedMasterData();
  console.log("  · master data (NC detail, product category, initial document, customer, part)");

  await seedUsers();
  console.log(`  · ${USERS.length} pengguna — kata sandi demo: ${DEMO_PASSWORD}`);

  await seedSampleClaims();

  console.log("Selesai.");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void db.$disconnect();
  });
