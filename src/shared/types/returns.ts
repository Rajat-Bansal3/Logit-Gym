import { z } from "zod";
import { UserRole } from "@/generated/enums";

export type BaseResponse<T = null> = {
	success: boolean;
	message: string;
	data?: T;
};
export const loginReturn = z.object({
	tokens: z.object({
		authToken: z.string(),
		refreshToken: z.string(),
	}),
	user: z.object({
		id: z.string(),
		email: z.string().email(),
		role: z.nativeEnum(UserRole),
	}),
});
export type loginReturnType = z.infer<typeof loginReturn>;
export type registerReturnType = z.infer<typeof loginReturn>;
