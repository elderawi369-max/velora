import { Hono } from "hono";
import type { EnvBindings } from "../lib/db";
import { adminRoutes } from "./admin";
import { authRoutes } from "./auth";
import { chatRoutes } from "./chat";
import { notificationRoutes } from "./notifications";
import { paymentRoutes } from "./payments";
import { profileRoutes } from "./profiles";
import { pushRoutes } from "./push";
import { safetyRoutes } from "./safety";
import { socialRoutes } from "./social";
import { supportRoutes } from "./support";

export const apiRoutes = new Hono<{ Bindings: EnvBindings }>();

apiRoutes.route("/admin", adminRoutes);
apiRoutes.route("/auth", authRoutes);
apiRoutes.route("/profiles", profileRoutes);
apiRoutes.route("/push", pushRoutes);
apiRoutes.route("/chat", chatRoutes);
apiRoutes.route("/notifications", notificationRoutes);
apiRoutes.route("/payments", paymentRoutes);
apiRoutes.route("/social", socialRoutes);
apiRoutes.route("/safety", safetyRoutes);
apiRoutes.route("/support", supportRoutes);
