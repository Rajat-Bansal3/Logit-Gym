import type { NextFunction, Request, Response } from "express";
import { GymError, GymErrorCode } from "../../shared/errors/gym-errors";
import {
    createProductSchema,
    createSaleSchema,
    updateProductSchema,
} from "../../shared/types/inventory.types";
import { client } from "../../shared/utils/prisma";
import { InventoryService } from "../services/inventory.service";

export class InventoryController {
    private readonly service = new InventoryService({ prisma: client });

    private gymId(req: Request): string {
        const gymId = req.user?.gymId;
        if (!gymId) throw new GymError(GymErrorCode.UNAUTHORIZED, "gym id not found");
        return gymId;
    }

    listProducts = async (req: Request, res: Response, next: NextFunction) => {
        try {
            res.status(200).json(await this.service.listProducts(this.gymId(req)));
        } catch (e) {
            next(e);
        }
    };

    createProduct = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const data = createProductSchema.parse(req.body);
            res.status(201).json(await this.service.createProduct(this.gymId(req), data));
        } catch (e) {
            next(e);
        }
    };

    updateProduct = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const data = updateProductSchema.parse(req.body);
            res
                .status(200)
                .json(await this.service.updateProduct(req.params.productId as string, this.gymId(req), data));
        } catch (e) {
            next(e);
        }
    };

    deleteProduct = async (req: Request, res: Response, next: NextFunction) => {
        try {
            res
                .status(200)
                .json(await this.service.deleteProduct(req.params.productId as string, this.gymId(req)));
        } catch (e) {
            next(e);
        }
    };

    createSale = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const data = createSaleSchema.parse(req.body);
            res.status(201).json(await this.service.createSale(this.gymId(req), data));
        } catch (e) {
            next(e);
        }
    };

    listSales = async (req: Request, res: Response, next: NextFunction) => {
        try {
            res.status(200).json(await this.service.listSales(this.gymId(req)));
        } catch (e) {
            next(e);
        }
    };

    deleteSale = async (req: Request, res: Response, next: NextFunction) => {
        try {
            res
                .status(200)
                .json(await this.service.deleteSale(req.params.saleId as string, this.gymId(req)));
        } catch (e) {
            next(e);
        }
    };
}
