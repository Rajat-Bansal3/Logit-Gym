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
			const res = await axios.post(`${env.MACHINE_SERVER}/UploadUser`, null, {
				params: {
					APIKey: apiKey,
					EmployeeName: memberName,
					EmployeeCode: biometricCode.toString(),
					CardNumber: cardNumber,
					SerialNumbers: serialNumbers.join(","),
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
			});

			return res.statusText;
		} catch (error) {
			if (axios.isAxiosError(error)) {
				if (!error.response) {
					throw new MachineError(MachineErrorCode.API_UNREACHABLE, JSON.stringify(error));
				}
				if (error.response.status < 500) {
					throw new MachineError(MachineErrorCode.API_REJECTED, JSON.stringify(error));
				}
				throw new MachineError(MachineErrorCode.API_SERVER_ERROR, JSON.stringify(error));
			}
			throw new MachineError(MachineErrorCode.REPOSITORY_ERROR, JSON.stringify(error));
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
		const res = await axios.post(`${env.MACHINE_SERVER}/DeleteUser`, null, {
			params: {
				APIKey: apiKey,
				EmployeeCode: biometricCode.toString(),
				SerialNumber: serialNumbers.join(","),
			},
			timeout: 5000,
		});

		return res.statusText;
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
		const res = await axios.get(`${env.MACHINE_SERVER}/BlockUserinBiometric`, {
			params: {
				APIKey: apiKey,
				EmployeeCode: biometricCode.toString(),
				SerialNumber: serialNumbers.join(","),
				BlockUser: block ? 0 : 1,
			},
			timeout: 5000,
		});

		return res.statusText;
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
		const res = await axios.get(`${env.MACHINE_SERVER}/SetUserExpiration`, {
			params: {
				APIKey: apiKey,
				SerialNumber: serialNumbers.join(","),
				EmployeeCode: biometricCode.toString(),
				ExpirationDate: expirationDate.toISOString().split("T")[0],
			},
			timeout: 5000,
		});

		return res.statusText;
	}
}
