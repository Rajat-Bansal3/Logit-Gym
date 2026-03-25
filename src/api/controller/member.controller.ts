import type { NextFunction, Request, Response } from "express";
import { MemberError, MemberErrorCode } from "../../shared/errors/member-errors";
import {
	listMembersQuerySchema,
	onboardMemberSchema,
	updateMemberSchema,
} from "../../shared/types/member.types";
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

			if (!user || !gymId || Array.isArray(gymId)) {
				throw new MemberError(MemberErrorCode.UNAUTHORIZED);
			}

			const data = onboardMemberSchema.parse(req.body);
			const result = await this.memberService.onboardMember(gymId, data, user);

			this.logger.debug("onboardMember: completed", { gymId });
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

			const data = updateMemberSchema.parse(req.body);
			const result = await this.memberService.updateMember(memberId, gymId, data, user);

			this.logger.debug("updateMember: completed", { gymId, memberId });
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

			const result = await this.memberService.deactivateMember(memberId, gymId, user);

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
}
