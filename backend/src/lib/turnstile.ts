import type { EnvBindings } from "./db";

type TurnstileResult = {
  success: boolean;
  "error-codes"?: string[];
};

export async function verifyTurnstileToken(
  env: EnvBindings,
  token: string,
  remoteIp?: string,
  clientPlatform?: string,
  origin?: string,
) {
  const secret = env.TURNSTILE_SECRET_KEY;
  const isProduction = env.APP_ENV === "production";
  const nativeAndroidBypassAllowed =
    token === "android-native-bypass" &&
    clientPlatform === "android-native" &&
    origin === "https://localhost";

  if (nativeAndroidBypassAllowed) {
    return true;
  }

  if (!secret) {
    return !isProduction;
  }

  if (!token) {
    return false;
  }

  const formData = new FormData();
  formData.append("secret", secret);
  formData.append("response", token);

  if (remoteIp) {
    formData.append("remoteip", remoteIp);
  }

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body: formData,
    },
  );

  if (!response.ok) {
    return false;
  }

  const data = (await response.json()) as TurnstileResult;
  return Boolean(data.success);
}
