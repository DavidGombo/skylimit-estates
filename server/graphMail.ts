// ---------------------------------------------------------------------------
// Microsoft Graph mailer — sends email from the Skylimit Outlook mailbox using
// the OAuth2 client-credentials flow (application permission Mail.Send).
//
// Required environment variables (set in Railway):
//   MS_TENANT_ID     — Azure AD directory (tenant) ID
//   MS_CLIENT_ID     — App registration (client) ID
//   MS_CLIENT_SECRET — App registration client secret VALUE
//   MS_SENDER        — the mailbox to send from, e.g. dg@skylimitestates.com
// ---------------------------------------------------------------------------

export interface GraphAttachment {
  name: string;
  contentType: string;
  contentBytes: string; // base64 (no data: prefix)
}

export interface SendMailInput {
  to: string[];
  cc?: string[];
  subject: string;
  body: string; // plain text; newlines preserved
  attachments?: GraphAttachment[];
}

export function graphConfigStatus() {
  const { MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_SENDER } = process.env;
  const missing: string[] = [];
  if (!MS_TENANT_ID) missing.push("MS_TENANT_ID");
  if (!MS_CLIENT_ID) missing.push("MS_CLIENT_ID");
  if (!MS_CLIENT_SECRET) missing.push("MS_CLIENT_SECRET");
  if (!MS_SENDER) missing.push("MS_SENDER");
  return { configured: missing.length === 0, missing, sender: MS_SENDER || "" };
}

async function getToken(): Promise<string> {
  const tenant = process.env.MS_TENANT_ID!;
  const params = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID!,
    client_secret: process.env.MS_CLIENT_SECRET!,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const resp = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const data: any = await resp.json();
  if (!resp.ok) {
    throw new Error(`Token error: ${data.error || resp.status} — ${data.error_description || "no detail"}`);
  }
  return data.access_token as string;
}

export async function sendGraphMail(input: SendMailInput): Promise<void> {
  const status = graphConfigStatus();
  if (!status.configured) {
    throw new Error(`Email is not configured. Missing: ${status.missing.join(", ")}. Add these in Railway → Variables.`);
  }
  const token = await getToken();
  const sender = process.env.MS_SENDER!;

  const message: any = {
    subject: input.subject,
    // Send as text so the wording renders exactly as typed (line breaks kept).
    body: { contentType: "Text", content: input.body },
    toRecipients: input.to.filter(Boolean).map((a) => ({ emailAddress: { address: a } })),
  };
  if (input.cc && input.cc.filter(Boolean).length) {
    message.ccRecipients = input.cc.filter(Boolean).map((a) => ({ emailAddress: { address: a } }));
  }
  if (input.attachments && input.attachments.length) {
    message.attachments = input.attachments.map((att) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: att.name,
      contentType: att.contentType,
      contentBytes: att.contentBytes,
    }));
  }

  const resp = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });

  if (!resp.ok) {
    let detail = `${resp.status}`;
    try { const e: any = await resp.json(); detail = e?.error?.message || detail; } catch { /* ignore */ }
    throw new Error(`Microsoft Graph send failed: ${detail}`);
  }
}
