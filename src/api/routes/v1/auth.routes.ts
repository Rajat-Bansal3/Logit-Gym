import { Router } from "express";
import { roleMiddleware } from "../../../api/middleware/role.middleware";
import { catchAsync } from "../../../shared/utils/util_functions";
import { AuthController } from "../../controller/auth.controller";
import { authMiddleware } from "../../middleware/auth.middleware";

const router: Router = Router();
const authController = new AuthController();

router.post("/login", catchAsync(authController.login));
router.post("/register", catchAsync(authController.register));
router.use(authMiddleware);
router.get("/me", catchAsync(authController.me));
router.patch("/change-password/member", roleMiddleware("MEMBER"), authController.changePassword);

export default router;
