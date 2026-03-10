// import type { Request, Response, NextFunction } from "express";
// import { AppLogger } from "../../shared/utils/logger";
// import { MemberService } from "../services/member.services";
// import {
//   onboardMemberSchema,
//   updateMemberSchema,
// } from "../../shared/types/member.types";
// import {
//   MemberError,
//   MemberErrorCode,
// } from "../../shared/errors/member-errors";

// export class MemberController {
//   private memberService: MemberService;
//   private logger: AppLogger;

//   constructor() {
//     this.memberService = new MemberService();
//     this.logger = new AppLogger();
//   }

//   async onboardMember(req: Request, res: Response, next: NextFunction) {
//     try {
//       this.logger.debug("onboardMember: request received");
//       const user = req.user;
//       if (!user || !user.gymId) {
//         throw new MemberError(
//           MemberErrorCode.UNAUTHORIZED,
//           "user not authorised",
//         );
//       }
//       const data = onboardMemberSchema.parse(req.body);
//       const result = await this.memberService.onboardMember(data, user);
//       this.logger.debug("onboardMember: completed", { userId: user.id });
//       res.status(201).json(result);
//     } catch (error) {
//       this.logger.error("onboardMember: error", { error });
//       next(error);
//     }
//   }

//   async getGymMembers(req: Request, res: Response, next: NextFunction) {
//     try {
//       this.logger.debug("getGymMembers: request received");
//       const user = req.user;
//       if (!user || user.gymId) {
//         throw new MemberError(
//           MemberErrorCode.UNAUTHORIZED,
//           "user not authorised",
//         );
//       }
//       const result = await this.memberService.getGymMembers(
//         user.gymId,
//         req.query,
//       );
//       this.logger.debug("getGymMembers: completed", { userId: user.id, gymId });
//       res.status(200).json(result);
//     } catch (error) {
//       this.logger.error("getGymMembers: error", { error });
//       next(error);
//     }
//   }

//   async getGymMember(req: Request, res: Response, next: NextFunction) {
//     try {
//       this.logger.debug("getGymMember: request received");
//       const user = req.user;
//       if (!user) {
//         throw new MemberError(
//           MemberErrorCode.UNAUTHORIZED,
//           "user not authorised",
//         );
//       }
//       const { gymId, memberId } = req.params;
//       const result = await this.memberService.getGymMember(
//         gymId,
//         memberId,
//         user,
//       );
//       this.logger.debug("getGymMember: completed", {
//         userId: user.id,
//         gymId,
//         memberId,
//       });
//       res.status(200).json(result);
//     } catch (error) {
//       this.logger.error("getGymMember: error", { error });
//       next(error);
//     }
//   }

//   async updateMember(req: Request, res: Response, next: NextFunction) {
//     try {
//       this.logger.debug("updateMember: request received");
//       const user = req.user;
//       if (!user) {
//         throw new MemberError(
//           MemberErrorCode.UNAUTHORIZED,
//           "user not authorised",
//         );
//       }
//       const { gymId, memberId } = req.params;
//       const data = updateMemberSchema.parse(req.body);
//       const result = await this.memberService.updateMember(
//         gymId,
//         memberId,
//         data,
//         user,
//       );
//       this.logger.debug("updateMember: completed", {
//         userId: user.id,
//         gymId,
//         memberId,
//       });
//       res.status(200).json(result);
//     } catch (error) {
//       this.logger.error("updateMember: error", { error });
//       next(error);
//     }
//   }

//   async deleteMember(req: Request, res: Response, next: NextFunction) {
//     try {
//       this.logger.debug("deleteMember: request received");
//       const user = req.user;
//       if (!user) {
//         throw new MemberError(
//           MemberErrorCode.UNAUTHORIZED,
//           "user not authorised",
//         );
//       }
//       const { gymId, memberId } = req.params;
//       await this.memberService.deleteMember(gymId, memberId, user);
//       this.logger.debug("deleteMember: completed", {
//         userId: user.id,
//         gymId,
//         memberId,
//       });
//       res.status(204).send();
//     } catch (error) {
//       this.logger.error("deleteMember: error", { error });
//       next(error);
//     }
//   }
// }
