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
router.get("/create-plan", gymController.createPlan);

//cron - sync data
router.post("/sync-attendances", catchAsync(gymController.syncAttendance));
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

router.get("/membership-plans", roleMiddleware("OWNER"), gymController.getMembershipPackages);
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


router.post(
	"/create-membership-plans",
	roleMiddleware("OWNER"),
	gymController.createMembershipPackages,
);
router.put(
	"/update-membership-plans",
	roleMiddleware("OWNER"),
	gymController.updateMembershipPackages,
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

router.post(
	"/bulk-add-members",
	roleMiddleware("OWNER"),
	upload.single("file"),
	catchAsync(gymController.bulkAddMembers),
);

export default router;
