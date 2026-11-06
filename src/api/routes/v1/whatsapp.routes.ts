import { Router } from "express";
import { catchAsync } from "../../../shared/utils/util_functions";
import { whatsAppController } from "../../controller/whatsapp.controller";
import { authMiddleware } from "../../middleware/auth.middleware";
import { roleMiddleware } from "../../middleware/role.middleware";

const router = Router();
router.get(
	"/:gymId/whatsapp",
	authMiddleware,
	roleMiddleware("OWNER"),
	catchAsync(whatsAppController.getOverview),
);
router.get(
	"/:gymId/whatsapp/members",
	authMiddleware,
	roleMiddleware("OWNER"),
	catchAsync(whatsAppController.getMembers),
);
router.patch(
	"/:gymId/whatsapp/settings",
	authMiddleware,
	roleMiddleware("OWNER"),
	catchAsync(whatsAppController.setEnabled),
);
router.patch(
	"/:gymId/whatsapp/consent/:memberId",
	authMiddleware,
	roleMiddleware("OWNER"),
	catchAsync(whatsAppController.setConsent),
);
router.get(
	"/:gymId/whatsapp/messages",
	authMiddleware,
	roleMiddleware("OWNER"),
	catchAsync(whatsAppController.getHistory),
);
router.post(
	"/:gymId/whatsapp/messages",
	authMiddleware,
	roleMiddleware("OWNER"),
	catchAsync(whatsAppController.sendMessage),
);

export default router;
