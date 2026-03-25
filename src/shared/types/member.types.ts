import { z } from "zod";
import { MemberStatus, MembershipPlanType } from "../../generated/enums";

export const onboardMemberSchema = z.object({
	// core identity
	name: z.string().min(1),
	dateOfBirth: z.coerce.date(),
	address: z.string().min(1),
	phone: z.string().min(1),
	email: z.string().email().optional(),
	gender: z.string().min(1),
	emergencyContact: z.string().optional(),
	avatarUrl: z.string().url().optional(),

	// body metrics
	weight: z.number().positive().optional(),
	height: z.number().positive().optional(),

	// initial membership
	planType: z.nativeEnum(MembershipPlanType),
	planName: z.string().optional(),
	membershipStartDate: z.coerce.date(),
	dueAmount: z.number().min(0).default(0),
});

export const updateMemberSchema = z.object({
	name: z.string().min(1).optional(),
	address: z.string().min(1).optional(),
	phone: z.string().min(1).optional(),
	email: z.string().email().nullable().optional(),
	gender: z.string().min(1).optional(),
	emergencyContact: z.string().nullable().optional(),
	avatarUrl: z.string().url().nullable().optional(),
	weight: z.number().positive().nullable().optional(),
	height: z.number().positive().nullable().optional(),
	status: z.nativeEnum(MemberStatus).optional(),
});

export const listMembersQuerySchema = z.object({
	status: z.nativeEnum(MemberStatus).optional(),
	search: z.string().optional(),
	page: z.coerce.number().min(1).default(1),
	limit: z.coerce.number().min(1).max(100).default(20),
});

export type OnboardMember = z.infer<typeof onboardMemberSchema>;
export type UpdateMember = z.infer<typeof updateMemberSchema>;
export type ListMembersQuery = z.infer<typeof listMembersQuerySchema>;
