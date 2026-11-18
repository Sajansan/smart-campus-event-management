const { fail } = require("./validation");

function deliveryFailure(status, details) {
  if (status === 401) return "Resend rejected the API key. Check the backend key and restart the API.";
  if (status === 403 && /only send testing emails to your own email address/i.test(details)) {
    return "The Resend test sender can only email the exact address on your Resend account. Use that address or configure a verified sending domain.";
  }
  if (status === 403 && /domain is not verified/i.test(details)) {
    return "Resend could not verify the sender domain. Check the sending domain and STAFF_INVITE_FROM.";
  }
  if (status === 429) return "Resend's send limit was reached. Wait before trying again, or check your Resend quota.";
  return "Resend rejected the email. Check the Resend logs before resending.";
}

function configuration() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.STAFF_INVITE_FROM?.trim();
  const frontend = URL.parse(process.env.APP_FRONTEND_URL ?? "");
  const local = frontend?.protocol === "http:" && ["localhost", "127.0.0.1"].includes(frontend.hostname);
  const invalidSettings = [];
  if (!apiKey || apiKey === "your_sending_key") invalidSettings.push("RESEND_API_KEY");
  if (!from) invalidSettings.push("STAFF_INVITE_FROM");
  if (!frontend || frontend.username || frontend.password || (frontend.protocol !== "https:" && !local)) {
    invalidSettings.push("APP_FRONTEND_URL");
  }
  if (invalidSettings.length) {
    fail(`Staff email setup needs ${invalidSettings.join(", ")} in the backend environment. Restart the API after updating it.`, 503);
  }
  return { apiKey, from, frontend };
}

async function send({ apiKey, from, frontend }, user, token, requestId) {
  const link = new URL(frontend);
  link.search = "";
  link.hash = "staff-invite=" + token;
  const reset = user.staff_verified && !user.must_change_password;
  const subject = reset ? "Reset your DBIT Campus password" : "You’re invited to DBIT Campus";
  const action = reset ? "Reset your password" : "Set your password";
  const text = `${subject}

${action}:
${link.href}

This link expires in 24 hours and can be used once. After saving your password, sign in to DBIT Campus.`;
  const href = link.href.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  const html = `<p>${subject}</p><p><a href="${href}">${action}</a></p>
<p>This link expires in 24 hours and can be used once. After saving your password, sign in to DBIT Campus.</p>`;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": requestId
      },
      body: JSON.stringify({ from, to: [user.email], subject, text, html }),
      signal: AbortSignal.timeout(8000)
    });
    if (response.ok) return null;
    const details = await response.json().catch(() => ({}));
    console.warn("Resend declined a staff email with HTTP status", response.status);
    return deliveryFailure(response.status, typeof details?.message === "string" ? details.message : "");
  } catch {
    console.warn("The Resend request could not be completed.");
    return "The API could not reach Resend. Check the backend connection and try resending.";
  }
}

module.exports = { configuration, send };
