import type { PrismaClient, Product, Sale } from "../../generated/client";
import { GymError, GymErrorCode } from "../../shared/errors/gym-errors";
import type {
    CreateProductInput,
    CreateSaleInput,
    UpdateProductInput,
} from "../../shared/types/inventory.types";
import { client } from "../../shared/utils/prisma";

export class InventoryRepository {
    constructor(private readonly prisma: PrismaClient = client) { }

    // ── Products ──────────────────────────────────────────────────────────────

    listProducts(gymId: string): Promise<Product[]> {
        return this.prisma.product.findMany({
            where: { gymId, isDeleted: false },
            orderBy: { createdAt: "desc" },
        });
    }

    createProduct(gymId: string, data: CreateProductInput): Promise<Product> {
        return this.prisma.product.create({
            data: {
                gymId,
                name: data.name,
                price: data.price,
                quantity: data.quantity,
                instructions: data.instructions ?? null,
            },
        });
    }

    async updateProduct(
        productId: string,
        gymId: string,
        data: UpdateProductInput,
    ): Promise<Product> {
        const existing = await this.prisma.product.findFirst({
            where: { id: productId, gymId, isDeleted: false },
        });
        if (!existing) throw new GymError(GymErrorCode.NOT_FOUND, "Product not found");
        return this.prisma.product.update({
            where: { id: productId },
            data: {
                ...(data.name !== undefined && { name: data.name }),
                ...(data.price !== undefined && { price: data.price }),
                ...(data.quantity !== undefined && { quantity: data.quantity }),
                ...(data.instructions !== undefined && { instructions: data.instructions }),
            },
        });
    }

    async deleteProduct(productId: string, gymId: string): Promise<void> {
        const existing = await this.prisma.product.findFirst({
            where: { id: productId, gymId, isDeleted: false },
        });
        if (!existing) throw new GymError(GymErrorCode.NOT_FOUND, "Product not found");
        await this.prisma.product.update({
            where: { id: productId },
            data: { isDeleted: true },
        });
    }

    // ── Sales ─────────────────────────────────────────────────────────────────

    async createSale(gymId: string, data: CreateSaleInput): Promise<Sale> {
        return this.prisma.$transaction(async (tx) => {
            // Validate member belongs to this gym (if provided).
            if (data.memberId) {
                const member = await tx.member.findFirst({
                    where: { id: data.memberId, gymId, isDeleted: false },
                    select: { id: true },
                });
                if (!member) {
                    throw new GymError(GymErrorCode.NOT_FOUND, "Member not found in this gym");
                }
            }

            let totalAmount = 0;
            const itemRows: {
                productId: string;
                productName: string;
                quantity: number;
                priceAtSale: number;
                instructions: string | null;
            }[] = [];

            // Validate products, compute totals, decrement stock (guarded).
            for (const item of data.items) {
                const product = await tx.product.findFirst({
                    where: { id: item.productId, gymId, isDeleted: false },
                });
                if (!product) {
                    throw new GymError(GymErrorCode.NOT_FOUND, "A product in this sale was not found");
                }

                const price = item.price ?? product.price;
                totalAmount += price * item.quantity;

                // Atomic stock decrement that can never go below zero.
                const decremented = await tx.product.updateMany({
                    where: { id: product.id, quantity: { gte: item.quantity } },
                    data: { quantity: { decrement: item.quantity } },
                });
                if (decremented.count === 0) {
                    throw new GymError(
                        GymErrorCode.BAD_REQUEST,
                        `Not enough stock for "${product.name}". Only ${product.quantity} left.`,
                    );
                }

                itemRows.push({
                    productId: product.id,
                    productName: product.name,
                    quantity: item.quantity,
                    priceAtSale: price,
                    instructions: product.instructions,
                });
            }

            const sale = await tx.sale.create({
                data: {
                    gymId,
                    memberId: data.memberId ?? null,
                    totalAmount,
                    paymentMethod: data.paymentMethod,
                    note: data.note ?? null,
                    items: { create: itemRows },
                },
                include: { items: true, member: { select: { id: true, name: true } } },
            });

            // Record the sale in payments + revenue so it appears in finance.
            await tx.payment.create({
                data: {
                    gymId,
                    memberId: data.memberId ?? null,
                    saleId: sale.id,
                    amount: totalAmount,
                    paidDate: new Date(),
                    description: `Inventory sale (${itemRows
                        .map((i) => `${i.productName} x${i.quantity}`)
                        .join(", ")})`,
                    category: "Inventory",
                    type: "CREDIT",
                    status: "PAID",
                },
            });
            await tx.gymMetrics.update({
                where: { gymId },
                data: { totalRevenue: { increment: totalAmount } },
            });

            return sale;
        });
    }

    async listSales(gymId: string) {
        return this.prisma.sale.findMany({
            where: { gymId, isDeleted: false },
            orderBy: { createdAt: "desc" },
            include: {
                items: true,
                member: { select: { id: true, name: true } },
            },
        });
    }

    /** Undo a sale: restore stock, delete its payment, decrement revenue. */
    async deleteSale(saleId: string, gymId: string): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            const sale = await tx.sale.findFirst({
                where: { id: saleId, gymId, isDeleted: false },
                include: { items: true, payment: true },
            });
            if (!sale) throw new GymError(GymErrorCode.NOT_FOUND, "Sale not found");

            // Restore inventory quantities.
            for (const item of sale.items) {
                await tx.product.update({
                    where: { id: item.productId },
                    data: { quantity: { increment: item.quantity } },
                });
            }

            // Remove the linked payment and its revenue contribution.
            if (sale.payment) {
                await tx.payment.delete({ where: { id: sale.payment.id } });
                await tx.gymMetrics.update({
                    where: { gymId },
                    data: { totalRevenue: { decrement: sale.totalAmount } },
                });
            }

            await tx.sale.update({ where: { id: saleId }, data: { isDeleted: true } });
        });
    }

    /** Sales a member made (for the member app). */
    listMemberSales(memberId: string) {
        return this.prisma.sale.findMany({
            where: { memberId, isDeleted: false },
            orderBy: { createdAt: "desc" },
            include: {
                items: true,
                gym: { select: { name: true } },
            },
        });
    }
}
