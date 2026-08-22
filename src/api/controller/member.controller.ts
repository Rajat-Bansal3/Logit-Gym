import type { NextFunction, Request, Response } from "express";
import z from "zod";
import { MemberError, MemberErrorCode } from "../../shared/errors/member-errors";
import { machineDataSchema } from "../../shared/types/machine.types";
import {
	deleteMemberSchema,
	listMembersQuerySchema,
	markAttendanceSchema,
	memberToMachineSchema,
	onboardMemberSchema,
	reportQuerySchema,
	updateMemberSchema,
} from "../../shared/types/member.types";
import { createMembershipSchema } from "../../shared/types/payment.types";
import { AppLogger } from "../../shared/utils/logger";
import { client } from "../../shared/utils/prisma";
import { MemberService } from "../services/member.services";

export class MemberController {
	private readonly memberService: MemberService;
	private readonly logger: AppLogger;

	constructor() {
		this.memberService = new MemberService({ prisma: client });
		this.logger = new AppLogger();
	}

	onboardMember = async (req: Request, res: Response, next: NextFunction) => {
		try {
			this.logger.debug("onboardMember: request received", {
				gymId: req.params.gymId,
			});

			const user = req.user;
			const gymId = req.params.gymId;
			const image = req.file as Express.Multer.File | undefined;

			if (!user || !gymId || Array.isArray(gymId)) {
				throw new MemberError(MemberErrorCode.UNAUTHORIZED);
			}

			const data = onboardMemberSchema.parse(req.body);
			const result = await this.memberService.onboardMember(gymId, data, user, image?.path);

			this.logger.debug("onboardMember: completed", { gymId });
			res.status(201).json(result);
		} catch (error) {
			this.logger.error("onboardMember: error", { error });
			next(error);
		}
	};
	pushMemberToMachine = async (req: Request, res: Response, next: NextFunction) => {
		try {
			const user = req.user;
			const gymId = req.params.gymId;

			if (!user || !gymId || Array.isArray(gymId)) {
				throw new MemberError(MemberErrorCode.UNAUTHORIZED);
			}

			const data = memberToMachineSchema.parse(req.body);
			const result = await this.memberService.pushToMachine(gymId, data, user);

			res.status(201).json(result);
		} catch (error) {
			this.logger.error("onboardMember: error", { error });
			next(error);
		}
	};

	getMember = async (req: Request, res: Response, next: NextFunction) => {
		try {
			this.logger.debug("getMember: request received", {
				gymId: req.params.gymId,
				memberId: req.params.memberId,
			});

			const user = req.user;
			const { gymId, memberId } = req.params;

			if (!user || !gymId || !memberId || Array.isArray(gymId) || Array.isArray(memberId)) {
				throw new MemberError(MemberErrorCode.UNAUTHORIZED);
			}

			const result = await this.memberService.getMember(memberId, gymId, user);

			this.logger.debug("getMember: completed", { gymId, memberId });
			res.status(200).json(result);
		} catch (error) {
			this.logger.error("getMember: error", {
				gymId: req.params.gymId,
				memberId: req.params.memberId,
				error,
			});
			next(error);
		}
	};

	listMembers = async (req: Request, res: Response, next: NextFunction) => {
		try {
			this.logger.debug("listMembers: request received", {
				gymId: req.params.gymId,
			});

			const user = req.user;
			const gymId = req.params.gymId;

			if (!user || !gymId || Array.isArray(gymId)) {
				throw new MemberError(MemberErrorCode.UNAUTHORIZED);
			}

			const query = listMembersQuerySchema.parse(req.query);
			const result = await this.memberService.listMembers(gymId, query, user);

			this.logger.debug("listMembers: completed", { gymId });
			res.status(200).json(result);
		} catch (error) {
			this.logger.error("listMembers: error", {
				gymId: req.params.gymId,
				error,
			});
			next(error);
		}
	};

	getGymAttendance = async (req: Request, res: Response, next: NextFunction) => {
		try {
			this.logger.debug("req recieved getGymAttendance");
			const user = req.user;
			const dateQuery =
				req.query.date && !Array.isArray(req.query.date)
					? String(req.query.date)
					: new Date().toISOString();
			const date = z.coerce.date().parse(dateQuery);
			if (!user?.gymId) {
				throw new MemberError(MemberErrorCode.FORBIDDEN);
			}
			const attendances = await this.memberService.getGymAttendance(user.gymId, date);
			res.status(200).json(attendances);
		} catch (error) {
			this.logger.error("getGymAttendance: error", {
				gymId: req.params.gymId,
				error,
			});
			next(error);
		}
	};

	updateMember = async (req: Request, res: Response, next: NextFunction) => {
		try {
			this.logger.debug("updateMember: request received", {
				gymId: req.params.gymId,
				memberId: req.params.memberId,
			});

			const user = req.user;
			const { gymId, memberId } = req.params;

			if (!user || !gymId || !memberId || Array.isArray(gymId) || Array.isArray(memberId)) {
				throw new MemberError(MemberErrorCode.UNAUTHORIZED);
			}

			const image = req.file as Express.Multer.File | undefined;

			this.logger.debug("updateMember: image", {
				hasImage: !!image,
				imagePath: image?.path,
			});

			const data = updateMemberSchema.parse(req.body);

			const result = await this.memberService.updateMember(
				memberId,
				gymId,
				data,
				user,
				image?.path,
			);

			this.logger.debug("updateMember: completed", {
				gymId,
				memberId,
			});

			res.status(200).json(result);
		} catch (error) {
			this.logger.error("updateMember: error", {
				gymId: req.params.gymId,
				memberId: req.params.memberId,
				error,
			});

			next(error);
		}
	};

	deactivateMember = async (req: Request, res: Response, next: NextFunction) => {
		try {
			this.logger.debug("deactivateMember: request received", {
				gymId: req.params.gymId,
				memberId: req.params.memberId,
			});

			const user = req.user;
			const { gymId, memberId } = req.params;

			if (!user || !gymId || !memberId || Array.isArray(gymId) || Array.isArray(memberId)) {
				throw new MemberError(MemberErrorCode.UNAUTHORIZED);
			}
			const machineData = machineDataSchema.parse(req.body);

			const result = await this.memberService.deactivateMember(
				memberId,
				gymId,
				machineData.serialNumber,
				machineData.isMachine,
				user,
			);

			this.logger.debug("deactivateMember: completed", { gymId, memberId });
			res.status(200).json(result);
		} catch (error) {
			this.logger.error("deactivateMember: error", {
				gymId: req.params.gymId,
				memberId: req.params.memberId,
				error,
			});
			next(error);
		}
	};
	deleteMember = async (req: Request, res: Response, next: NextFunction) => {
		try {
			this.logger.debug("deactivateMember: request received", {
				gymId: req.params.gymId,
				memberId: req.params.memberId,
			});

			const user = req.user;
			const { gymId, memberId } = req.params;
			if (!user || !gymId || Array.isArray(gymId) || !memberId || Array.isArray(memberId)) {
				throw new MemberError(MemberErrorCode.UNAUTHORIZED);
			}

			const data = deleteMemberSchema.parse(req.body);

			await this.memberService.deleteMember(
				memberId,
				gymId,
				data.serialNumbers,
				data.isMachine,
				user,
			);

			this.logger.debug("deactivateMember: completed", {
				gymId,
				memberId: memberId,
			});
			res.status(204).json({});
		} catch (error) {
			this.logger.error("deactivateMember: error", {
				gymId: req.params.gymId,
				memberId: req.params.memberId,
				error,
			});
			next(error);
		}
	};

	markAttendance = async (req: Request, res: Response, next: NextFunction) => {
		try {
			this.logger.debug("markAttendance: request received");
			const user = req.user;
			if (!user?.memberId) {
				throw new MemberError(MemberErrorCode.UNAUTHORIZED);
			}

			const data = markAttendanceSchema.parse(req.body);
			const result = await this.memberService.markAttendance(data, user);

			res.status(201).json(result);
		} catch (error) {
			this.logger.error("markAttendance: error", {
				gymId: req.params.gymId,
				error,
			});
			next(error);
		}
	};

	getGymOverviewReport = async (req: Request, res: Response, next: NextFunction) => {
		try {
			this.logger.debug("getGymOverviewReport: request received", {
				gymId: req.params.gymId,
			});
			const user = req.user;
			const gymId = req.params.gymId;
			if (!user || !gymId || Array.isArray(gymId)) {
				throw new MemberError(MemberErrorCode.UNAUTHORIZED);
			}
			const query = reportQuerySchema.parse(req.query);
			const result = await this.memberService.getGymOverviewReport(gymId, query, user);

			this.logger.debug("getGymOverviewReport: completed", { gymId });
			res.status(200).json(result);
		} catch (error) {
			this.logger.error("getGymOverviewReport: error", {
				gymId: req.params.gymId,
				error,
			});
			next(error);
		}
	};

	getAttendanceReport = async (req: Request, res: Response, next: NextFunction) => {
		try {
			this.logger.debug("getAttendanceReport: request received", {
				gymId: req.params.gymId,
			});
			const user = req.user;
			const gymId = req.params.gymId;
			if (!user || !gymId || Array.isArray(gymId)) {
				throw new MemberError(MemberErrorCode.UNAUTHORIZED);
			}

			const query = reportQuerySchema.parse(req.query);
			const result = await this.memberService.getAttendanceReport(gymId, query, user);

			this.logger.debug("getAttendanceReport: completed", { gymId });
			res.status(200).json(result);
		} catch (error) {
			this.logger.error("getAttendanceReport: error", {
				gymId: req.params.gymId,
				error,
			});
			next(error);
		}
	};

	getMemberMetricsReport = async (req: Request, res: Response, next: NextFunction) => {
		try {
			this.logger.debug("getMemberMetricsReport: request received", {
				gymId: req.params.gymId,
			});
			const user = req.user;
			const gymId = req.params.gymId;
			if (!user || !gymId || Array.isArray(gymId)) {
				throw new MemberError(MemberErrorCode.UNAUTHORIZED);
			}

			const query = reportQuerySchema.parse(req.query);
			const result = await this.memberService.getMemberMetricsReport(gymId, query, user);

			this.logger.debug("getMemberMetricsReport: completed", { gymId });
			res.status(200).json(result);
		} catch (error) {
			this.logger.error("getMemberMetricsReport: error", {
				gymId: req.params.gymId,
				error,
			});
			next(error);
		}
	};

	getMemberAttendance = async (req: Request, res: Response, next: NextFunction) => {
		try {
			this.logger.debug("getMemberAttendance: request received");
			const user = req.user;
			if (!user?.memberId) {
				throw new MemberError(MemberErrorCode.UNAUTHORIZED);
			}
			const attendances = await this.memberService.getMemberAttendance(user.memberId);
			res.status(200).json(attendances);
		} catch (error) {
			next(error);
		}
	};
	getMemberAttendanceGym = async (req: Request, res: Response, next: NextFunction) => {
		try {
			this.logger.debug("getMemberAttendance: request received");
			const user = req.user;
			const memberId = req.params.memberId;
			if (!user?.gymId) {
				throw new MemberError(MemberErrorCode.UNAUTHORIZED);
			}
			if (!memberId || Array.isArray(memberId)) {
				throw new MemberError(MemberErrorCode.BAD_REQUEST, "memberId is required");
			}
			const attendances = await this.memberService.getMemberAttendance(memberId);
			res.status(200).json(attendances);
		} catch (error) {
			next(error);
		}
	};
	getMemberGym = async (req: Request, res: Response, next: NextFunction) => {
		try {
			this.logger.debug("getMemberGym request recieved");
			const user = req.user;
			if (!user?.memberId) {
				throw new MemberError(MemberErrorCode.UNAUTHORIZED);
			}
			this.logger.debug("getMemberGym userId : ", user);

			const gym = await this.memberService.getMemberGym(user.memberId);
			res.status(200).json(gym);
		} catch (error) {
			next(error);
		}
	};
	getMemberPayments = async (req: Request, res: Response, next: NextFunction) => {
		try {
			this.logger.debug("getMemberPayments request recieved");
			const user = req.user;
			if (!user) {
				throw new MemberError(MemberErrorCode.UNAUTHORIZED);
			}
			const gym = await this.memberService.getMemberPayments(user.id);
			res.status(200).json(gym);
		} catch (error) {
			next(error);
		}
	};
	profile = async (req: Request, res: Response, next: NextFunction) => {
		try {
			this.logger.debug("profile request recieved");
			const user = req.user;
			if (!user?.memberId) {
				throw new MemberError(MemberErrorCode.UNAUTHORIZED);
			}
			this.logger.debug("user: ", user.memberId);
			const gym = await this.memberService.profile(user.memberId);
			res.status(200).json(gym);
		} catch (error) {
			next(error);
		}
	};
	getMemberDashboard = async (req: Request, res: Response, next: NextFunction) => {
		try {
			this.logger.debug("getMemberDashboard request recieved");
			const user = req.user;
			if (!user?.memberId) {
				throw new MemberError(MemberErrorCode.UNAUTHORIZED);
			}
			this.logger.debug("user: dashboard", user);
			const gym = await this.memberService.getMemberDashboard(user.memberId);
			res.status(200).json(gym);
		} catch (error) {
			next(error);
		}
	};
	getGymOccupancy = async (req: Request, res: Response, next: NextFunction) => {
		try {
			this.logger.debug("getGymOccupancy request recieved");
			const user = req.user;
			if (!user?.memberId) {
				throw new MemberError(MemberErrorCode.UNAUTHORIZED);
			}
			const gym = await this.memberService.getGymOccupancy(user.memberId);
			this.logger.debug("gym: ", gym);
			res.status(200).json(gym);
		} catch (error) {
			next(error);
		}
	};
	getMemberMembership = async (req: Request, res: Response, next: NextFunction) => {
		try {
			this.logger.debug("getMemberMembership req recieved");
			const user = req.user;
			const memberId = req.params.memberId;
			if (!user?.gymId || !memberId || Array.isArray(memberId)) {
				throw new MemberError(MemberErrorCode.BAD_REQUEST, "memberId not found");
			}
			const membership = await this.memberService.getMemberMembership(memberId);
			res.status(200).json(membership);
		} catch (error) {
			this.logger.error("getMemberMembership req errored", error);
			next(error);
		}
	};
	createMembership = async (req: Request, res: Response, next: NextFunction) => {
		try {
			this.logger.debug("createMemberMembership req recieved");
			const user = req.user;
			const memberId = req.params.memberId;
			const data = createMembershipSchema.parse(req.body);
			if (!user?.gymId || !memberId || Array.isArray(memberId)) {
				throw new MemberError(MemberErrorCode.BAD_REQUEST, "memberId not found");
			}
			const membership = await this.memberService.createMemberMembership(memberId, data);
			res.status(200).json(membership);
		} catch (error) {
			this.logger.error("getMemberMembership req errored", error);
			next(error);
		}
	};
}
