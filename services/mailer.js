const MAIL_PROVIDER = process.env.MAIL_PROVIDER || "resend";

export async function sendMail({ to, subject, html, text }) {
  if (MAIL_PROVIDER !== "resend") {
    console.error(`[MAIL] Unsupported provider: ${MAIL_PROVIDER}`);
    return;
  }

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Arya Security <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
      ...(text ? { text } : {}),
    }),
  });

  if (!resp.ok) {
    const responseText = await resp.text();
    console.error("[MAIL] Email API failed:", resp.status, responseText);
    return;
  }

  console.log("[MAIL] Email API sent OK");
}
