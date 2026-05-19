import { Router } from "express";
import { MemberController } from "../../controller/member.controller";
import { authMiddleware } from "../../middleware/auth.middleware";
import { roleMiddleware } from "../../middleware/role.middleware";

const router = Router({ mergeParams: true });

router.use(authMiddleware);

const memberController = new MemberController();

router.get(
  "/attendance",
  roleMiddleware("MEMBER"),
  memberController.getMemberAttendance,
);

router.post(
  "/attendance/:hash",
  roleMiddleware("MEMBER"),
  memberController.markAttendance,
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
