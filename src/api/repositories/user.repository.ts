import type { Prisma, PrismaClient } from "../../generated/client";
import type { RegisterInput } from "../../shared/types/auth.types";

type UserEmailLookup = Prisma.UserGetPayload<{
	select: {
		id: true;
		role: true;
		email: true;
		password: true;
	};
}>;

export class UserRepository {
	private client: PrismaClient;
	constructor(client: PrismaClient) {
		this.client = client;
	}
	async getUserByEmail(email: string): Promise<UserEmailLookup | null> {
		return this.client.user.findUnique({
			where: {
				email,
			},
			select: {
				id: true,
				role: true,
				email: true,
				password: true,
			},
		});
	}
	async createUser(data: RegisterInput): Promise<UserEmailLookup> {
		return await this.client.user.create({
			data,
			select: {
				id: true,
				role: true,
				email: true,
				password: true,
			},
		});
	}
}
