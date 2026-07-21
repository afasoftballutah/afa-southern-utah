import nodemailer from "nodemailer";

/**
 * Emails the director a copy of the signed registration PDF.
 *
 * Uses the league's own Gmail account via SMTP (GMAIL_USER +
 * GMAIL_APP_PASSWORD env vars) rather than a third-party transactional-email
 * vendor — one fewer account for the league to hold. See the developer
 * README for how to generate a Gmail App Password.
 *
 * Never throws — registration must succeed even if email delivery fails.
 * Callers should check the returned { ok, error } and record it on the
 * registration row (email_status / email_error) rather than failing the
 * request.
 */
export async function sendRegistrationEmail({ pdfBytes, registration }) {
  const { GMAIL_USER, GMAIL_APP_PASSWORD, DIRECTOR_EMAIL } = process.env;

  if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !DIRECTOR_EMAIL) {
    return {
      ok: false,
      error:
        "Email not configured (missing GMAIL_USER, GMAIL_APP_PASSWORD, or DIRECTOR_EMAIL env var)",
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });

    await transporter.sendMail({
      from: `AFA Southern Utah <${GMAIL_USER}>`,
      to: DIRECTOR_EMAIL,
      subject: `New team registration: ${registration.teamName} (${registration.tournamentName})`,
      text: `${registration.teamName} registered for ${registration.tournamentName}, ${registration.divisionName} division.\n\nManager: ${registration.manager.name} (${registration.manager.email})\n\nSigned roster and release attached.`,
      attachments: [
        {
          filename: `${registration.teamName.replace(/[^a-z0-9]+/gi, "-")}-waiver.pdf`,
          content: Buffer.from(pdfBytes),
          contentType: "application/pdf",
        },
      ],
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || "Unknown email error" };
  }
}
