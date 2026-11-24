import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return null;

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.hostinger.com',
      port: Number(process.env.SMTP_PORT || 465),
      secure: String(process.env.SMTP_SECURE || 'true') === 'true',
      auth: { user, pass },
    });
  }
  return transporter;
}

function resolveBrandLogoPath() {
  const candidates = [
    path.resolve(process.cwd(), '../public/gamestrike-logo.jpg'),
    path.resolve(process.cwd(), 'public/gamestrike-logo.jpg'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

export async function verifySmtpConnection() {
  const mail = getTransporter();
  if (!mail) return { configured: false, ok: false };
  try {
    await mail.verify();
    return { configured: true, ok: true };
  } catch (err) {
    return { configured: true, ok: false, error: err.message };
  }
}

/**
 * Sends a branded 6-digit OTP email via Hostinger SMTP (smtp.hostinger.com:465)
 * with an inline CID brand logo attachment so Gmail / Apple Mail / Outlook never
 * show a broken image icon.
 */
export async function sendOtpEmail({ to, otp, purpose = 'signup' }) {
  const isReset = purpose === 'reset';
  const subject = isReset
    ? `GameStrike.io — Password Reset Code: ${otp}`
    : `GameStrike.io — Verify Your Account Code: ${otp}`;

  const badgeText = isReset ? 'PASSWORD RECOVERY' : 'ACCOUNT VERIFICATION';
  const heading = isReset ? 'Reset Your Password' : 'Verify Your Email Address';
  const subtext = isReset
    ? 'We received a request to reset your GameStrike.io password. Enter the 6-digit security code below to set a new password.'
    : 'Welcome to GameStrike.io VIP Concierge. Enter the 6-digit verification code below to activate your account and claim your Welcome Bonus.';

  const logoPath = resolveBrandLogoPath();
  const publicBase = (process.env.PUBLIC_APP_URL || 'https://gamestrike.io').replace(/\/$/, '');
  const logoSrc = logoPath ? 'cid:gamestrike-logo' : `${publicBase}/gamestrike-logo.jpg`;

  const attachments = logoPath
    ? [
        {
          filename: 'gamestrike-logo.jpg',
          path: logoPath,
          cid: 'gamestrike-logo',
          contentDisposition: 'inline',
        },
      ]
    : [];

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@700;800&display=swap');
  </style>
</head>
<body style="margin:0;padding:0;background-color:#07070A;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#07070A;padding:32px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;background-color:#0F1016;border:1px solid #222434;border-radius:20px;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,0.6);">
          <!-- Top Accent Bar -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,#FF1F4B 0%,#FFD166 50%,#FF1F4B 100%);font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Header with Embedded Live Logo -->
          <tr>
            <td align="center" style="padding:30px 28px 18px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:12px;">
                    <img src="${logoSrc}" alt="GameStrike.io" width="52" height="52" style="display:block;width:52px;height:52px;border-radius:14px;border:1.5px solid #FFD166;object-fit:cover;" />
                  </td>
                  <td style="vertical-align:middle;text-align:left;">
                    <div style="font-family:'Plus Jakarta Sans','Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.4px;color:#FFFFFF;line-height:1.15;">
                      GameStrike<span style="color:#FF1F4B;">.io</span>
                    </div>
                    <div style="font-family:'Plus Jakarta Sans','Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#FFD166;margin-top:3px;">
                      24/7 VIP Gaming Concierge
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding:6px 30px 28px;text-align:center;">
              <div style="display:inline-block;padding:5px 12px;border-radius:999px;background-color:rgba(255,31,75,0.14);border:1px solid rgba(255,31,75,0.35);color:#FF5C7C;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:14px;">
                ${badgeText}
              </div>

              <h1 style="margin:0 0 10px;font-family:'Plus Jakarta Sans','Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:23px;font-weight:800;color:#FFFFFF;letter-spacing:-0.3px;">
                ${heading}
              </h1>

              <p style="margin:0 0 24px;font-family:'Plus Jakarta Sans','Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.65;color:#B4B9CE;">
                ${subtext}
              </p>

              <!-- OTP Code Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#151722;border:1.5px solid #FF1F4B;border-radius:16px;margin-bottom:22px;">
                <tr>
                  <td align="center" style="padding:22px 16px;">
                    <div style="font-family:'Plus Jakarta Sans','Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:#FFD166;margin-bottom:10px;">
                      Your 6-Digit Security Code
                    </div>
                    <div style="font-family:'JetBrains Mono','SF Mono',Menlo,Consolas,'Courier New',monospace;font-size:36px;font-weight:800;letter-spacing:10px;color:#FFFFFF;line-height:1.2;padding-left:10px;">
                      ${otp}
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-family:'Plus Jakarta Sans','Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12.5px;line-height:1.6;color:#8D93AB;">
                This code expires in <strong style="color:#FFFFFF;">10 minutes</strong>. For your security, never share this code with anyone — GameStrike.io support will never ask for your OTP.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#0B0C11;border-top:1px solid #1C1E2C;padding:18px 28px;text-align:center;">
              <div style="font-family:'Plus Jakarta Sans','Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:#7C829B;">
                Sent securely from <strong style="color:#E2E5F1;">verified@gamestrike.io</strong>
              </div>
              <div style="font-family:'Plus Jakarta Sans','Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;color:#5D637A;margin-top:5px;">
                &copy; ${new Date().getFullYear()} GameStrike.io &bull; Instant Loads &bull; 24/7 Live Support
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `GameStrike.io — ${heading}\n\nYour 6-digit OTP code is: ${otp}\n\nThis code expires in 10 minutes. Never share your OTP with anyone.`;

  const mail = getTransporter();
  if (!mail) {
    console.log(`[OTP - Hostinger SMTP not set yet] To: ${to} | Purpose: ${purpose} | Code: ${otp}`);
    return { sentViaSmtp: false, devOtp: otp };
  }

  await mail.sendMail({
    from: process.env.SMTP_FROM || `GameStrike.io <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html,
    attachments,
  });

  return { sentViaSmtp: true };
}

export async function sendFreeplayTaskEmail({ to, name, from, pass, amount }) {
  const mailbox = String(from || '').trim();
  const password = String(pass || '');
  const dollars = Number(amount || 0).toFixed(2);
  const subject = 'GameStrike.io — your one-time freeplay task';
  const text = `Hi ${name},

This is your one-time GameStrike.io freeplay task ($${dollars}).

Do not mark this email as spam.
If it landed in Spam, move it to Primary.
Do not open this email and screenshot the inside.
Open your Primary inbox and screenshot the list where this GameStrike.io email is sitting, still visible in the inbox.
Send that inbox screenshot in GameStrike chat to claim freeplay once.`;
  if (!mailbox || !password) {
    console.log(`[Freeplay email not sent — Hostinger mailbox password missing] To: ${to}`);
    return { sentViaSmtp: false };
  }
  const mail = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.hostinger.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') === 'true',
    auth: { user: mailbox, pass: password },
  });
  await mail.sendMail({
    from: `GameStrike.io <${mailbox}>`,
    to,
    subject,
    text,
  });
  return { sentViaSmtp: true };
}
