import { Router } from "express";
import { AuthController } from "@/api/controller/auth.controller";
import { catchAsync } from "@/shared/utils/util_functions";

const router: Router = Router();
const authController = new AuthController();

router.post("/login", catchAsync(authController.login));
router.post("/register", catchAsync(authController.register));

export default router;
