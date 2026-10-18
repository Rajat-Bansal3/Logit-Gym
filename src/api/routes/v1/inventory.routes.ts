import { Router } from "express";
import { InventoryController } from "../../controller/inventory.controller";
import { authMiddleware } from "../../middleware/auth.middleware";
import { roleMiddleware } from "../../middleware/role.middleware";

const router = Router();
const controller = new InventoryController();

router.use(authMiddleware, roleMiddleware("OWNER"));

router.get("/products", controller.listProducts);
router.post("/products", controller.createProduct);
router.patch("/products/:productId", controller.updateProduct);
router.delete("/products/:productId", controller.deleteProduct);

router.get("/sales", controller.listSales);
router.post("/sales", controller.createSale);
router.delete("/sales/:saleId", controller.deleteSale);

export default router;
