/**
 * Jarvis autonomy policy.
 *
 * A solo founder delegates with guardrails. This module decides:
 *  - what Jarvis may do without asking (low risk, autonomy = 'autopilot'),
 *  - what always needs an explicit yes (high risk or money touching),
 *  - the kill switch that halts everything,
 *  - the spending cap per run.
 *
 * Nothing here talks to the network. Pure rules on names, env flags, and the
 * project's autonomy setting, so it is cheap to test and cheap to audit.
 */

import type { JarvisAutonomy, JarvisActionKind, JarvisActionStatus } from '@/lib/schemas';

/** Read once per process; exported so tests and UI can read it without booting DB. */
export const KILL_SWITCH = process.env.JARVIS_KILL_SWITCH === '1';

/**
 * The UI kill switch is persisted in `jarvis_settings.killSwitchIntent`
 * because env cannot be changed at runtime. The env var still wins: either
 * source being on halts Jarvis. This is what makes the button real rather
 * than a label that only records intent.
 */
export function killSwitchActive(intent: string | null | undefined): boolean {
  return KILL_SWITCH || intent === 'on';
}

/** Max a single checkout/price action may charge before a human must say yes. */
export const SPEND_CAP_CENTS = Number(process.env.JARVIS_SPEND_CAP_CENTS ?? 5000);

/** Which autonomy levels may act without an approval for each action kind. */
const AUTO_OK: Record<JarvisActionKind, JarvisAutonomy[]> = {
  // Assisted means "propose, then wait". Only autopilot acts unattended on
  // external side effects. Read-only local queries stay available in assisted.
  deploy: ['autopilot'],
  announce: ['autopilot'],
  checkout: ['autopilot'],
  price_change: ['autopilot'],
  open_project: ['autopilot', 'assisted'],
  open_editor: ['autopilot', 'assisted'],
  read_file: ['autopilot', 'assisted'],
  write_note: ['autopilot'],
  list_folder: ['autopilot', 'assisted'],
  git_status: ['autopilot', 'assisted'],
  disk_space: ['autopilot', 'assisted'],
  run_build: ['autopilot'],
};

/** Jarvis may never charge more than this without a human decision. */
const MONEY_ACTIONS: JarvisActionKind[] = ['checkout', 'price_change'];

/** A deployment must be green before Jarvis will announce or sell. */
export function deployMustBeGreen(health: string): boolean {
  return health === 'green';
}

/**
 * Thrown when a request fails validation — nothing executes.
 * Mirrors JARI's ActionRefused: an assistant, not a remote shell.
 */
export class ActionRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActionRefused';
  }
}

/**
 * Does this action require an explicit human approval before executing?
 *
 * - Kill switch on → everything needs you (status pending).
 * - High risk → always.
 * - Money touching → always (no matter autonomy level).
 * - Otherwise follow `autonomy`: 'autopilot' skips approval for low risk;
 *   'assisted'/'observe' always ask.
 */
export function needsApproval({
  autonomy,
  kind,
  risk,
  amountCents,
}: {
  autonomy: JarvisAutonomy;
  kind: JarvisActionKind;
  risk: 'low' | 'medium' | 'high';
  amountCents?: number;
}): boolean {
  if (KILL_SWITCH) return true;
  if (risk === 'high') return true;
  if (MONEY_ACTIONS.includes(kind)) return true;
  if (amountCents != null && amountCents > SPEND_CAP_CENTS) return true;
  return !AUTO_OK[kind].includes(autonomy);
}

/**
 * Result of a policy check before Jarvis executes.
 */
export type PolicyVerdict = {
  ok: boolean;
  /** Why Jarvis won't do it without you. */
  blocker?: string;
  /** Suggested action status when the operator must decide. */
  status?: JarvisActionStatus;
  /** Human-readable one-liner for the UI. */
  message: string;
};

/**
 * Pre-flight verdict for one action. Use this before persisting an action.
 */
export function verdictFor({
  autonomy,
  kind,
  risk,
  amountCents,
  health,
  stage,
}: {
  autonomy: JarvisAutonomy;
  kind: JarvisActionKind;
  risk: 'low' | 'medium' | 'high';
  amountCents?: number;
  health?: string;
  stage?: string;
}): PolicyVerdict {
  if (KILL_SWITCH) {
    return {
      ok: false,
      blocker: 'kill-switch',
      status: 'pending',
      message: 'Jarvis is paused by the kill switch (JARVIS_KILL_SWITCH=1). Flip it off to resume.',
    };
  }
  if (kind === 'deploy' && health !== 'green' && stage !== 'watch') {
    return {
      ok: false,
      blocker: 'deploy-not-green',
      status: 'pending',
      message: `Deployment is ${health ?? 'unknown'} — Jarvis won't ship until it turns green.`,
    };
  }
  if (MONEY_ACTIONS.includes(kind)) {
    return {
      ok: false,
      blocker: 'money',
      status: 'pending',
      message: `${kind} touches money — needs your yes before Jarvis executes.`,
    };
  }
  if (risk === 'high') {
    return {
      ok: false,
      blocker: 'high-risk',
      status: 'pending',
      message: `${kind} is high risk — needs your yes before Jarvis executes.`,
    };
  }
  const auto = AUTO_OK[kind].includes(autonomy);
  if (!auto) {
    return {
      ok: false,
      blocker: 'autonomy',
      status: 'pending',
      message: `Autonomy is "${autonomy}" — Jarvis asks before ${kind}. Set autonomy to "autopilot" to delegate this.`,
    };
  }
  return { ok: true, message: 'Cleared by policy.' };
}

/** One-liner describing what autonomy means, for the settings page. */
export function autonomyLabel(a: JarvisAutonomy): string {
  switch (a) {
    case 'observe':
      return 'Observe only — Jarvis watches, never acts.';
    case 'assisted':
      return 'Assisted — Jarvis proposes, you decide.';
    case 'autopilot':
      return 'Autopilot — Jarvis acts on low-risk items, asks on money/high-risk.';
  }
}
