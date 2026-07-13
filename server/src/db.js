// Single shared PrismaClient instance for the whole server.
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
