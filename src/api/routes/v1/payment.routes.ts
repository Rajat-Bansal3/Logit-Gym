import { Router } from "express";
import { PaymentController } from "../../controller/payment.controller";
import { authMiddleware } from "../../middleware/auth.middleware";

const router = Router();
const paymentController = new PaymentController();

// All payment routes require authentication
router.use(authMiddleware);

/**
 * POST /gyms/:gymId
 * Add a new payment for a specific gym
 */
router.post("/gyms/:gymId", paymentController.addPayment);

/**
 * GET /gyms/:gymId
 * Get all payments for a gym with optional filtering (by member, date range, etc.)
 * Query parameters: page, limit, startDate, endDate, memberId
 */
router.get("/gyms/:gymId", paymentController.getPayments);

/**
 * DELETE /gyms/:gymId/payments/:paymentId
 * Delete a specific payment
 */
router.delete("/gyms/:gymId/payments/:paymentId", paymentController.deletePayment);

export default router;
