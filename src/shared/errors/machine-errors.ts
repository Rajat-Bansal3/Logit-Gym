import { AppError } from "./app-errors";

export enum MachineErrorCode {
	ALREADY_EXISTS = "ALREADY_EXISTS",
	NOT_FOUND = "NOT_FOUND",
	REPOSITORY_ERROR = "REPOSITORY_ERROR",
	API_UNREACHABLE = "API_UNREACHABLE",
	API_REJECTED = "API_REJECTED",
	API_SERVER_ERROR = "API_SERVER_ERROR",
}

const MACHINE_ERROR_STATUS: Record<MachineErrorCode, number> = {
	[MachineErrorCode.ALREADY_EXISTS]: 409,
	[MachineErrorCode.NOT_FOUND]: 404,
	[MachineErrorCode.REPOSITORY_ERROR]: 500,
	[MachineErrorCode.API_UNREACHABLE]: 503,
	[MachineErrorCode.API_REJECTED]: 400,
	[MachineErrorCode.API_SERVER_ERROR]: 502,
};

export class MachineError extends AppError {
	readonly code: MachineErrorCode;

	constructor(code: MachineErrorCode, message?: string, options?: { cause?: unknown }) {
		super(message ?? MachineError.defaultMessage(code), MACHINE_ERROR_STATUS[code], options);
		this.code = code;
	}

	private static defaultMessage(code: MachineErrorCode): string {
		switch (code) {
			case MachineErrorCode.ALREADY_EXISTS:
				return "Machine with this serial number already exists";
			case MachineErrorCode.NOT_FOUND:
				return "Machine not found";
			case MachineErrorCode.REPOSITORY_ERROR:
				return "Unexpected database error";
			case MachineErrorCode.API_UNREACHABLE:
				return "SmartOffice server is unreachable";
			case MachineErrorCode.API_REJECTED:
				return "SmartOffice rejected the request";
			case MachineErrorCode.API_SERVER_ERROR:
				return "SmartOffice server encountered an error";
			default:
				return "Machine error";
		}
	}
}
