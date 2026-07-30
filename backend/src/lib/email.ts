import type { EnvBindings } from "./db";

type PasswordResetEmailInput = {
  to: string;
  resetLink: string;
};

type SupportReplyEmailInput = {
  to: string;
  subject: string;
  message: string;
};

function isResendConfigured(env: EnvBindings) {
  return Boolean(env.RESEND_API_KEY && env.RESEND_FROM_EMAIL);
}

async function sendResendEmail(
  env: EnvBindings,
  input: {
    to: string;
    subject: string;
    html: string;
    fromEmail?: string;
    fromName?: string;
    replyTo?: string;
  },
) {
  if (!isResendConfigured(env)) {
    return { delivered: false, provider: "none" as const };
  }

  const fromName = input.fromName?.trim() || env.RESEND_FROM_NAME?.trim() || "Velora";
  const fromEmail = input.fromEmail?.trim() || env.RESEND_FROM_EMAIL;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      reply_to: input.replyTo ? [input.replyTo] : undefined,
    }),
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(raw || "Unable to send email.");
  }

  return { delivered: true, provider: "resend" as const };
}

export async function sendPasswordResetEmail(
  env: EnvBindings,
  input: PasswordResetEmailInput,
) {
  return sendResendEmail(env, {
    to: input.to,
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
  });
}

export async function sendSupportReplyEmail(
  env: EnvBindings,
  input: SupportReplyEmailInput,
) {
  const supportFromEmail = env.RESEND_SUPPORT_FROM_EMAIL?.trim() || env.RESEND_FROM_EMAIL;
  const supportReplyTo = env.SUPPORT_REPLY_TO_EMAIL?.trim() || supportFromEmail;
  const escapedMessage = input.message
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\n", "<br />");

  return sendResendEmail(env, {
    to: input.to,
    subject: input.subject,
    fromEmail: supportFromEmail,
    replyTo: supportReplyTo,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #241622;">
        <h1 style="margin-bottom: 12px;">Velora support reply</h1>
        <p>${escapedMessage}</p>
        <p style="margin-top: 20px;">Reply to this email if you still need help.</p>
      </div>
    `,
  });
}
