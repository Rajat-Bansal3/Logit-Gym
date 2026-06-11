import { z } from "zod";
import { MemberStatus, MembershipPlanType } from "../../generated/enums";

export const days = [
	"sunday",
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
] as const;
export const onboardMemberSchema = z.object({
	name: z.string().min(1),
	dateOfBirth: z.coerce.date(),
	address: z.string().min(1),
	phone: z.string().min(1),
	email: z.string().email().optional(),
	gender: z.string().min(1),
	emergencyContact: z.string().optional(),
	avatarUrl: z.string().url().optional(),

	weight: z.number().positive().optional(),
	height: z.number().positive().optional(),

	planType: z.enum(MembershipPlanType),
	planName: z.string().optional(),
	membershipStartDate: z.coerce.date(),
	dueAmount: z.number().min(0).default(0),
	membershipAmount: z.number().min(1).max(1_00_00_000),
	isMachine: z.boolean().default(false),
	serialNumbers: z.array(z.string()),
	cardNumber: z.string(),
	IsBioPasswordUpload: z.boolean().optional(),
	IsCardUpload: z.boolean().optional(),
	IsFaceUpload: z.boolean().optional(),
	IsFPUpload: z.boolean().optional(),
});

const daysEnum = z.enum([
	"sunday",
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
]);

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
	status: z.enum(MemberStatus).optional(),
	dateOfBirth: z.coerce.date(),
});
export const deleteMemberSchema = z.object({
	serialNumbers: z.array(z.string()),
	memberId: z.string(),
	isMachine: z.boolean(),
});

export const listMembersQuerySchema = z.object({
	status: z.enum(MemberStatus).optional(),
	serialNumber: z.string().min(1).max(100),
	isMachine: z.coerce.boolean().default(false),
	search: z.string().optional(),
	page: z.coerce.number().min(1).default(1),
	limit: z.coerce.number().min(1).max(100).default(20),
});

export const markAttendanceSchema = z.object({
	gym_hash: z.string().min(1),
	day: daysEnum,
});

export const reportQuerySchema = z.object({
	from: z.coerce.date().optional(),
	to: z.coerce.date().optional(),
});

export type OnboardMember = z.infer<typeof onboardMemberSchema>;
export type UpdateMember = z.infer<typeof updateMemberSchema>;
export type ListMembersQuery = z.infer<typeof listMembersQuerySchema>;
export type MarkAttendance = z.infer<typeof markAttendanceSchema>;
export type ReportQuery = z.infer<typeof reportQuerySchema>;
export type daysEnumType = z.infer<typeof daysEnum>;
