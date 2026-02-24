import z from "zod";

export const createGymSchema = z.object({
	name: z.string().min(1),
	address: z.string().min(1),
	profile: z.object({
		timing: z.string(),
		openDays: z.array(z.string()),
		fees: z.coerce.number(),
		genderAllowed: z.string(),
		ownerName: z.string(),
		ownerContact: z.string(),
		fitnessProfession: z.string(),
		amenities: z.array(z.string()),
		images: z.array(z.string()),
		referralOffer: z.string(),
	}),
});

export const updateGymSchema = z.object({
	name: z.string().min(1).optional(),
	address: z.string().min(1).optional(),
	profile: z
		.object({
			timing: z.string().optional(),
			openDays: z.array(z.string()).optional(),
			fees: z.coerce.number().optional(),
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

export type UpdateGym = z.infer<typeof updateGymSchema>;
export type CreateGym = z.infer<typeof createGymSchema>;
