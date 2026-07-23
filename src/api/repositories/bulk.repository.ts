import type { CheckInType, PrismaClient } from "../../generated/client";

export type createManyAttendanceType = {
	memberId: string;
	membershipCode: number;
	timestamp: Date;
	gymId: string;
	type: CheckInType;
}[];

export class BulkRepository {
	private client: PrismaClient;
	constructor(client: PrismaClient) {
		this.client = client;
	}
	async syncAttenceWithLogs(data: createManyAttendanceType) {
		await this.client.attendanceLog.createMany({
			data: data,
			skipDuplicates: true,
		});
	}
}
