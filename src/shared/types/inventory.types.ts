import { z } from "zod";
import { PaymentMethod } from "../../generated/enums";

export const createProductSchema = z.object({
    name: z.string().min(1).max(120),
    price: z.coerce.number().min(0),
    quantity: z.coerce.number().int().min(0),
    instructions: z.string().max(500).optional(),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z.object({
    name: z.string().min(1).max(120).optional(),
    price: z.coerce.number().min(0).optional(),
    quantity: z.coerce.number().int().min(0).optional(),
    instructions: z.string().max(500).nullable().optional(),
});
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const saleItemSchema = z.object({
    productId: z.string().min(1),
    quantity: z.coerce.number().int().min(1),
    // Editable at sale time; falls back to the product's listed price.
    price: z.coerce.number().min(0).optional(),
});
export type SaleItemInput = z.infer<typeof saleItemSchema>;

export const createSaleSchema = z.object({
    memberId: z.string().optional(),
    items: z.array(saleItemSchema).min(1),
    note: z.string().max(300).optional(),
    paymentMethod: z.enum(PaymentMethod).optional().default("CASH"),
});
export type CreateSaleInput = z.infer<typeof createSaleSchema>;
