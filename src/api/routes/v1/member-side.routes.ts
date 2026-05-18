import { MemberController } from "../../controller/member.controller";
import { authMiddleware } from "../../middleware/auth.middleware";
import { roleMiddleware } from "../../middleware/role.middleware";
import { Router } from "express";

const router = Router({ mergeParams: true });

router.use(authMiddleware);

const memberController = new MemberController();

router.get(
  "/attendace",
  roleMiddleware("MEMBER"),
  memberController.getMemberAttendance,
);

router.get("/gym", roleMiddleware("MEMBER"), memberController.getMemberGym);

router.get(
  "/payments",
  roleMiddleware("MEMBER"),
  memberController.getMemberPayments,
);

router.get("/profile", roleMiddleware("MEMBER"), memberController.profile);
router.get(
  "/dashboard",
  roleMiddleware("MEMBER"),
  memberController.getMemberDashboard,
);
router.get(
  "/occupancy",
  roleMiddleware("MEMBER"),
  memberController.getGymOccupancy,
);

export default router;
