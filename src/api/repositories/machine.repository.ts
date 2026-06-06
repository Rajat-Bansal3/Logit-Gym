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
		} catch (_error) {
			throw new MachineError(MachineErrorCode.REPOSITORY_ERROR);
		}

		try {
			const res = await axios.post(`${env.MACHINE_SERVER}/DeleteBiometric`, null, {
				params: {
					APIKey: apiKey,
					SerialNumber: serialNumber,
				},
				timeout: 5000,
			});
			return res.data;
		} catch (error) {
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

	async addUser({
		cardNumber,
		apiKey,
		serialNumber,
		memberName,
		biometricCode,
		IsBioPasswordUpload,
		IsCardUpload,
		IsFaceUpload,
		IsFPUpload,
	}: {
		apiKey: string;
		serialNumber: string;
		memberName: string;
		biometricCode: number;
		cardNumber: string;
		IsFaceUpload: boolean;
		IsFPUpload: boolean;
		IsCardUpload: boolean;
		IsBioPasswordUpload: boolean;
	}): Promise<string> {
		try {
			const res = await axios.post(
				`${env.MACHINE_SERVER}/AddUserFromApp`,
				{
					APIKey: apiKey,
					EmployeeName: memberName,
					EmployeeCode: biometricCode.toString(),
					CardNumber: cardNumber,
					SerialNumber: serialNumber,
					VerifyMode: "face+card",
					IsFaceUpload,
					IsFPUpload,
					IsCardUpload,
					IsBioPasswordUpload,
				},
				{
					timeout: 5000,
				},
			);
			return res.data;
		} catch (error) {
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
	async removeUser({
		apiKey,
		serialNumber,
		biometricCode,
	}: {
		apiKey: string;
		serialNumber: string;
		biometricCode: number;
	}): Promise<string> {
		try {
			const res = await axios.post(
				`${env.MACHINE_SERVER}/DeleteUser`,
				{
					APIKey: apiKey,
					EmployeeCode: biometricCode.toString(),
					SerialNumber: serialNumber,
				},
				{
					timeout: 5000,
				},
			);
			return res.data;
		} catch (error) {
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
	async toggleUserBlock({
		apiKey,
		serialNumber,
		biometricCode,
		block,
	}: {
		apiKey: string;
		serialNumber: string;
		biometricCode: number;
		block: boolean;
	}): Promise<string> {
		try {
			const res = await axios.get(`${env.MACHINE_SERVER}/BlockUserinBiometric`, {
				params: {
					APIKey: apiKey,
					EmployeeCode: biometricCode.toString(),
					SerialNumber: serialNumber,
					BlockUser: block ? 0 : 1,
				},
				timeout: 5000,
			});
			return res.data;
		} catch (error) {
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
	async setUserExpiration({
		apiKey,
		serialNumber,
		biometricCode,
		expirationDate,
	}: {
		apiKey: string;
		serialNumber: string;
		biometricCode: number;
		expirationDate: Date;
	}): Promise<string> {
		try {
			const res = await axios.get(`${env.MACHINE_SERVER}/SetUserExpiration`, {
				params: {
					APIKey: apiKey,
					SerialNumber: serialNumber,
					EmployeeCode: biometricCode.toString(),
					ExpirationDate: expirationDate.toISOString().split("T")[0],
				},
				timeout: 5000,
			});
			return res.data;
		} catch (error) {
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
}
