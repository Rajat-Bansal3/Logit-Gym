import { Gym, Prisma, PrismaClient } from "@/generated/client";
import { CreateGym } from "@/shared/types/gym.types";

type gym_including_owner = Prisma.GymGetPayload<{
  include: {
    owner: true;
  };
}>;

type gym_with_profile = Prisma.GymGetPayload<{
  include: {
    gymProfile: true;
  };
}>;

export class GymRepository {
  private client: PrismaClient;
  constructor(client: PrismaClient) {
    this.client = client;
  }
  async findByOwnerId(ownerId: string): Promise<gym_including_owner[]> {
    return await this.client.gym.findMany({
      where: {
        ownerId: ownerId,
      },
      include: {
        owner: true,
      },
    });
  }
  async create(data: {
    name: string;
    address: string;
    ownerId: string;
  }): Promise<Gym> {
    return await this.client.gym.create({
      data: {
        name: data.name,
        address: data.address,
        ownerId: data.ownerId,
      },
    });
  }
  async createProfile(
    gymId: string,
    profile: NonNullable<CreateGym["profile"]>,
  ): Promise<void> {
    await this.client.gymProfile.create({
      data: {
        gymId,

        timing: profile.timing,
        openDays: profile.openDays,
        fees: profile.fees,
        genderAllowed: profile.genderAllowed,
        ownerName: profile.ownerName,
        ownerContact: profile.ownerContact,
        amenities: profile.amenities,
        images: profile.images,

        fitnessProfession: profile.fitnessProfession,
        referralOffer: profile.referralOffer,
      },
    });
  }
  async findByIdWithProfile({
    gymId,
    isDeleted = false,
  }: {
    gymId: string;
    isDeleted: boolean;
  }): Promise<gym_with_profile | null> {
    return await this.client.gym.findUnique({
      where: {
        id: gymId,
        isDeleted,
      },
      include: {
        gymProfile: true,
      },
    });
  }
  async findById({
    gymId,
    isDeleted = false,
  }: {
    gymId: string;
    isDeleted: boolean;
  }): Promise<Gym | null> {
    return await this.client.gym.findUnique({
      where: {
        id: gymId,
        isDeleted,
      },
    });
  }
  async update(
    gymId: string,
    data: {
      name?: string;
      address?: string;
    },
  ): Promise<void> {
    await this.client.gym.update({
      where: {
        id: gymId,
      },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.address && { address: data.address }),
      },
    });
  }
  async delete(gymId: string): Promise<void> {
    await this.client.gym.update({
      where: {
        id: gymId,
      },
      data: {
        isDeleted: true,
      },
    });
  }
  async upsertProfile(
    gymId: string,
    profile: CreateGym["profile"],
  ): Promise<void> {
    await this.client.gymProfile.upsert({
      where: { gymId },

      create: {
        gymId,
        timing: profile.timing,
        openDays: profile.openDays,
        fees: profile.fees,
        genderAllowed: profile.genderAllowed,
        ownerName: profile.ownerName,
        ownerContact: profile.ownerContact,
        amenities: profile.amenities,
        images: profile.images,
        fitnessProfession: profile.fitnessProfession,
        referralOffer: profile.referralOffer,
      },

      update: {
        ...(profile.timing !== undefined && { timing: profile.timing }),
        ...(profile.openDays !== undefined && { openDays: profile.openDays }),
        ...(profile.fees !== undefined && { fees: profile.fees }),
        ...(profile.genderAllowed !== undefined && {
          genderAllowed: profile.genderAllowed,
        }),
        ...(profile.ownerName !== undefined && {
          ownerName: profile.ownerName,
        }),
        ...(profile.ownerContact !== undefined && {
          ownerContact: profile.ownerContact,
        }),
        ...(profile.amenities !== undefined && {
          amenities: profile.amenities,
        }),
        ...(profile.images !== undefined && { images: profile.images }),
        ...(profile.fitnessProfession !== undefined && {
          fitnessProfession: profile.fitnessProfession,
        }),
        ...(profile.referralOffer !== undefined && {
          referralOffer: profile.referralOffer,
        }),
      },
    });
  }
  async findMemberByUserId(userId: string): Promise<{ gymId: string } | null> {
    return this.client.member.findUnique({
      where: { userId },
      select: { gymId: true },
    });
  }
}
