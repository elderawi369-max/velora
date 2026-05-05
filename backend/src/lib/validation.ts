import { z } from "zod";

const usernameRegex = /^[a-z0-9_]{3,20}$/;

export const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(72),
  turnstileToken: z.string().trim().min(1),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(72),
});

export const profileSchema = z.object({
  username: z.string().trim().toLowerCase().regex(usernameRegex),
  displayName: z.string().trim().min(2).max(30),
  personalityType: z.enum([
    "clingy / affectionate",
    "cold / mysterious",
    "flirty / teasing",
    "protective",
    "soft / sweet",
    "intellectual",
    "funny / chaotic",
    "confident / dominant",
    "emotionally distant",
    "roleplay / fantasy",
  ]),
  identity: z.enum(["woman", "man", "prefer not to say"]),
  lookingFor: z.enum(["women", "men", "any"]),
  bio: z.string().trim().min(10).max(280),
  promptEntries: z
    .array(
      z.object({
        question: z.string().trim().min(4).max(80),
        answer: z.string().trim().min(4).max(180),
      }),
    )
    .min(0)
    .max(3),
  avatarPreset: z.string().trim().min(1).max(30),
  vibeTags: z.array(z.string().trim().min(1).max(24)).min(1).max(6),
  boundaries: z.array(z.string().trim().min(1).max(40)).min(1).max(8),
});

export const supportTicketSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  subject: z.string().trim().min(4).max(120),
  message: z.string().trim().min(10).max(2000),
  turnstileToken: z.string().trim().min(1),
});
