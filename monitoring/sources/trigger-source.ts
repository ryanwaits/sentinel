/**
 * TriggerSource — the ONE seam where Sentinel touches secondlayer's chain-subscription surface.
 *
 * Chain-subscription provisioning is the single genuinely load-bearing secondlayer capability (the
 * monitoring product cannot trigger without it, and it's the one with a real — if today access-
 * blocked — alternative in Hiro Chainhook). So instead of `import { SecondLayer } from
 * "@secondlayer/sdk"` scattered across the provisioner + webhook bridge, every caller depends on
 * this interface. secondlayer is the DEFAULT (and currently only) implementation; the seam exists so
 * "powered-by-secondlayer" is a DELIBERATE, swappable choice — and so a redundant/fallback trigger
 * source (e.g. Chainhook) could slot in later without touching the reconciler or the bridge.
 *
 * Pure boundary: the SecondLayer client is constructed LAZILY (only when a mutating/listing call is
 * made), so the webhook bridge — which needs only `verifySignature` — does not require API creds.
 */
import { SecondLayer, trigger, verifyWebhookSignature } from "@secondlayer/sdk";

/** A subscription as it exists remotely (the fields the reconciler diffs on). */
export type RemoteSubscription = { id: string; name: string; url: string };

/** Result of creating a subscription — the signing secret is surfaced ONCE here. */
export type CreatedSubscription = { subId: string; signingSecret: string };

/** Synchronous test(id) outcome. `statusCode` is null when no response was received. */
export type TestResult = {
  ok: boolean;
  statusCode: number | null;
  error: string | null;
  durationMs: number;
};

/** One recent delivery attempt (the delivery-health signal). `statusCode` null = no response. */
export type DeliveryRecord = {
  id: string;
  attempt: number;
  statusCode: number | null;
  errorMessage: string | null;
};

/** Everything needed to create one chain `contract_call` subscription. */
export type CreateSubParams = {
  name: string;
  url: string;
  contractId: string;
  functionName: string;
};

/**
 * The chain-trigger provider contract. Default impl = secondlayer; a future Chainhook impl would
 * satisfy the same shape. `verifySignature` is part of the contract because each provider signs its
 * webhooks its own way (secondlayer = Standard Webhooks HMAC).
 */
export interface TriggerSource {
  /** Provider id — for honest logging ("secondlayer"), never hidden behind the seam. */
  readonly providerName: string;
  /** All subscriptions on the account (caller scopes by name prefix). */
  list(): Promise<RemoteSubscription[]>;
  /** Create a chain contract_call subscription; returns the once-only signing secret. */
  create(params: CreateSubParams): Promise<CreatedSubscription>;
  /** Re-point an existing subscription's delivery URL. */
  updateUrl(subId: string, url: string): Promise<void>;
  /** Delete a subscription. */
  remove(subId: string): Promise<void>;
  /** Send a signed test webhook to the registered URL. */
  test(subId: string): Promise<TestResult>;
  /** Recent delivery attempts for a subscription. */
  recentDeliveries(subId: string): Promise<DeliveryRecord[]>;
  /** Verify a webhook signature against the per-subscription secret. */
  verifySignature(raw: string, headers: Record<string, string>, secret: string): boolean;
}

/** secondlayer-backed TriggerSource. Client built lazily so verify-only callers need no creds. */
class SecondLayerTriggerSource implements TriggerSource {
  readonly providerName = "secondlayer";
  #client: SecondLayer | null = null;

  #c(): SecondLayer {
    if (this.#client) return this.#client;
    const baseUrl = process.env.SECONDLAYER_API_URL;
    const apiKey = process.env.SECONDLAYER_API_KEY;
    if (!baseUrl) throw new Error("SECONDLAYER_API_URL is required");
    if (!apiKey) throw new Error("SECONDLAYER_API_KEY is required");
    this.#client = new SecondLayer({ baseUrl, apiKey, origin: "session" });
    return this.#client;
  }

  async list(): Promise<RemoteSubscription[]> {
    const { data } = await this.#c().subscriptions.list();
    return data.map((s) => ({ id: s.id, name: s.name, url: s.url }));
  }

  async create(params: CreateSubParams): Promise<CreatedSubscription> {
    // Chain subscription: presence of `triggers` (no `subgraphName`) selects chain mode — there is
    // no `kind` field on CreateSubscriptionRequest in the published SDK.
    const res = await this.#c().subscriptions.create({
      name: params.name,
      url: params.url,
      format: "standard-webhooks",
      triggers: [
        trigger.contractCall({ contractId: params.contractId, functionName: params.functionName }),
      ],
    });
    return { subId: res.subscription.id, signingSecret: res.signingSecret };
  }

  async updateUrl(subId: string, url: string): Promise<void> {
    await this.#c().subscriptions.update(subId, { url });
  }

  async remove(subId: string): Promise<void> {
    await this.#c().subscriptions.delete(subId);
  }

  async test(subId: string): Promise<TestResult> {
    const r = await this.#c().subscriptions.test(subId);
    return { ok: r.ok, statusCode: r.statusCode, error: r.error ?? null, durationMs: r.durationMs };
  }

  async recentDeliveries(subId: string): Promise<DeliveryRecord[]> {
    const { data } = await this.#c().subscriptions.recentDeliveries(subId);
    return data.map((d) => ({
      id: d.id,
      attempt: d.attempt,
      statusCode: d.statusCode,
      errorMessage: d.errorMessage ?? null,
    }));
  }

  verifySignature(raw: string, headers: Record<string, string>, secret: string): boolean {
    return verifyWebhookSignature(raw, headers, secret);
  }
}

/** The default trigger source. Swap this single line to change provider. */
export function defaultTriggerSource(): TriggerSource {
  return new SecondLayerTriggerSource();
}

/**
 * Standalone signature verification for the webhook bridge (which needs ONLY this, no API creds).
 * Routes through the seam so secondlayer's verifier isn't imported directly in the bridge.
 */
export function verifySignature(
  raw: string,
  headers: Record<string, string>,
  secret: string,
): boolean {
  return verifyWebhookSignature(raw, headers, secret);
}
