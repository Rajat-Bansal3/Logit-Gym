import { Router } from "express";
import { catchAsync } from "../../../shared/utils/util_functions";
import { AuthController } from "../../controller/auth.controller";

const router: Router = Router();
const authController = new AuthController();

router.post("/login", catchAsync(authController.login));
router.post("/register", catchAsync(authController.register));

export default router;
