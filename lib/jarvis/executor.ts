/**
 * Jarvis executor — performs the real side effects.
 *
 * Each function returns { ok, summary, externalId? } and throws on failure so
 * the orchestrator records the error. Secrets (API keys, deploy hooks) are
 * read from env at runtime — never stored in the DB.
 */

import { randomUUID } from 'node:crypto';
import { type JarvisActionKind } from '@/lib/schemas';
import { buildRequest, executeLocalAction, type LocalActionKind } from './actions';

/** Hit a deploy hook (Vercel / Railway / custom) to redeploy a project. */
export async function deploy({
  projectId,
  hookUrl,
}: {
  projectId: string;
  hookUrl: string;
}): Promise<{ ok: boolean; summary: string; externalId?: string }> {
  const started = Date.now();
  try {
    const res = await fetch(hookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, source: 'jarvis', at: new Date().toISOString() }),
      // Deploy hooks can take a while; allow up to 5 min.
      signal: AbortSignal.timeout(5 * 60_000),
    });
    const body = await res.text().catch(() => '');
    if (!res.ok) {
      return {
        ok: false,
        summary: `Deploy hook returned ${res.status}: ${body.slice(0, 400)}`,
      };
    }
    return {
      ok: true,
      summary: `Deploy triggered (${res.status}) in ${((Date.now() - started) / 1000).toFixed(1)}s`,
      externalId: body || undefined,
    };
  } catch (err) {
    return {
      ok: false,
      summary: `Deploy failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Announce a launch: emails, Slack, social — whichever integrations are keyed. */
export async function announce({
  projectId,
  title,
  deployUrl,
  checkoutUrl,
}: {
  projectId: string;
  title: string;
  deployUrl: string;
  checkoutUrl?: string;
}): Promise<{ ok: boolean; summary: string; externalId?: string }> {
  const started = Date.now();
  const results: string[] = [];
  let delivered = 0;

  // 1. Slack (if keyed)
  const slackToken = process.env.SLACK_BOT_TOKEN;
  const slackChannel = process.env.SLACK_ANNOUNCE_CHANNEL;
  if (slackToken && slackChannel) {
    try {
      const res = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${slackToken}`,
        },
        body: JSON.stringify({
          channel: slackChannel,
          text: `🚀 *${title}* is live! ${deployUrl}${checkoutUrl ? `\nPay: ${checkoutUrl}` : ''}`,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (data.ok) delivered += 1;
      results.push(data.ok ? 'slack: posted' : `slack: ${data.error}`);
    } catch (err) {
      results.push(`slack: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2. Email broadcast via Resend (if keyed)
  const resendKey = process.env.RESEND_API_KEY;
  const announceTo = process.env.JARVIS_ANNOUNCE_TO;
  if (resendKey && announceTo) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          // Resend requires a verified sender. Set JARVIS_FROM_EMAIL to the
          // address verified on your domain; onboarding@resend.dev only works
          // for the account owner's own inbox.
          from: process.env.JARVIS_FROM_EMAIL ?? 'Founder OS <onboarding@resend.dev>',
          to: announceTo.split(',').map((s) => s.trim()),
          subject: `${title} is live`,
          html: `<h1>${title} is live</h1><p>Check it out: <a href="${deployUrl}">${deployUrl}</a></p>${
            checkoutUrl ? `<p>Pay: <a href="${checkoutUrl}">${checkoutUrl}</a></p>` : ''
          }`,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (data.id) delivered += 1;
      results.push(data.id ? `email: sent (${data.id})` : `email: ${data.error}`);
    } catch (err) {
      results.push(`email: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 3. Generic webhook (Slack-compatible or your own automation). This is the
  //    escape hatch for social publishing when no first-class connector key is
  //    present: Jarvis posts the real payload and records the real status.
  const webhook = process.env.JARVIS_ANNOUNCE_WEBHOOK_URL;
  if (webhook) {
    try {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `*${title}* is live! ${deployUrl}${checkoutUrl ? `\nPay: ${checkoutUrl}` : ''}`,
          projectId,
          title,
          deployUrl,
          checkoutUrl: checkoutUrl ?? null,
          source: 'jarvis',
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) delivered += 1;
      results.push(res.ok ? `webhook: ${res.status}` : `webhook: HTTP ${res.status}`);
    } catch (err) {
      results.push(`webhook: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // When no announce channels are keyed, record that so the operator sees it.
  const summary =
    results.length > 0
      ? `Announced in ${((Date.now() - started) / 1000).toFixed(1)}s — ${results.join('; ')}`
      : 'No announce channels configured (Slack/Resend/webhook keys missing).';

  return { ok: delivered > 0, summary };
}

/** Mint a Stripe checkout session and return its URL. */
export async function checkout({
  projectId,
  priceId,
  successUrl,
  cancelUrl,
  customerEmail,
}: {
  projectId: string;
  priceId: string;
  successUrl?: string;
  cancelUrl?: string;
  customerEmail?: string;
}): Promise<{ ok: boolean; summary: string; externalId?: string; checkoutUrl?: string }> {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return { ok: false, summary: 'STRIPE_SECRET_KEY not set — cannot create checkout.' };
  }

  const started = Date.now();
  try {
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? `http://localhost:${process.env.PORT ?? '4100'}`;
    const body: Record<string, unknown> = {
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl ?? `${site}/success`,
      cancel_url: cancelUrl ?? `${site}/cancel`,
      metadata: { projectId, source: 'jarvis', at: new Date().toISOString() },
    };
    if (customerEmail) body.customer_email = customerEmail;

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(body as Record<string, string>).toString(),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await res.json()) as { id?: string; url?: string; error?: unknown };
    if (!res.ok || !data.url) {
      return {
        ok: false,
        summary: `Stripe error: ${data.error ? JSON.stringify(data.error).slice(0, 300) : res.status}`,
      };
    }
    return {
      ok: true,
      summary: `Checkout session created in ${((Date.now() - started) / 1000).toFixed(1)}s`,
      externalId: data.id,
      checkoutUrl: data.url,
    };
  } catch (err) {
    return {
      ok: false,
      summary: `Checkout failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Change a Stripe price (high risk, always needs approval). */
export async function priceChange({
  projectId,
  priceId,
  newAmountCents,
}: {
  projectId: string;
  priceId: string;
  newAmountCents: number;
}): Promise<{ ok: boolean; summary: string; externalId?: string }> {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return { ok: false, summary: 'STRIPE_SECRET_KEY not set — cannot change price.' };
  }
  const started = Date.now();
  try {
    // Deactivate old price, create new one.
    const upd = await fetch(`https://api.stripe.com/v1/prices/${priceId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ active: 'false' }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!upd.ok) {
      return { ok: false, summary: `Could not deactivate price: ${upd.status}` };
    }
    const created = await fetch('https://api.stripe.com/v1/prices', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        currency: 'usd',
        unit_amount: String(newAmountCents),
        product_data: `name=Jarvis-${projectId} price`,
        metadata: `projectId=${projectId}&changedBy=jarvis&at=${new Date().toISOString()}`,
      } as Record<string, string>).toString(),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await created.json()) as { id?: string; error?: unknown };
    if (!created.ok || !data.id) {
      return { ok: false, summary: `Could not create price: ${created.status}` };
    }
    return {
      ok: true,
      summary: `Price changed to $${(newAmountCents / 100).toFixed(2)} in ${((Date.now() - started) / 1000).toFixed(1)}s`,
      externalId: data.id,
    };
  } catch (err) {
    return { ok: false, summary: `Price change failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Map a Jarvis action kind to its executor. */
export type ActionResult = {
  ok: boolean;
  summary: string;
  externalId?: string;
  checkoutUrl?: string;
};

export async function executeAction({
  kind,
  payload,
}: {
  kind: JarvisActionKind;
  payload: Record<string, unknown>;
}): Promise<ActionResult> {
  switch (kind) {
    case 'deploy':
      return deploy({
        projectId: String(payload.projectId ?? ''),
        hookUrl: String(payload.hookUrl ?? ''),
      });
    case 'announce':
      return announce({
        projectId: String(payload.projectId ?? ''),
        title: String(payload.title ?? 'Launch'),
        deployUrl: String(payload.deployUrl ?? ''),
        checkoutUrl: payload.checkoutUrl ? String(payload.checkoutUrl) : undefined,
      });
    case 'checkout':
      return checkout({
        projectId: String(payload.projectId ?? ''),
        priceId: String(payload.priceId ?? ''),
        successUrl: payload.successUrl ? String(payload.successUrl) : undefined,
        cancelUrl: payload.cancelUrl ? String(payload.cancelUrl) : undefined,
        customerEmail: payload.customerEmail ? String(payload.customerEmail) : undefined,
      });
    case 'price_change':
      return priceChange({
        projectId: String(payload.projectId ?? ''),
        priceId: String(payload.priceId ?? ''),
        newAmountCents: Number(payload.newAmountCents ?? 0),
      });
    case 'open_project':
    case 'open_editor':
    case 'read_file':
    case 'write_note':
    case 'list_folder':
    case 'git_status':
    case 'disk_space':
    case 'run_build':
      return executeLocal(kind as LocalActionKind, payload);
    default:
      return { ok: false, summary: `Unknown action kind: ${kind}` };
  }
}

/** Execute a governed local action (file system, git, build, etc.). */
async function executeLocal(
  kind: LocalActionKind,
  payload: Record<string, unknown>,
): Promise<ActionResult> {
  const req = buildRequest(kind, payload);
  const result = await executeLocalAction(kind, payload);

  // Audit the request + outcome.
  import('./audit').then((mod) =>
    mod.log({
      action: kind,
      requestId: req.id,
      title: req.title,
      risk: req.risk,
      needsApproval: req.needsApproval,
      ok: result.ok,
      summary: result.text.slice(0, 500),
    }),
  ).catch(() => {
    // audit must never throw
  });

  return {
    ok: result.ok,
    summary: result.text,
    externalId: result.requestId,
  };
}

/** Unique id for an action payload. */
export function actionId(): string {
  return `jarvis-action-${randomUUID()}`;
}
