import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { UserRole } from "@/generated/enums";
import { AuthError, AuthErrorCode } from "@/shared/errors/auth-errors";
import env from "../../env";
import type {
  AccessTokenPayload,
  LoginInput,
  RegisterInput,
  ValidateAccessTokenResult,
} from "../../shared/types/auth.types";
import type {
  BaseResponse,
  loginReturnType,
  registerReturnType,
} from "../../shared/types/returns";
import { client } from "../../shared/utils/prisma";
// import { AuthRepository } from "../repositories/auth.repository";
import { UserRepository } from "../repositories/user.repository";

export class AuthService {
  // private authRepository: AuthRepository;
  private userRepository: UserRepository;
  constructor() {
    // this.authRepository = new AuthRepository(client);
    this.userRepository = new UserRepository(client);
  }

  async login(data: LoginInput): Promise<BaseResponse<loginReturnType>> {
    const user = await this.userRepository.getUserByEmail(data.email);
    if (!user || user === null) {
      throw new AuthError(AuthErrorCode.FORBIDDEN, "invalid credentials");
    }
    const isValid = await this.comparePassword(data.password, user.password);
    if (!isValid) {
      throw new AuthError(AuthErrorCode.FORBIDDEN, "invalid credentials");
    }

    const tokens = await this.generateTokens(user.id, user.role);
    return {
      message: "user loggen in successfully",
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
        tokens: { ...tokens },
      },
    };
  }
  async register(
    data: RegisterInput,
  ): Promise<BaseResponse<registerReturnType>> {
    const user = await this.userRepository.getUserByEmail(data.email);
    if (user) {
      throw new AuthError(AuthErrorCode.FORBIDDEN, "email already exists");
    }
    const pass = await this.hashPassword(data.password);
    const newUser = await this.userRepository.createUser({
      email: data.email,
      password: pass,
      role: data.role,
    });
    const tokens = await this.generateTokens(newUser.id, newUser.role);
    return {
      message: "user registered successfully",
      success: true,
      data: {
        user: {
          id: newUser.id,
          email: newUser.email,
          role: newUser.role,
        },
        tokens: { ...tokens },
      },
    };
  }

  private async generateTokens(userId: string, userRole: UserRole) {
    const payload = {
      sub: userId,
      role: userRole,
    };

    const authToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
      expiresIn: "15m",
    });

    const refreshToken = jwt.sign({ sub: userId }, env.JWT_REFRESH_SECRET, {
      expiresIn: "30d",
    });

    return { authToken, refreshToken };
  }
  private async comparePassword(
    password: string,
    hash: string,
  ): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, env.SALT);
  }
  async validateAccessToken(token: string): Promise<ValidateAccessTokenResult> {
    try {
      const payload = jwt.verify(
        token,
        process.env.ACCESS_TOKEN_SECRET!,
      ) as AccessTokenPayload;

      return {
        valid: true,
        user: {
          id: payload.sub,
          role: payload.role,
        },
      };
    } catch {
      return { valid: false };
    }
  }
}
