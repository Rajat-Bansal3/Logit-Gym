import type { PrismaClient } from "../../generated/client";
import type {
    CreateProductInput,
    CreateSaleInput,
    UpdateProductInput,
} from "../../shared/types/inventory.types";
import type { BaseResponse } from "../../shared/types/returns";
import { client } from "../../shared/utils/prisma";
import { InventoryRepository } from "../repositories/inventory.repository";

export class InventoryService {
    private readonly repo: InventoryRepository;

    constructor({ prisma = client }: { prisma: PrismaClient }) {
        this.repo = new InventoryRepository(prisma);
    }

    async listProducts(gymId: string): Promise<BaseResponse<unknown>> {
        const products = await this.repo.listProducts(gymId);
        return { message: "products fetched", success: true, data: products };
    }

    async createProduct(gymId: string, data: CreateProductInput): Promise<BaseResponse<unknown>> {
        const product = await this.repo.createProduct(gymId, data);
        return { message: "product created", success: true, data: product };
    }

    async updateProduct(
        productId: string,
        gymId: string,
        data: UpdateProductInput,
    ): Promise<BaseResponse<unknown>> {
        const product = await this.repo.updateProduct(productId, gymId, data);
        return { message: "product updated", success: true, data: product };
    }

    async deleteProduct(productId: string, gymId: string): Promise<BaseResponse<null>> {
        await this.repo.deleteProduct(productId, gymId);
        return { message: "product deleted", success: true, data: null };
    }

    async createSale(gymId: string, data: CreateSaleInput): Promise<BaseResponse<unknown>> {
        const sale = await this.repo.createSale(gymId, data);
        return { message: "sale recorded", success: true, data: sale };
    }

    async listSales(gymId: string): Promise<BaseResponse<unknown>> {
        const sales = await this.repo.listSales(gymId);
        return { message: "sales fetched", success: true, data: sales };
    }

    async deleteSale(saleId: string, gymId: string): Promise<BaseResponse<null>> {
        await this.repo.deleteSale(saleId, gymId);
        return { message: "sale deleted and stock restored", success: true, data: null };
    }
}
