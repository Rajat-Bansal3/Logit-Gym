import { Gym, Prisma, PrismaClient } from "../../generated/client";
import { CreateGym, UpdateGym } from "../../shared/types/gym.types";

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
    profile: UpdateGym["profile"],
  ): Promise<void> {
    if (!profile) return;

    await this.client.gymProfile.upsert({
      where: { gymId },
      create: {
        gymId,
        timing: profile.timing ?? "09:00 - 21:00",
        openDays: profile.openDays ?? [],
        fees: profile.fees ?? 0,
        genderAllowed: profile.genderAllowed ?? "ALL",
        ownerName: profile.ownerName ?? "Unknown",
        ownerContact: profile.ownerContact ?? "Unknown",
        amenities: profile.amenities ?? [],
        images: profile.images ?? [],
        fitnessProfession: profile.fitnessProfession ?? null,
        referralOffer: profile.referralOffer ?? null,
      },
      update: {
        ...(profile.timing && { timing: profile.timing }),
        ...(profile.openDays && { openDays: profile.openDays }),
        ...(profile.fees !== undefined && { fees: profile.fees }),
        ...(profile.genderAllowed && { genderAllowed: profile.genderAllowed }),
        ...(profile.ownerName && { ownerName: profile.ownerName }),
        ...(profile.ownerContact && { ownerContact: profile.ownerContact }),
        ...(profile.amenities && { amenities: profile.amenities }),
        ...(profile.images && { images: profile.images }),
        fitnessProfession: profile.fitnessProfession ?? null,
        referralOffer: profile.referralOffer ?? null,
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
