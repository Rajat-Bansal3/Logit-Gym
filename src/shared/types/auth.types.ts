import { z } from "zod";
import { UserRole } from "../../generated/enums";

export interface AuthResponse {
	success: boolean;
	token: string;
	user: {
		id: string;
		email: string;
		role: string;
		memberId?: string | null;
		gymId?: string | null;
	};
}

export const loginSchema = z.object({
	username: z
		.string()
		.min(1, "username is required")
		.transform((username) => username.toLowerCase()),
	email: z
		.string()
		.min(1, "Email is required")
		.transform((email) => email.toLowerCase().trim())
		.optional(),

	password: z
		.string()
		.min(1, "Password is required")
		.min(6, "Password must be at least 6 characters"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
	username: z
		.string()
		.min(1, "username is required")
		.transform((username) => username.toLowerCase().trim()),
	email: z
		.string()
		.transform((email) => email.toLowerCase().trim())
		.optional(),

	password: z
		.string()
		.min(1, "Password is required")
		.min(6, "Password must be at least 6 characters"),

	role: z.enum(UserRole).default("MEMBER"),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export type AccessTokenPayload = z.infer<
	z.ZodObject<{
		sub: z.ZodString;
		role: z.ZodEnum<typeof UserRole>;
		gymId: z.ZodOptional<z.ZodString>;
		memberId: z.ZodOptional<z.ZodString>;
		userId: z.ZodString;
		iat: z.ZodNumber;
		exp: z.ZodNumber;
	}>
>;

const ValidateAccessTokenSchema = z.discriminatedUnion("valid", [
	z.object({
		valid: z.literal(true),
		user: z.object({
			id: z.string(),
			role: z.enum(UserRole),
			gymId: z.string().optional(),
			memberId: z.string().optional(),
			userId: z.string(),
		}),
	}),
	z.object({
		valid: z.literal(false),
	}),
]);

export type ValidateAccessTokenResult = z.infer<typeof ValidateAccessTokenSchema>;
export const AuthenticatedUserSchema = z.object({
	id: z.string(),
	role: z.enum(UserRole),
	gymId: z.string().optional(),
	memberId: z.string().optional(),
	userId: z.string(),
});
export type AuthenticatedUser = z.infer<typeof AuthenticatedUserSchema>;
