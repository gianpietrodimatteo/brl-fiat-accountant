import type { Session } from "../domain/Session";
import type { User } from "../domain/User";
import type { SessionRepository } from "../repositories/SessionRepository";
import type { UserRepository } from "../repositories/UserRepository";

export type LoginResult = { status: "ok"; session: Session } | { status: "user_not_found" };

export type GetUserForSessionResult = { status: "ok"; user: User } | { status: "not_found" };

export class SessionService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly sessionRepository: SessionRepository,
  ) {}

  login(username: string): LoginResult {
    const user = this.userRepository.findByUsername(username);
    if (!user) {
      return { status: "user_not_found" };
    }

    const session = this.sessionRepository.create(user.id);
    return { status: "ok", session };
  }

  getUserForSession(token: string): GetUserForSessionResult {
    const session = this.sessionRepository.findByToken(token);
    if (!session) {
      return { status: "not_found" };
    }

    const user = this.userRepository.findById(session.userId);
    if (!user) {
      return { status: "not_found" };
    }

    return { status: "ok", user };
  }
}
