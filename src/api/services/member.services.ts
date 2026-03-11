// import { GymError, GymErrorCode } from "@/shared/errors/gym-errors";
// import type { AuthenticatedUser } from "@/shared/types/auth.types";
// import type { OnboardMemberInput } from "../../shared/types/member.types";
// import { client } from "../../shared/utils/prisma";
// import { MemberRepository } from "../repositories/member.repository";
// import { UserRepository } from "../repositories/user.repository";
// import { GymService } from "./gym.service";

// export class MemberService {
//   private gymService: GymService;
//   private memberRepository: MemberRepository;
//   private userRepository: UserRepository;
//   constructor() {
//     this.gymService = new GymService({ prisma: client });
//     this.memberRepository = new MemberRepository();
//     this.userRepository = new UserRepository(client);
//   }
//   async onboardMember(data: OnboardMemberInput, _user: AuthenticatedUser) {
//     if (!user.gymId) {
//       throw new GymError(GymErrorCode.UNAUTHORIZED, "No Gym Id Found");
//     }
//     const gym = await this.gymService.getGym(user.gymId, user);
//     if (!gym.data) {
//       throw new GymError(GymErrorCode.NOT_FOUND, "gym with id not found");
//     }
//     const user = await this.userRepository.createUser({
//         email :
//     });
//     const _member = await this.memberRepository.createMember(data, gym.data.id);
//   }
//   async getGymMembers() {}
//   async getGymMember() {}
//   async updateMember() {}
//   async deleteMember() {}
// }
