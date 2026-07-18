import type { Prisma, PrismaClient } from "../../generated/client";
import type { RegisterInput } from "../../shared/types/auth.types";

type UserEmailLookup = Prisma.UserGetPayload<{
	select: {
		id: true;
		role: true;
		username: true;
		password: true;
		member: {
			select: {
				id: true;
			};
		};
		gym: {
			select: {
				id: true;
			};
		};
	};
}>;

export class UserRepository {
	private client: PrismaClient;
	constructor(client: PrismaClient) {
		this.client = client;
	}
	getUserByUsername = async (username: string): Promise<UserEmailLookup | null> => {
		console.log(username);
		return this.client.user.findUnique({
			where: {
				username,
			},
			select: {
				id: true,
				role: true,
				username: true,
				password: true,
				member: {
					select: {
						id: true,
					},
				},
				gym: {
					select: {
						id: true,
					},
				},
			},
		});
	};
	createUser = async (data: RegisterInput): Promise<UserEmailLookup> => {
		return this.client.user.create({
			data: {
				...(data.email && { email: data.email }),
				username: data.username,
				password: data.password,
				role: data.role,
				...(data.role === "MEMBER" && {
					member: {
						connect: { username: data.username },
					},
				}),
			},
			select: {
				id: true,
				role: true,
				username: true,
				password: true,
				member: {
					select: {
						id: true,
					},
				},
				gym: {
					select: {
						id: true,
					},
				},
			},
		});
	};
}
