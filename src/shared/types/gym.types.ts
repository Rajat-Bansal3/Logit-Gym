import z from "zod";
import { BioPref } from "../../generated/enums";
export const createGymSchema = z.object({
	name: z.string().min(1),
	address: z.string().min(1),
	startingMembershipCode: z.coerce.number().optional(),
	profile: z.object({
		timing: z.string(),
		openDays: z.array(z.string()),
		instagram: z.string().optional(),
		genderAllowed: z.string(),
		ownerName: z.string(),
		ownerContact: z.string(),
		fitnessProfession: z.string(),
		amenities: z.array(z.string()),
		images: z.array(z.string()),
		referralOffer: z.string(),
	}),
	settings: z.object({
		biometricCodePreference: z.enum(BioPref).default("AUTO"),
	}),
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
export type UpdateGym = z.infer<typeof updateGymSchema>;
export type CreateGym = z.infer<typeof createGymSchema>;
export type AddMachine = z.infer<typeof addMachineSchema>;
export type CreateSubscription = z.infer<typeof createSubscriptionSchema>;
export type SyncData = z.infer<typeof syncDataSchema>;
