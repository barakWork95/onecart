import type { PushSubscriptionKeys } from "@/domain/notifications/push";
import type { CronJob, CronJobHistory, CronRun } from "@/domain/ops/cron-run";
import type { OpsIssue } from "@/domain/ops/issues";

/** Where cron runs are recorded for the status page and alerts. */
export interface OpsStore {
  recordRun(run: CronRun): Promise<void>;
  history(): Promise<Readonly<Partial<Record<CronJob, CronJobHistory>>>>;
}

/** Ops alert state: the issues already alerted, and the admin browsers to alert. */
export interface OpsAlertState {
  activeIssues(): Promise<readonly OpsIssue[]>;
  saveActiveIssues(issues: readonly OpsIssue[]): Promise<void>;
  targets(): Promise<readonly PushSubscriptionKeys[]>;
  addTarget(subscription: PushSubscriptionKeys): Promise<void>;
  removeTarget(endpoint: string): Promise<void>;
}
