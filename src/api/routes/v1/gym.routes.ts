import { Router } from "express";
import multer from "multer";
import { uploadMultipleImage } from "../../../shared/utils/image_upload";
import { catchAsync } from "../../../shared/utils/util_functions";
import { GymController } from "../../controller/gym.controller";
import { authMiddleware } from "../../middleware/auth.middleware";
import { roleMiddleware } from "../../middleware/role.middleware";
import memberRouter from "../v1/member.routes";

const upload = multer({
	storage: multer.memoryStorage(),
	limits: {
		fileSize: 5 * 1024 * 1024,
		files: 1,
	},
});

const router = Router();
const gymController = new GymController();
router.get("/create-plan", gymController.createTrailPlan);

router.use(authMiddleware);
router.use("/:gymId/members", memberRouter);
/**
 * Create a new gym
 */
router.post(
	"/",
	roleMiddleware("OWNER"),
	uploadMultipleImage("gymImages", 5),
	catchAsync(gymController.createGym),
);
router.get("/subscription", roleMiddleware("OWNER"), gymController.getSub);
router.get("/plans", roleMiddleware("OWNER"), gymController.getPlans);
router.post("/subscription", roleMiddleware("OWNER"), gymController.createSubscription);
/**
 * Get gym details
 */
router.get("/:id", roleMiddleware("OWNER"), catchAsync(gymController.getGym));

/**
 * Update gym information
 */
router.patch(
	"/:id",
	roleMiddleware("OWNER"),
	uploadMultipleImage("gymImages", 5),
	catchAsync(gymController.updateGym),
);

router.delete("/delete-machine", roleMiddleware("OWNER"), catchAsync(gymController.removeMachine));

/**
 * Delete a gym
 */
router.delete("/:id", roleMiddleware("OWNER"), catchAsync(gymController.deleteGym));
/**
 * add a new machine
 */
router.post("/add-machine", roleMiddleware("OWNER"), catchAsync(gymController.addMachine));

router.post(
	"/get-presigned-urls",
	roleMiddleware("OWNER"),
	catchAsync(gymController.getPresignedUrls),
);
router.post("/sync-attendances", roleMiddleware("OWNER"), catchAsync(gymController.syncAttendance));
router.post(
	"/bulk-add-members",
	roleMiddleware("OWNER"),
	upload.single("file"),
	catchAsync(gymController.bulkAddMembers),
);

export default router;
