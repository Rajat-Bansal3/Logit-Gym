import z from "zod";
export const machineDataSchema = z.object({
	serialNumber: z.array(z.string()),
	isMachine: z.boolean(),
});
export type MachineData = z.infer<typeof machineDataSchema>;
