// import { Router } from "express";
// import { MemberController } from "../../controller/member.controller";
// import { authMiddleware } from "../../middleware/auth.middleware";

// const router = Router();
// const memberController = new MemberController();

// // All member routes require authentication
// router.use(authMiddleware);

// /**
//  * POST /gyms/:gymId/members
//  * Onboard a new member to a specific gym
//  */
// router.post("/gyms/:gymId/members", memberController.onboardMember);

// /**
//  * GET /gyms/:gymId/members
//  * Get all members of a gym with optional filtering and pagination
//  */
// router.get("/gyms/:gymId/members", memberController.getGymMembers);

// /**
//  * GET /gyms/:gymId/members/:memberId
//  * Get detailed information of a specific member within a gym
//  */
// router.get("/gyms/:gymId/members/:memberId", memberController.getGymMember);

// /**
//  * PUT /gyms/:gymId/members/:memberId
//  * Update an existing member's information
//  */
// router.put("/gyms/:gymId/members/:memberId", memberController.updateMember);

// /**
//  * DELETE /gyms/:gymId/members/:memberId
//  * Soft delete a member from the gym
//  */
// router.delete("/gyms/:gymId/members/:memberId", memberController.deleteMember);

// export default router;
