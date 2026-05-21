import { Router } from "express";
import { MemberController } from "../../controller/member.controller";
import { authMiddleware } from "../../middleware/auth.middleware";
import { roleMiddleware } from "../../middleware/role.middleware";

const router = Router({ mergeParams: true });

router.use(authMiddleware);

const memberController = new MemberController();

router.get(
  "/attendance/members",
  roleMiddleware("MEMBER"),
  memberController.getMemberAttendance,
);

router.post(
  "/attendance",
  roleMiddleware("MEMBER"),
  memberController.markAttendance,
);

router.get("/gym", roleMiddleware("MEMBER"), memberController.getMemberGym);

router.get(
  "/payments",
  roleMiddleware("MEMBER"),
  memberController.getMemberPayments,
);

router.get(
  "/profile",
  roleMiddleware("MEMBER"),
  (req, _res, next) => {
    next();
  },
  memberController.profile,
);

router.get(
  "/dashboard",
  roleMiddleware("MEMBER"),
  (req, _res, next) => {
    next();
  },
  memberController.getMemberDashboard,
);

router.get(
  "/occupancy",
  roleMiddleware("MEMBER"),
  memberController.getGymOccupancy,
);

export default router;
