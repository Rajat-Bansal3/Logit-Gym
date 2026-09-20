import type { NextFunction, Request, Response } from "express";
import * as xlsx from "xlsx";
import { GymError, GymErrorCode } from "../../shared/errors/gym-errors";
import {
	addMachineSchema,
	bulkAddSchema,
	bulkMembersSchema,
	createGymSchema,
	createMembershipPackageSchema,
	createPlanSchema,
	createSubscriptionSchema,
	getPresignedUrlsSchema,
	syncDataSchema,
	updateGymSchema,
	updateMembershipPackageSchema,
} from "../../shared/types/gym.types";
import { AppLogger } from "../../shared/utils/logger";
import { client } from "../../shared/utils/prisma";
import { GymService } from "../services/gym.service";
import { MemberService } from "../services/member.services";

export class GymController {
	private gymService: GymService;
	private memberService: MemberService;
	private logger: AppLogger;

	constructor() {
		this.gymService = new GymService({ prisma: client });
		this.memberService = new MemberService({
			prisma: client,
		});
		this.logger = new AppLogger();
	}

	createGym = async (req: Request, res: Response, next: NextFunction) => {
		try {
			this.logger.debug("createGym: request received");
			const user = req.user;
			const images = req.files as Express.Multer.File[];
			if (!user) {
				throw new GymError(GymErrorCode.UNAUTHORIZED, "user not authorised");
			}
			const data = createGymSchema.parse(req.body);
			const result = await this.gymService.createGym(data, user, images);
			this.logger.debug("createGym: completed", {
				userId: user.id,
			});
			res.status(201).json(result);
		} catch (error) {
			this.logger.error("createGym: error", { error });
			next(error);
		}
	};

	getGym = async (req: Request, res: Response, next: NextFunction) => {
		try {
			this.logger.debug("getGym: request received", { gymId: req.params.id });
			const user = req.user;
			const gymId = req.params.id;
			if (!user || !gymId || Array.isArray(gymId)) {
				throw new GymError(GymErrorCode.UNAUTHORIZED, "user not authorised");
			}
			const result = await this.gymService.getGym(gymId, user);
			this.logger.debug("getGym: completed", { gymId });
			res.status(200).json(result);
		} catch (error) {
			this.logger.error("getGym: error", { gymId: req.params.id, error });
			next(error);
		}
	};

	updateGym = async (req: Request, res: Response, next: NextFunction) => {
		try {
			this.logger.debug("updateGym: request received", {
				gymId: req.params.id,
			});

			const user = req.user;
			const gymId = req.params.id;

			if (!user || !gymId || Array.isArray(gymId)) {
				throw new GymError(GymErrorCode.UNAUTHORIZED, "user not authorised");
			}

			const images = req.files as Express.Multer.File[] | undefined;

			this.logger.debug("updateGym: uploaded files", {
				count: images?.length ?? 0,
				files: images?.map((file) => ({
					filename: file.filename,
					path: file.path,
					size: file.size,
					mimetype: file.mimetype,
				})),
			});

			const updates = updateGymSchema.parse(req.body);

			const result = await this.gymService.updateGym(gymId, updates, user, images);

			this.logger.debug("updateGym: completed", {
				gymId,
			});

			res.status(200).json(result);
		} catch (error) {
			this.logger.error("updateGym: error", {
				gymId: req.params.id,
				error,
			});

			next(error);
		}
	};

	deleteGym = async (req: Request, res: Response, next: NextFunction) => {
		try {
			this.logger.debug("deleteGym: request received", {
				gymId: req.params.id,
			});
			const user = req.user;
			const gymId = req.params.id;
			if (!user || !gymId || Array.isArray(gymId)) {
				throw new GymError(GymErrorCode.UNAUTHORIZED, "user not authorised");
			}
			await this.gymService.deleteGym(gymId, user);
			this.logger.debug("deleteGym: completed", { gymId });
			res.status(204).json({});
		} catch (error) {
			this.logger.error("deleteGym: error", { gymId: req.params.id, error });
			next(error);
		}
	};
	addMachine = async (req: Request, res: Response, next: NextFunction) => {
		try {
			const user = req.user;
			if (!user?.gymId) {
				throw new GymError(GymErrorCode.UNAUTHORIZED, "user not authorised");
			}
			const data = addMachineSchema.parse(req.body);
			const resp = await this.gymService.addMachine(data, user.gymId);
			return res.status(200).json(resp);
		} catch (error) {
			this.logger.error("add machine: error", {
				gymId: req.user?.gymId,
				error,
			});
			next(error);
			return;
		}
	};
	removeMachine = async (req: Request, res: Response, next: NextFunction) => {
		try {
			const user = req.user;
			if (!user?.gymId) {
				throw new GymError(GymErrorCode.UNAUTHORIZED, "user not authorised");
			}
			const data = addMachineSchema.parse(req.body);
			const resp = await this.gymService.removeMachine(data);
			return res.status(200).json(resp);
		} catch (error) {
			this.logger.error("remove machine: error", {
				gymId: req.user?.gymId,
				error,
			});
			next(error);
			return;
		}
	};
	getPresignedUrls = async (req: Request, res: Response, next: NextFunction) => {
		try {
			const data = getPresignedUrlsSchema.parse(req.body);
			const pre_urls = await this.gymService.generatePresignedUrl({
				code: data.id,
				mimetype: data.mimeType,
			});
			return res.status(200).json(pre_urls);
		} catch (err) {
			next(err);
			return;
		}
	};

	getPlans = async (_req: Request, res: Response, next: NextFunction) => {
		try {
			const plans = await this.gymService.getPlans();
			return res.status(200).json(plans);
		} catch (error) {
			next(error);
			return;
		}
	};
	createPlan = async (req: Request, res: Response, _next: NextFunction) => {
		const data = createPlanSchema.parse(req.body);
		const plan = await this.gymService.createPlan(data);
		res.status(200).json(plan);
	};
	getSub = async (req: Request, res: Response, next: NextFunction) => {
		try {
			const user = req.user;
			if (!user?.gymId) {
				throw new GymError(GymErrorCode.UNAUTHORIZED, "gym id not found");
			}
			const plans = await this.gymService.getSub(user.gymId);
			return res.status(200).json(plans);
		} catch (error) {
			next(error);
			return;
		}
	};

	createSubscription = async (req: Request, res: Response, next: NextFunction) => {
		try {
			const data = createSubscriptionSchema.parse(req.body);
			const user = req.user;
			if (!user?.gymId) {
				throw new GymError(GymErrorCode.UNAUTHORIZED, "gym id not found");
			}
			const subscription = await this.gymService.createGymSubscription(data, user.gymId);
			return res.status(200).json(subscription);
		} catch (error) {
			this.logger.error("create sub", error);
			next(error);
			return;
		}
	};
	syncAttendance = async (req: Request, res: Response, next: NextFunction) => {
		try {
			const data = syncDataSchema.parse(req.body);
			const ok = await this.gymService.syncAttendance(data);
			res.status(200).json(ok);
		} catch (error) {
			next(error);
		}
	};
	bulkAddMembers = async (req: Request, res: Response, next: NextFunction) => {
		try {
			const data = bulkAddSchema.parse(req.body);
			const user = req.user;
			if (!user?.gymId) {
				throw new GymError(GymErrorCode.UNAUTHORIZED, "gym id not found");
			}
			switch (data.method) {
				case "excel": {
					if (!req.file) {
						throw new GymError(GymErrorCode.NOT_FOUND, "No file provided");
					}
					const workbook = xlsx.read(req.file.buffer, {
						type: "buffer",
						cellDates: true,
					});
					const sheet = workbook.SheetNames[0];
					if (!sheet) {
						throw new GymError(GymErrorCode.NOT_FOUND, "no sheets found in uploaded file");
					}

					const worksheet = workbook.Sheets[sheet];

					if (!worksheet) {
						throw new GymError(GymErrorCode.NOT_FOUND, "worksheet not found");
					}

					const rawMembers = xlsx.utils.sheet_to_json(worksheet);
					console.log(`📥 bulkAddMembers: read ${rawMembers.length} rows from sheet "${sheet}"`);

					const parsedMembers = bulkMembersSchema.safeParse(rawMembers);

					if (!parsedMembers.success) {
						console.log("❌ bulkAddMembers: sheet validation failed", {
							issues: parsedMembers.error.issues,
						});

						// issue.path looks like [rowIndex, fieldName] — turn that into
						// something the gym owner can actually act on.
						const friendlyIssues = parsedMembers.error.issues.map((issue) => {
							const rowIndex = issue.path[0];
							const field = issue.path[1] ?? "row";
							const excelRow = typeof rowIndex === "number" ? rowIndex + 2 : "?";
							return `Row ${excelRow}: ${String(field)} - ${issue.message}`;
						});

						const preview = friendlyIssues.slice(0, 5).join("; ");
						const remaining = friendlyIssues.length - 5;

						throw new GymError(
							GymErrorCode.BAD_REQUEST,
							`Some rows in the sheet are invalid. ${preview}${remaining > 0 ? `; and ${remaining} more issue(s)` : ""
							}`,
						);
					}

					const payload = parsedMembers.data;
					console.log(`📥 bulkAddMembers: sheet parsed successfully, ${payload.length} valid rows`);

					const report_excel_bulkOnboard = await this.memberService.bulkOnboardExcelMembers(
						user.gymId,
						payload,
						user,
					);
					console.log("✅ bulkAddMembers: onboarding report", report_excel_bulkOnboard);
					return res.status(200).json(report_excel_bulkOnboard);
				}
				/**
				 * @deprecated
				 * not to be used only using excel method now for fullness
				 */
				case "machineSync": {
					if (!data.serialNumber) {
						throw new GymError(
							GymErrorCode.BAD_REQUEST,
							"serial number is required with this type",
						);
					}
					const report_machine_bulkOnboard = await this.memberService.bulkOnboardMachineMembers(
						user.gymId,
						data.serialNumber,
						user,
					);
					return res.status(200).json(report_machine_bulkOnboard);
				}
				default:
					break;
			}

			return res.status(200).json({});
		} catch (error) {
			next(error);
			return;
		}
	};
	getMembershipPackages = async (req: Request, res: Response, next: NextFunction) => {
		try {
			const user = req.user;
			if (!user?.gymId) {
				throw new GymError(GymErrorCode.UNAUTHORIZED, "user not authorised");
			}
			const membershipPackages = await this.gymService.getMembershipPackages(user.gymId);
			return res.status(200).json(membershipPackages);
		} catch (err) {
			next(err);
			return;
		}
	};
	createMembershipPackages = async (req: Request, res: Response, next: NextFunction) => {
		try {
			const user = req.user;
			if (!user?.gymId) {
				throw new GymError(GymErrorCode.UNAUTHORIZED, "user not authorised");
			}
			const data = createMembershipPackageSchema.parse(req.body);
			const membershipPackages = await this.gymService.createMembershipPackages(user.gymId, data);
			return res.status(200).json(membershipPackages);
		} catch (err) {
			next(err);
			return;
		}
	};
	updateMembershipPackages = async (req: Request, res: Response, next: NextFunction) => {
		try {
			const user = req.user;
			if (!user?.gymId) {
				throw new GymError(GymErrorCode.UNAUTHORIZED, "user not authorised");
			}
			const data = updateMembershipPackageSchema.parse(req.body);
			const membershipPackages = await this.gymService.updateMembershipPackages(user.gymId, data);
			return res.status(200).json(membershipPackages);
		} catch (err) {
			next(err);
			return;
		}
	};
	deleteMembershipPackages = async (req: Request, res: Response, next: NextFunction) => {
		try {
			const user = req.user;
			const gymId = req.params.id;
			if (!user || !gymId || Array.isArray(gymId) || user.gymId || user.gymId !== gymId) {
				throw new GymError(GymErrorCode.UNAUTHORIZED, "user not authorised");
			}
			const membershipPackages = await this.gymService.getMembershipPackages(gymId);
			return res.status(200).json(membershipPackages);
		} catch (err) {
			next(err);
			return;
		}
	};
}
