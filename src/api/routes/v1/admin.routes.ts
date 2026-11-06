import { Router } from "express";
import { catchAsync } from "../../../shared/utils/util_functions";
import { AdminController } from "../../controller/admin.controller";
import { whatsAppAdminController } from "../../controller/whatsapp-admin.controller";
import { adminOnlyMiddleware } from "../../middleware/admin.middleware";
import { authMiddleware } from "../../middleware/auth.middleware";

const router = Router();
const controller = new AdminController();

router.use(authMiddleware, adminOnlyMiddleware);
router.get("/overview", catchAsync(controller.getOverview));
router.get("/gyms", catchAsync(controller.getGyms));
router.patch("/gyms/:gymId/status", catchAsync(controller.setGymStatus));
router.post("/gyms/:gymId/extend-trial", catchAsync(controller.extendTrial));
router.get("/plans", catchAsync(controller.getPlans));
router.post("/plans", catchAsync(controller.createPlan));
router.patch("/plans/:planId", catchAsync(controller.setPlanActive));
router.get("/billing", catchAsync(controller.getBilling));
router.post("/refunds", catchAsync(controller.requestRefund));
router.get("/whatsapp", catchAsync(whatsAppAdminController.getData));
router.put("/whatsapp/settings", catchAsync(whatsAppAdminController.setSettings));
router.post("/whatsapp/templates", catchAsync(whatsAppAdminController.createTemplate));
router.put("/whatsapp/templates/:templateId", catchAsync(whatsAppAdminController.updateTemplate));
router.post("/whatsapp/wallets/:gymId/credit", catchAsync(whatsAppAdminController.creditWallet));

export default router;
