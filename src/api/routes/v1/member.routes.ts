import { Router } from "express";
import { MemberController } from "../../controller/member.controller";
import { authMiddleware } from "../../middleware/auth.middleware";
import { roleMiddleware } from "../../middleware/role.middleware";

const router = Router({ mergeParams: true }); // mergeParams for :gymId from parent
const controller = new MemberController();

// All member routes require authentication
router.use(authMiddleware);

// POST /gyms/:gymId/members — onboard a new member (owner only)
router.post("/", roleMiddleware("OWNER"), controller.onboardMember);

// GET /gyms/:gymId/members — list all members
router.get("/", roleMiddleware("OWNER"), controller.listMembers);

// GET /gyms/:gymId/members/:memberId
router.get("/:memberId", roleMiddleware("OWNER"), controller.getMember);

// PATCH /gyms/:gymId/members/:memberId
router.patch("/:memberId", roleMiddleware("OWNER"), controller.updateMember);

// DELETE /gyms/:gymId/members/:memberId — soft delete / deactivate
router.delete("/:memberId", roleMiddleware("OWNER"), controller.deactivateMember);
router.post("/attendance", roleMiddleware("OWNER"), controller.markAttendance);

// ── Reports ───────────────────────────────────────────────────────────────────
router.get("/reports/overview", roleMiddleware("OWNER"), controller.getGymOverviewReport);

router.get("/reports/attendance", roleMiddleware("OWNER"), controller.getAttendanceReport);

router.get("/reports/metrics", roleMiddleware("OWNER"), controller.getMemberMetricsReport);

export default router;
