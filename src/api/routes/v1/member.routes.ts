import { Router } from "express";
import { uploadSingleImage } from "../../../shared/utils/image_upload";
import { MemberController } from "../../controller/member.controller";
import { authMiddleware } from "../../middleware/auth.middleware";
import { roleMiddleware } from "../../middleware/role.middleware";

const router = Router({ mergeParams: true });
const controller = new MemberController();

// All member routes require authentication
router.use(authMiddleware);

// POST /gyms/:gymId/members — onboard a new member (owner only)
router.post(
	"/",
	roleMiddleware("OWNER"),
	uploadSingleImage("memberImage"),
	controller.onboardMember,
);
router.post("/push-member-to-machine", roleMiddleware("OWNER"), controller.pushMemberToMachine);

// GET /gyms/:gymId/members — list all members
router.get("/", roleMiddleware("OWNER"), controller.listMembers);

router.get("/attendance", roleMiddleware("OWNER"), controller.getGymAttendance);

// GET /gyms/:gymId/members/:memberId
router.get("/:memberId", roleMiddleware("OWNER"), controller.getMember);
router.get("/:memberId/attendance", roleMiddleware("OWNER"), controller.getMemberAttendanceGym);

// PATCH /gyms/:gymId/members/:memberId
router.patch("/:memberId", roleMiddleware("OWNER"), controller.updateMember);

// DELETE /gyms/:gymId/members/:memberId — soft delete / deactivate
router.delete("/:memberId", roleMiddleware("OWNER"), controller.deactivateMember);

// DELETE hard delete TODO
router.delete("/delete/:memberId", roleMiddleware("OWNER"), controller.deleteMember);

// ── Reports ───────────────────────────────────────────────────────────────────
router.get("/reports/overview", roleMiddleware("OWNER"), controller.getGymOverviewReport);

router.get("/reports/attendance", roleMiddleware("OWNER"), controller.getAttendanceReport);

router.get("/reports/metrics", roleMiddleware("OWNER"), controller.getMemberMetricsReport);

router.get("/:memberId/membership", controller.getMemberMembership);

router.post("/:memberId/membership", roleMiddleware("OWNER"), controller.createMembership);

export default router;
