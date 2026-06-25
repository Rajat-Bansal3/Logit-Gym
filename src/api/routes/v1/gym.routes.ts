import { Router } from "express";
import { catchAsync } from "../../../shared/utils/util_functions";
import { GymController } from "../../controller/gym.controller";
import { authMiddleware } from "../../middleware/auth.middleware";
import { roleMiddleware } from "../../middleware/role.middleware";
import memberRouter from "../v1/member.routes";

const router = Router();
const gymController = new GymController();

router.use(authMiddleware);
router.use("/:gymId/members", memberRouter);
/**
 * Create a new gym
 */
router.post("/", roleMiddleware("OWNER"), catchAsync(gymController.createGym));

/**
 * Get gym details
 */
router.get("/:id", roleMiddleware("OWNER"), catchAsync(gymController.getGym));

/**
 * Update gym information
 */
router.patch("/:id", roleMiddleware("OWNER"), catchAsync(gymController.updateGym));

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

export default router;
