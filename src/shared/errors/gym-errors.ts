import { AppError } from "./app-errors";

export enum GymErrorCode {
  UNAUTHORIZED = "UNAUTHORIZED",
  NOT_FOUND = "NOT_FOUND",
  FORBIDDEN = "FORBIDDEN",
  CONFLICT = "CONFLICT",
  BAD_REQUEST = "BAD_REQUEST",
}

const GYM_ERROR_STATUS: Record<GymErrorCode, number> = {
  [GymErrorCode.UNAUTHORIZED]: 401,
  [GymErrorCode.NOT_FOUND]: 404,
  [GymErrorCode.FORBIDDEN]: 403,
  [GymErrorCode.CONFLICT]: 409,
  [GymErrorCode.BAD_REQUEST]: 400,
};
export class GymError extends AppError {
  readonly code: GymErrorCode;

  constructor(
    code: GymErrorCode,
    message?: string,
    options?: { cause?: unknown },
  ) {
    super(
      message ?? GymError.defaultMessage(code),
      GYM_ERROR_STATUS[code],
      options,
    );

    this.code = code;
  }

  private static defaultMessage(code: GymErrorCode): string {
    switch (code) {
      case GymErrorCode.UNAUTHORIZED:
        return "Unauthorized";
      case GymErrorCode.NOT_FOUND:
        return "Gym not found";
      case GymErrorCode.FORBIDDEN:
        return "Access to this gym is forbidden";
      case GymErrorCode.CONFLICT:
        return "Gym already exists";
      case GymErrorCode.BAD_REQUEST:
        return "Invalid gym request";
      default:
        return "Gym error";
    }
  }
}
