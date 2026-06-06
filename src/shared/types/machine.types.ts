import z from "zod";
export const machineDataSchema = z.object({
	serialNumber: z.string().min(1).max(100),
	apiKey: z.string().min(1).max(100),
	isMachine: z.boolean(),
});
export type MachineData = z.infer<typeof machineDataSchema>;
