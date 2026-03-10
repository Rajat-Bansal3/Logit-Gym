import { AppError } from "./app-errors";

export enum MemberErrorCode {
  UNAUTHORIZED = "UNAUTHORIZED",
  NOT_FOUND = "NOT_FOUND",
  FORBIDDEN = "FORBIDDEN",
  CONFLICT = "CONFLICT",
  BAD_REQUEST = "BAD_REQUEST",
}

const MEMBER_ERROR_STATUS: Record<MemberErrorCode, number> = {
  [MemberErrorCode.UNAUTHORIZED]: 401,
  [MemberErrorCode.NOT_FOUND]: 404,
  [MemberErrorCode.FORBIDDEN]: 403,
  [MemberErrorCode.CONFLICT]: 409,
  [MemberErrorCode.BAD_REQUEST]: 400,
};

export class MemberError extends AppError {
  readonly code: MemberErrorCode;

  constructor(
    code: MemberErrorCode,
    message?: string,
    options?: { cause?: unknown },
  ) {
    super(
      message ?? MemberError.defaultMessage(code),
      MEMBER_ERROR_STATUS[code],
      options,
    );
    this.code = code;
  }

  private static defaultMessage(code: MemberErrorCode): string {
    switch (code) {
      case MemberErrorCode.UNAUTHORIZED:
        return "Unauthorized";
      case MemberErrorCode.NOT_FOUND:
        return "Member not found";
      case MemberErrorCode.FORBIDDEN:
        return "Access to this member is forbidden";
      case MemberErrorCode.CONFLICT:
        return "Member already exists";
      case MemberErrorCode.BAD_REQUEST:
        return "Invalid member request";
      default:
        return "Member error";
    }
  }
}
