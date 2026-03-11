import { z } from "zod";
import { UserRole } from "../../generated/enums";

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
    email: z.string(),
    role: z.enum(UserRole),
    gymId: z.string().optional(),
    memberId: z.string().optional(),
  }),
});

export const paginationSchema = z.object({
  total: z.number(),
  current: z.number().min(1),
  limit: z.number().min(1),
});

export type loginReturnType = z.infer<typeof loginReturn>;
export type registerReturnType = z.infer<typeof loginReturn>;
export type paginationReturnType = z.infer<typeof paginationSchema>;
