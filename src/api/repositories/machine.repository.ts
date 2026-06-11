import axios from "axios";
import { env } from "../../env";
import type { PrismaClient } from "../../generated/client";
import { MachineError, MachineErrorCode } from "../../shared/errors/machine-errors";

export class MachineRepository {
	constructor(private readonly prisma: PrismaClient) {}
	async addMachine({
		serialNumber,
		machinename,
		apiKey,
		gymId,
	}: {
		serialNumber: string;
		machinename: string;
		apiKey: string;
		gymId: string;
	}): Promise<string> {
		let machineId: string;
		try {
			const db_machine = await this.prisma.machines.create({
				data: {
					name: machinename,
					serialNumber,
					gymId,
				},
			});
			machineId = db_machine.id;
		} catch (_error) {
			throw new MachineError(MachineErrorCode.REPOSITORY_ERROR);
		}

		try {
			const res = await axios.post(`${env.MACHINE_SERVER}/AddBiometric`, null, {
				params: {
					APIKey: apiKey,
					DeviceName: machineId,
					SerialNumber: serialNumber,
				},
				timeout: 5000,
			});
			return res.data;
		} catch (error) {
			await this.prisma.machines.delete({ where: { serialNumber } });

			if (axios.isAxiosError(error)) {
				if (!error.response) {
					throw new MachineError(MachineErrorCode.API_UNREACHABLE);
				}
				if (error.response.status < 500) {
					throw new MachineError(MachineErrorCode.API_REJECTED);
				}
				throw new MachineError(MachineErrorCode.API_SERVER_ERROR);
			}

			throw new MachineError(MachineErrorCode.REPOSITORY_ERROR);
		}
	}
	async removeMachine({
		serialNumber,
		apiKey,
	}: {
		serialNumber: string;
		apiKey: string;
	}): Promise<string> {
		try {
			await this.prisma.machines.delete({
				where: { serialNumber },
			});
		} catch (error) {
			console.log(error);
			throw new MachineError(MachineErrorCode.REPOSITORY_ERROR);
		}

		try {
			const res = await axios.get(`${env.MACHINE_SERVER}/DeleteBiometric`, {
				params: {
					APIKey: apiKey,
					SerialNumber: serialNumber,
				},
				timeout: 5000,
			});
			//    const res = await axios.post(
			//     `${env.MACHINE_SERVER}/DeleteBiometric?APIKey=${apiKey}&SerialNumber=${serialNumber}`,
			//     null,
			//     {
			//       timeout: 5000,
			//     },
			//   );
			return res.data;
		} catch (error) {
			console.log(error);
			if (axios.isAxiosError(error)) {
				if (!error.response) {
					throw new MachineError(MachineErrorCode.API_UNREACHABLE);
				}
				if (error.response.status < 500) {
					throw new MachineError(MachineErrorCode.API_REJECTED, JSON.stringify(error));
				}
				throw new MachineError(MachineErrorCode.API_SERVER_ERROR, JSON.stringify(error));
			}

			throw new MachineError(MachineErrorCode.REPOSITORY_ERROR, JSON.stringify(error));
		}
	}

	async addUser({
		cardNumber,
		apiKey,
		serialNumbers,
		memberName,
		biometricCode,
		IsBioPasswordUpload,
		IsCardUpload,
		IsFaceUpload,
		IsFPUpload,
	}: {
		apiKey: string;
		serialNumbers: string[];
		memberName: string;
		biometricCode: number;
		cardNumber: string;
		IsFaceUpload: boolean;
		IsFPUpload: boolean;
		IsCardUpload: boolean;
		IsBioPasswordUpload: boolean;
	}): Promise<string> {
		try {
			const results = await Promise.allSettled(
				serialNumbers.map((s_no) =>
					axios.post(`${env.MACHINE_SERVER}/UploadUser`, null, {
						params: {
							APIKey: apiKey,
							EmployeeName: memberName,
							EmployeeCode: biometricCode.toString(),
							CardNumber: cardNumber,
							SerialNumbers: s_no,
							VerifyMode: "face+card",
							IsFaceUpload,
							IsFPUpload,
							IsCardUpload,
							IsBioPasswordUpload,
						},
						timeout: 5000,
						headers: {
							"Content-Type": "application/json",
						},
					}),
				),
			);
			const failed = results
				.map((result, index) => ({
					result,
					serialNumber: serialNumbers[index],
				}))
				.filter(({ result }) => result.status === "rejected");

			if (failed.length > 0) {
				const failedSerials = failed.map(({ serialNumber }) => serialNumber).join(", ");

				throw new MachineError(
					MachineErrorCode.API_REJECTED,
					`Failed to register on ${failed.length} of ${serialNumbers.length} machines. Failed serials: ${failedSerials}`,
				);
			}
			return "successfully added to all machines";
		} catch (error) {
			if (axios.isAxiosError(error)) {
				if (!error.response) {
					throw new MachineError(MachineErrorCode.API_UNREACHABLE);
				}
				if (error.response.status < 500) {
					throw new MachineError(MachineErrorCode.API_REJECTED, JSON.stringify(error));
				}
				throw new MachineError(MachineErrorCode.API_SERVER_ERROR);
			}
			throw new MachineError(MachineErrorCode.REPOSITORY_ERROR);
		}
	}
	async removeUser({
		apiKey,
		serialNumbers,
		biometricCode,
	}: {
		apiKey: string;
		serialNumbers: string[];
		biometricCode: number;
	}): Promise<string> {
		const results = await Promise.allSettled(
			serialNumbers.map((s_no) =>
				axios.post(
					`${env.MACHINE_SERVER}/DeleteUser`,
					{
						APIKey: apiKey,
						EmployeeCode: biometricCode.toString(),
						SerialNumber: s_no,
					},
					{ timeout: 5000 },
				),
			),
		);

		const failed = results.filter((r) => r.status === "rejected");
		if (failed.length > 0) {
			throw new MachineError(
				MachineErrorCode.API_REJECTED,
				`Failed to remove user from ${failed.length} of ${serialNumbers.length} machines`,
			);
		}

		return "User removed from all machines successfully";
	}
	async toggleUserBlock({
		apiKey,
		serialNumbers,
		biometricCode,
		block,
	}: {
		apiKey: string;
		serialNumbers: string[];
		biometricCode: number;
		block: boolean;
	}): Promise<string> {
		const results = await Promise.allSettled(
			serialNumbers.map((s_no) =>
				axios.get(`${env.MACHINE_SERVER}/BlockUserinBiometric`, {
					params: {
						APIKey: apiKey,
						EmployeeCode: biometricCode.toString(),
						SerialNumber: s_no,
						BlockUser: block ? 0 : 1,
					},
					timeout: 5000,
				}),
			),
		);

		const failed = results.filter((r) => r.status === "rejected");
		if (failed.length > 0) {
			throw new MachineError(
				MachineErrorCode.API_REJECTED,
				`Failed to ${block ? "block" : "unblock"} user on ${failed.length} of ${serialNumbers.length} machines`,
			);
		}

		return `User ${block ? "blocked" : "unblocked"} on all machines successfully`;
	}
	async setUserExpiration({
		apiKey,
		serialNumbers,
		biometricCode,
		expirationDate,
	}: {
		apiKey: string;
		serialNumbers: string[];
		biometricCode: number;
		expirationDate: Date;
	}): Promise<string> {
		const results = await Promise.allSettled(
			serialNumbers.map((s_no) =>
				axios.get(`${env.MACHINE_SERVER}/SetUserExpiration`, {
					params: {
						APIKey: apiKey,
						SerialNumber: s_no,
						EmployeeCode: biometricCode.toString(),
						ExpirationDate: expirationDate.toISOString().split("T")[0],
					},
					timeout: 5000,
				}),
			),
		);

		const failed = results.filter((r) => r.status === "rejected");
		if (failed.length > 0) {
			throw new MachineError(
				MachineErrorCode.API_REJECTED,
				`Failed to set expiration on ${failed.length} of ${serialNumbers.length} machines`,
			);
		}

		return "Expiration set on all machines successfully";
	}
}
