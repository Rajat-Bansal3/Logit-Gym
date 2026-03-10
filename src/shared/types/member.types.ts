import { z } from "zod";

export const GenderEnum = z.enum(["MALE", "FEMALE", "OTHER"]);

export const MemberStatusEnum = z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]); // adjust as needed

export const onboardMemberSchema = z.object({
  name: z.string().min(1, "Name is required"),
  dateOfBirth: z.coerce.date(),
  address: z.string().min(1, "Address is required"),
  phone: z.string().min(1, "Phone is required"),
  email: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  gender: GenderEnum,
  emergencyContact: z.string().nullable(),
  weight: z.number().positive().nullable(),
  height: z.number().positive().nullable(),
  age: z.number().int().positive().nullable(),
});
export type OnboardMemberInput = z.infer<typeof onboardMemberSchema>;

export const updateMemberSchema = z.object({
  name: z.string().min(1).optional(),
  dateOfBirth: z.coerce.date().optional(),
  address: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  email: z.string().email().optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
  gender: GenderEnum.optional(),
  emergencyContact: z.string().optional().nullable(),
  weight: z.number().positive().optional().nullable(),
  height: z.number().positive().optional().nullable(),
  age: z.number().int().positive().optional().nullable(),
  status: MemberStatusEnum.optional(),
});
