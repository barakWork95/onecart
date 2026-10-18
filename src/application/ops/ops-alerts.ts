import { currentIssues, diffIssues, type OpsIssue } from "@/domain/ops/issues";
import type { OpsAlertState, OpsStore } from "@/domain/ops/ports";
import type { QuotaSource } from "@/domain/ops/status";
import type { PushMessage, PushSender } from "@/domain/notifications/push";
import { noopLogger, type Logger } from "@/domain/shared/logger";
import { readQuotas } from "@/application/ops/status-report";

export interface OpsAlertsDeps {
  readonly ops: OpsStore;
  readonly quotas: readonly QuotaSource[];
  readonly state: OpsAlertState;
  /** Null when Web Push isn't configured: issues are still tracked. */
  readonly sender: PushSender | null;
  readonly now?: () => Date;
  readonly logger?: Logger;
}

export interface OpsAlertRun {
  readonly issues: number;
  readonly raised: readonly string[];
  readonly resolved: readonly string[];
  /** Admin browsers that accepted the alert. */
  readonly delivered: number;
}

/** Notification banners show a couple of lines. */
const MAX_BODY = 180;

export function opsAlertMessage(
  raised: readonly OpsIssue[],
  resolved: readonly OpsIssue[],
  at: Date,
): PushMessage {
  const lines = [...raised.map((i) => `⚠ ${i.message}`), ...resolved.map((i) => `✓ Recovered: ${i.message}`)];
  const body = lines.join("\n");
  return {
    title:
      raised.length > 0
        ? `OneCart: ${raised.length} new problem${raised.length === 1 ? "" : "s"}`
        : "OneCart: back to normal",
    body: body.length > MAX_BODY ? `${body.slice(0, MAX_BODY - 1)}…` : body,
    url: "/internal/status",
    // Unique per alert: each one shows its own banner.
    tag: `ops-${at.getTime()}`,
  };
}

/**
 * After a cron run: compares what's wrong now (failing or missed runs, quotas
 * at zero) with what was already alerted, and pushes the difference to the
 * admin browsers. Each issue alerts once, then once more when it clears. If
 * every push failed, nothing is marked as alerted, so the next run retries.
 */
export function createCheckOpsAlerts(deps: OpsAlertsDeps) {
  const now = deps.now ?? (() => new Date());
  const logger = deps.logger ?? noopLogger;

  return async function checkOpsAlerts(): Promise<OpsAlertRun> {
    const at = now();
    const [history, quotas, previous] = await Promise.all([
      deps.ops.history(),
      readQuotas(deps.quotas),
      deps.state.activeIssues(),
    ]);
    const current = currentIssues(history, quotas, at.getTime());
    const { raised, resolved } = diffIssues(previous, current);
    const summary = {
      issues: current.length,
      raised: raised.map((i) => i.key),
      resolved: resolved.map((i) => i.key),
    };
    if (raised.length === 0 && resolved.length === 0) return { ...summary, delivered: 0 };

    const targets = deps.sender ? await deps.state.targets() : [];
    let delivered = 0;
    if (deps.sender && targets.length > 0) {
      const message = opsAlertMessage(raised, resolved, at);
      for (const target of targets) {
        const { result } = await deps.sender.send(target, message);
        if (result === "sent") delivered++;
        else if (result === "expired") await deps.state.removeTarget(target.endpoint);
      }
      if (delivered === 0) {
        logger.warn("ops: no admin browser accepted the alert; retrying next run", {
          raised: summary.raised,
        });
        return { ...summary, delivered };
      }
    }
    await deps.state.saveActiveIssues(current);
    return { ...summary, delivered };
  };
}
