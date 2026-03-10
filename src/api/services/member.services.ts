import { OnboardMemberInput } from "../../shared/types/member.types";
import { GymService } from "./gym.service";
import { client } from "../../shared/utils/prisma";
import { AuthenticatedUser } from "@/shared/types/auth.types";
import { GymError, GymErrorCode } from "@/shared/errors/gym-errors";
import { MemberRepository } from "../repositories/member.repository";
import { UserRepository } from "../repositories/user.repository";

export class MemberService {
  private gymService: GymService;
  private memberRepository: MemberRepository;
  private userRepository: UserRepository;
  constructor() {
    this.gymService = new GymService({ prisma: client });
    this.memberRepository = new MemberRepository();
    this.userRepository = new UserRepository(client);
  }
  async onboardMember(data: OnboardMemberInput, user: AuthenticatedUser) {
    if (!user.gymId)
      throw new GymError(GymErrorCode.UNAUTHORIZED, "No Gym Id Found");
    const gym = await this.gymService.getGym(user.gymId, user);
    if (!gym.data)
      throw new GymError(GymErrorCode.NOT_FOUND, "gym with id not found");
    let user = await this.userRepository.createUser({
        email : 
    });
    let member = await this.memberRepository.createMember(data, gym.data.id);
  }
  async getGymMembers() {}
  async getGymMember() {}
  async updateMember() {}
  async deleteMember() {}
}
