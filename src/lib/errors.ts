/**
 * Galat domain. Semuanya membawa `httpStatus` agar server action dan route handler
 * memetakannya ke respons yang benar tanpa menebak-nebak.
 */
export abstract class DomainError extends Error {
  abstract readonly httpStatus: number;
  abstract readonly code: string;
}

/** Pengguna terautentikasi tetapi tidak berhak — kriteria penerimaan #4. */
export class ForbiddenError extends DomainError {
  readonly httpStatus = 403;
  readonly code = "FORBIDDEN";

  constructor(
    message = "Anda tidak berhak melakukan tindakan ini.",
    readonly action?: string,
  ) {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class UnauthorizedError extends DomainError {
  readonly httpStatus = 401;
  readonly code = "UNAUTHORIZED";

  constructor(message = "Sesi tidak ditemukan. Silakan masuk kembali.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class NotFoundError extends DomainError {
  readonly httpStatus = 404;
  readonly code = "NOT_FOUND";

  constructor(message = "Data tidak ditemukan.") {
    super(message);
    this.name = "NotFoundError";
  }
}

/**
 * Transisi status yang tidak ada di tabel `TRANSITIONS` (§5).
 * Dilempar walau server action dipanggil langsung — kriteria penerimaan #3.
 */
export class IllegalTransitionError extends DomainError {
  readonly httpStatus = 409;
  readonly code = "ILLEGAL_TRANSITION";

  constructor(
    readonly fromStatus: string,
    readonly toStatus: string,
    message?: string,
  ) {
    super(message ?? `Perpindahan status dari ${fromStatus} ke ${toStatus} tidak diizinkan.`);
    this.name = "IllegalTransitionError";
  }
}

/**
 * Submit CPAR final ditolak karena ada section wajib yang kosong.
 * Daftar section dibawa serta agar pop-up dapat menyebutkannya (kriteria penerimaan #7).
 */
export class SubmissionIncompleteError extends DomainError {
  readonly httpStatus = 422;
  readonly code = "SUBMISSION_INCOMPLETE";

  constructor(readonly missingSections: readonly string[]) {
    super("Submission incomplete — masih ada section wajib yang belum terisi.");
    this.name = "SubmissionIncompleteError";
  }
}

/** Aturan bisnis dilanggar (mis. alasan ignore terlalu pendek, evidence kosong). */
export class ValidationError extends DomainError {
  readonly httpStatus = 422;
  readonly code = "VALIDATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
