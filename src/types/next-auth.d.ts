import "next-auth";
import { DefaultSession } from "next-auth"; // Added this import based on the instruction's code edit

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isAdmin?: boolean;
      notificationsEnabled?: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    isAdmin?: boolean;
    notificationsEnabled?: boolean;
    sessionVersion?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    isAdmin?: boolean;
    notificationsEnabled?: boolean;
    sessionVersion?: number;
  }
}
