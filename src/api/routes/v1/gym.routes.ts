import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import { roleMiddleware } from "../../middleware/role.middleware";
import { GymController } from "../../controller/gym.controller";

import { catchAsync } from "../../../shared/utils/util_functions";

const router = Router();
const gymController = new GymController();

router.use(authMiddleware);

/**
 * Create a new gym
 */
router.post("/", roleMiddleware("OWNER"), catchAsync(gymController.createGym));

/**
 * Get gym details
 */
router.get("/:id", catchAsync(gymController.getGym));

/**
 * Update gym information
 */
router.patch(
  "/:id",
  roleMiddleware("OWNER"),
  catchAsync(gymController.updateGym),
);

/**
 * Delete a gym
 */
router.delete(
  "/:id",
  roleMiddleware("OWNER"),
  catchAsync(gymController.deleteGym),
);

export default router;
