import { z } from "zod";
import { UserRole } from "@/generated/enums";

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
  email: z
    .string()
    .min(1, "Email is required")
    .email("Invalid email format")
    .transform((email) => email.toLowerCase().trim()),

  password: z
    .string()
    .min(1, "Password is required")
    .min(6, "Password must be at least 6 characters"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Invalid email format")
    .transform((email) => email.toLowerCase().trim()),

  password: z
    .string()
    .min(1, "Password is required")
    .min(6, "Password must be at least 6 characters"),

  role: z.nativeEnum(UserRole).default("MEMBER"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type ValidateAccessTokenResult = z.infer<
  z.ZodDiscriminatedUnion<
    "valid",
    [
      z.ZodObject<{
        valid: z.ZodLiteral<true>;
        user: z.ZodObject<{
          id: z.ZodString;
          role: z.ZodNativeEnum<typeof UserRole>;
        }>;
      }>,
      z.ZodObject<{
        valid: z.ZodLiteral<false>;
      }>,
    ]
  >
>;
export type AccessTokenPayload = z.infer<
  z.ZodObject<{
    sub: z.ZodString;
    role: z.ZodNativeEnum<typeof UserRole>;
    iat: z.ZodNumber;
    exp: z.ZodNumber;
  }>
>;
