import type { EnvBindings } from "./db";

type PasswordResetEmailInput = {
  to: string;
  resetLink: string;
};

function isResendConfigured(env: EnvBindings) {
  return Boolean(env.RESEND_API_KEY && env.RESEND_FROM_EMAIL);
}

export async function sendPasswordResetEmail(
  env: EnvBindings,
  input: PasswordResetEmailInput,
) {
  if (!isResendConfigured(env)) {
    return { delivered: false, provider: "none" as const };
  }

  const fromName = env.RESEND_FROM_NAME?.trim() || "Velora";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: `${fromName} <${env.RESEND_FROM_EMAIL}>`,
      to: [input.to],
      subject: "Reset your Velora password",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #241622;">
          <h1 style="margin-bottom: 12px;">Reset your Velora password</h1>
          <p>You asked to reset the password for your Velora account.</p>
          <p>
            <a href="${input.resetLink}" style="display:inline-block;padding:12px 18px;background:#b14f69;color:#fff;text-decoration:none;border-radius:999px;">
              Reset password
            </a>
          </p>
          <p>If the button does not open, use this link:</p>
          <p><a href="${input.resetLink}">${input.resetLink}</a></p>
          <p>This link expires in 1 hour.</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(raw || "Unable to send password reset email.");
  }

  return { delivered: true, provider: "resend" as const };
}
