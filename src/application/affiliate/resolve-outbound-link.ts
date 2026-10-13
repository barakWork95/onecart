import { parseAllowedStoreUrl } from "@/domain/affiliate/store-hosts";
import type {
  AffiliateLinkBuilder,
  ClickRecorder,
  OutboundClick,
  OutboundLinkCodec,
} from "@/domain/affiliate/ports";
import { noopLogger, type Logger } from "@/domain/shared/logger";
import type { ProviderId } from "@/domain/shared/provider";
import { err, ok, type Result } from "@/domain/shared/result";

export type OutboundLinkError =
  /** Unsigned, tampered, or malformed — someone edited the link. */
  | "invalid_link"
  /** Signed by us, but the destination is no longer allowlisted (or tagging moved it off-host). */
  | "disallowed_destination";

export interface ResolvedOutboundLink {
  readonly location: string;
  readonly provider: ProviderId;
  readonly affiliated: boolean;
}

export interface ResolveOutboundLinkDeps {
  readonly codec: OutboundLinkCodec;
  readonly affiliate: AffiliateLinkBuilder;
  readonly clicks: ClickRecorder;
  /**
   * Runs click recording after the response is sent (Next's `after()`), so a
   * slow or failing analytics write never delays the redirect. Without it the
   * click is recorded inline.
   */
  readonly defer?: (task: () => Promise<void>) => void;
  readonly now?: () => Date;
  readonly logger?: Logger;
}

/**
 * The /go/[id] decision: verify the signature, check the destination against
 * the store's host allowlist, add affiliate tags, check again, record the click.
 * There is no path from user input to a redirect that skips any step.
 */
export function createResolveOutboundLink(deps: ResolveOutboundLinkDeps) {
  const now = deps.now ?? (() => new Date());
  const logger = deps.logger ?? noopLogger;

  async function record(click: OutboundClick): Promise<void> {
    try {
      await deps.clicks.record(click);
    } catch (error) {
      logger.warn("go: click recording failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return async function resolveOutboundLink(
    id: string,
    params: Readonly<Record<string, string | undefined>>,
  ): Promise<Result<ResolvedOutboundLink, OutboundLinkError>> {
    const target = deps.codec.decode(id, params);
    if (!target) return err("invalid_link");

    const clean = parseAllowedStoreUrl(target.provider, target.url);
    if (!clean) {
      logger.warn("go: signed link points outside the store allowlist", { id, provider: target.provider });
      return err("disallowed_destination");
    }

    const tagged = await deps.affiliate.build(target.provider, clean);
    // Defense in depth: a buggy builder must not be able to change the destination host.
    const final = parseAllowedStoreUrl(target.provider, tagged.url.toString());
    if (!final) {
      logger.warn("go: affiliate builder produced a disallowed URL", { id, provider: target.provider });
      return err("disallowed_destination");
    }

    const click: OutboundClick = {
      productId: id,
      provider: target.provider,
      affiliated: tagged.affiliated,
      at: now().toISOString(),
    };
    if (deps.defer) deps.defer(() => record(click));
    else await record(click);

    return ok({ location: final.toString(), provider: target.provider, affiliated: tagged.affiliated });
  };
}
