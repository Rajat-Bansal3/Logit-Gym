import z from "zod";
import { BioPref, MembershipPlanType } from "../../generated/enums";
import type { OnboardMember } from "./member.types";

const parseJson = <T extends z.ZodTypeAny>(schema: T) =>
	z.preprocess((val) => {
		if (typeof val === "string") {
			try {
				return JSON.parse(val);
			} catch {
				return val;
			}
		}
		return val;
	}, schema);
export const createGymSchema = z.object({
	name: z.string().min(1),
	address: z.string().min(1),
	startingMembershipCode: z.coerce.number().optional(),
	profile: parseJson(
		z.object({
			timing: z.string(),
			openDays: z.preprocess((val) => {
				if (typeof val === "string") {
					return [val];
				}
				return val;
			}, z.array(z.string())),
			instagram: z.string().optional(),
			genderAllowed: z.string(),
			ownerName: z.string(),
			ownerContact: z.string(),
			fitnessProfession: z.string().optional(),
			amenities: z.preprocess((val) => {
				if (typeof val === "string") {
					return [val];
				}
				return val;
			}, z.array(z.string()).optional()),
			referralOffer: z.string().optional(),
		}),
	),
	settings: parseJson(
		z.object({
			biometricCodePreference: z.enum(BioPref).default("AUTO"),
		}),
	),
});

export const updateGymSchema = z.object({
	name: z.string().min(1).optional(),
	address: z.string().min(1).optional(),
	profile: z
		.object({
			timing: z.string().optional(),
			openDays: z.array(z.string()).optional(),
			instagram: z.string().optional(),
			genderAllowed: z.string().optional(),
			ownerName: z.string().optional(),
			ownerContact: z.string().optional(),
			fitnessProfession: z.string().optional(),
			amenities: z.array(z.string()).optional(),
			images: z.array(z.string()).optional(),
			referralOffer: z.string().optional(),
		})
		.optional(),
});

export const addMachineSchema = z.object({
	serialNumber: z.string().min(1).max(100),
	machineName: z.string().min(1).max(100),
});
export const getPresignedUrlsSchema = z.object({
	id: z.string(),
	mimeType: z.string(),
});
export const createSubscriptionSchema = z.object({
	planId: z.string(),
	// status: z.enum(SubscriptionStatus),
	// currentPeriodStart: z.coerce.date(),
	// currentPeriodEnd: z.coerce.date(),
	// trialEndsAt: z.coerce.date(),
	// gracePeriodEnd: z.coerce.date(),
	// cancelAtPeriodEnd: z.boolean().default(false),
});
export const syncDataSchema = z.object({
	date: z.string(),
	serialNumber: z.array(z.string()),
});
export const bulkAddSchema = z.object({
	method: z.enum(["machineSync", "excel"]),
	serialNumber: z.string().optional(),
});
export const bulkMembersSchema = z.array(
	z.object({
		EmployeeCode: z.number(),
		EmployeeName: z.string(),
		Gender: z.string(),
		PhoneNumber: z.number(),
		EmergencyContact: z.number(),
		Email: z.email(),

		DOB: z.coerce.date(),

		Weight: z.number(),
		Height: z.number(),

		MembershipPlan: z.string().trim().pipe(z.enum(MembershipPlanType)),

		MembershipAmount: z.number(),

		StartDate: z.coerce.date(),
	}),
);
export type ValidMember = {
	membershipCode: number;
	data: OnboardMember;
};
export type UpdateGym = z.infer<typeof updateGymSchema>;
export type CreateGym = z.infer<typeof createGymSchema>;
export type AddMachine = z.infer<typeof addMachineSchema>;
export type CreateSubscription = z.infer<typeof createSubscriptionSchema>;
export type SyncData = z.infer<typeof syncDataSchema>;
export type bulkAdd = z.infer<typeof bulkAddSchema>;
export type bulkAddMembers = z.infer<typeof bulkMembersSchema>;
