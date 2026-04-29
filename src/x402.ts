import {
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  type Hex,
  type Address,
  type PublicClient,
  bytesToHex,
  createPublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { randomBytes } from "node:crypto";
import { GatefareError } from "./types.js";
import type { Config } from "./config.js";
import type { GatefareClient } from "./client.js";

const USDC_ADDRESS_BASE: Address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_ADDRESS_SEPOLIA: Address = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

/**
 * Single requirement entry inside the 402 response body's `accepts` array.
 * Matches what Gatefare's proxy sends (and the x402 v2 spec).
 *
 * `maxAmountRequired` is in the asset's smallest unit (micro-USDC = 1e-6 USDC).
 * `payTo` and `asset` are EVM addresses.
 */
export interface PaymentRequirement {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description?: string;
  payTo: Address;
  maxTimeoutSeconds?: number;
  asset?: Address;
  extra?: Record<string, unknown>;
}

export interface PaymentInfo {
  x402Version: number;
  accepts: PaymentRequirement[];
}

export interface SignedPayment {
  /** Base64-encoded JSON, ready to put in the `X-Payment` header. */
  xPaymentHeader: string;
  /** Human-readable USDC amount (e.g. "0.001"), for receipts and display. */
  amount: string;
  /** Raw amount in micro-USDC (matches `maxAmountRequired`). */
  amountMicro: string;
}

/**
 * Parse the 402 response body. Per x402 v2 the requirements live in the
 * JSON body under `accepts`, not in any header.
 */
export async function parsePaymentInfo(response: Response): Promise<PaymentInfo> {
  const ct = response.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    throw new GatefareError(
      "UPSTREAM_ERROR",
      `402 response is not JSON (content-type: ${ct || "none"})`,
    );
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new GatefareError("UPSTREAM_ERROR", "402 response body is not valid JSON");
  }

  const info = parsed as Partial<PaymentInfo>;
  if (!info.accepts || !Array.isArray(info.accepts) || info.accepts.length === 0) {
    throw new GatefareError(
      "UPSTREAM_ERROR",
      "402 response missing or empty `accepts` array",
    );
  }

  // Cap the array to a sane upper bound. A malicious/buggy gateway
  // returning 1M entries shouldn't be able to make us spin in `.find()`.
  const MAX_ACCEPTS = 100;
  if (info.accepts.length > MAX_ACCEPTS) {
    throw new GatefareError(
      "UPSTREAM_ERROR",
      `402 response has ${info.accepts.length} accepts entries (max ${MAX_ACCEPTS})`,
    );
  }

  return { x402Version: info.x402Version ?? 2, accepts: info.accepts };
}

/**
 * Pick the payment requirement that matches the configured wallet network.
 * Throws if there is no exact match — we never fall back to a different
 * network. Falling back would let a malicious gateway return a Sepolia
 * requirement to a user on mainnet, sign a Sepolia-valid sig, and route
 * test USDC to attacker (or — worse if domains were ever shared — drain
 * mainnet funds). The user picks the network in their env; we only sign
 * for that network.
 */
export function selectPaymentRequirement(
  requirements: PaymentRequirement[],
  network: string,
): PaymentRequirement {
  const match = requirements.find(
    (r) => r.network === network && r.scheme === "exact",
  );
  if (match) return match;

  throw new GatefareError(
    "UPSTREAM_ERROR",
    `No payment requirement matches the configured network ${network}. ` +
      `Server offered: ${requirements.map((r) => `${r.scheme}/${r.network}`).join(", ")}`,
  );
}

function getUsdcAddress(network: string): Address {
  return network === "eip155:84532" ? USDC_ADDRESS_SEPOLIA : USDC_ADDRESS_BASE;
}

function getChain(network: string) {
  return network === "eip155:84532" ? baseSepolia : base;
}

/**
 * USDC's EIP-712 domain name varies by deployment. Mainnet Circle USDC
 * uses "USD Coin"; Sepolia Circle USDC uses "USDC". Wrong name → wrong
 * domain separator → invalid signature.
 */
function getUsdcDomainName(network: string): string {
  return network === "eip155:84532" ? "USDC" : "USD Coin";
}

/**
 * Sign an EIP-3009 `transferWithAuthorization` and produce a base64-encoded
 * x402 v2 X-Payment header.
 *
 * Header shape (matches Gatefare's `payment-header.ts` parser):
 *   {
 *     x402Version: 2,
 *     scheme: "exact",
 *     network: "eip155:8453",
 *     payload: {
 *       signature: "0x...",
 *       authorization: { from, to, value, validAfter, validBefore, nonce }
 *     }
 *   }
 */
export async function signPayment(
  config: Config,
  requirement: PaymentRequirement,
): Promise<SignedPayment> {
  if (!config.walletPrivateKey) {
    throw new GatefareError(
      "WALLET_NOT_CONFIGURED",
      "WALLET_PRIVATE_KEY is required for paid API calls",
    );
  }

  const account = privateKeyToAccount(config.walletPrivateKey as Hex);
  const chain = getChain(config.walletNetwork);
  const usdcAddress = getUsdcAddress(config.walletNetwork);

  // `maxAmountRequired` is in micro-USDC already (the smallest unit).
  // Gatefare emits e.g. "10000" for $0.01.
  const amountMicro = BigInt(requirement.maxAmountRequired);
  if (amountMicro <= 0n) {
    throw new GatefareError(
      "UPSTREAM_ERROR",
      `Invalid maxAmountRequired in 402 response: ${requirement.maxAmountRequired}`,
    );
  }

  const validAfter = 0n;
  // Cap the validity window. A malicious gateway could request a huge
  // window to weaken replay protection; clamp to 1 hour.
  const MAX_TIMEOUT_SECONDS = 3600;
  const requestedTimeout = requirement.maxTimeoutSeconds ?? 60;
  const clampedTimeout = Math.min(
    Math.max(1, requestedTimeout),
    MAX_TIMEOUT_SECONDS,
  );
  const validBefore =
    BigInt(Math.floor(Date.now() / 1000)) + BigInt(clampedTimeout);

  // Cryptographically random bytes32 nonce. Predictable nonces (e.g.
  // Date.now()) collide under concurrent calls and weaken replay defense.
  const nonce = bytesToHex(randomBytes(32));

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(),
  });

  const domain = {
    name: getUsdcDomainName(config.walletNetwork),
    version: "2",
    chainId: chain.id,
    verifyingContract: usdcAddress,
  };

  const message = {
    from: account.address,
    to: requirement.payTo,
    value: amountMicro,
    validAfter,
    validBefore,
    nonce: nonce as Hex,
  };

  const signature = await walletClient.signTypedData({
    domain,
    types: EIP3009_TYPES,
    primaryType: "TransferWithAuthorization",
    message,
  });

  const headerObject = {
    x402Version: 2,
    scheme: "exact",
    network: requirement.network,
    payload: {
      signature,
      authorization: {
        from: account.address,
        to: requirement.payTo,
        value: amountMicro.toString(),
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce,
      },
    },
  };

  const xPaymentHeader = Buffer.from(
    JSON.stringify(headerObject),
    "utf-8",
  ).toString("base64");

  const amountHuman = formatUnits(amountMicro, 6);

  return {
    xPaymentHeader,
    amount: amountHuman,
    amountMicro: amountMicro.toString(),
  };
}

export interface PaymentFlowResult {
  response: Response;
  payment: { paid: boolean; amount: string; receiptHeader?: string };
}

export async function executePaymentFlow(
  config: Config,
  client: GatefareClient,
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    maxPriceUsd?: number;
  } = {},
): Promise<PaymentFlowResult> {
  const initialResponse = await client.requestRaw(url, {
    method: options.method,
    headers: options.headers,
    body: options.body,
  });

  if (initialResponse.status !== 402) {
    return {
      response: initialResponse,
      payment: { paid: false, amount: "0" },
    };
  }

  const info = await parsePaymentInfo(initialResponse);
  const requirement = selectPaymentRequirement(info.accepts, config.walletNetwork);

  // maxAmountRequired is in micro-USDC; convert to human USD for comparison.
  const priceUsd = parseFloat(formatUnits(BigInt(requirement.maxAmountRequired), 6));
  if (
    options.maxPriceUsd !== undefined &&
    options.maxPriceUsd > 0 &&
    priceUsd > options.maxPriceUsd
  ) {
    throw new GatefareError(
      "PRICE_TOO_HIGH",
      `API price $${priceUsd} exceeds max_price $${options.maxPriceUsd}`,
    );
  }

  const signed = await signPayment(config, requirement);

  const paidResponse = await client.requestRaw(url, {
    method: options.method,
    headers: {
      ...options.headers,
      "X-Payment": signed.xPaymentHeader,
    },
    body: options.body,
  });

  if (paidResponse.status === 402) {
    // Server rejected our payment — surface a descriptive error.
    let serverMsg = "";
    try {
      const errBody = await paidResponse.clone().json();
      serverMsg = JSON.stringify(errBody);
    } catch {
      serverMsg = await paidResponse.clone().text().catch(() => "");
    }
    throw new GatefareError(
      "UPSTREAM_ERROR",
      `Payment was rejected by the gateway: ${serverMsg.slice(0, 200)}`,
    );
  }

  return {
    response: paidResponse,
    payment: {
      paid: true,
      amount: `${signed.amount} USDC`,
      receiptHeader: paidResponse.headers.get("X-Payment-Receipt") ?? undefined,
    },
  };
}

// Cache one viem client per network — creating a new transport on every
// balance check (or every call_api) leaks file descriptors / event loop
// resources under load and adds noticeable latency. Different chains
// produce different narrowed types from createPublicClient, so we
// widen to `PublicClient` for the cache.
const publicClientCache = new Map<string, PublicClient>();

function getPublicClient(network: string): PublicClient {
  const cached = publicClientCache.get(network);
  if (cached) return cached;
  const fresh = createPublicClient({
    chain: getChain(network),
    transport: http(),
  }) as unknown as PublicClient;
  publicClientCache.set(network, fresh);
  return fresh;
}

// Test hook — clears caches so test runs don't share state.
export function _resetX402Caches(): void {
  publicClientCache.clear();
}

export async function getWalletBalance(
  config: Config,
): Promise<{ address: string; usdc: string; eth: string }> {
  if (!config.walletPrivateKey) {
    throw new GatefareError(
      "WALLET_NOT_CONFIGURED",
      "WALLET_PRIVATE_KEY is required",
    );
  }

  const account = privateKeyToAccount(config.walletPrivateKey as Hex);
  const usdcAddress = getUsdcAddress(config.walletNetwork);
  const publicClient = getPublicClient(config.walletNetwork);

  const [ethBalance, usdcBalance] = await Promise.all([
    publicClient.getBalance({ address: account.address }),
    publicClient.readContract({
      address: usdcAddress,
      abi: [
        {
          name: "balanceOf",
          type: "function",
          stateMutability: "view",
          inputs: [{ name: "account", type: "address" }],
          outputs: [{ name: "", type: "uint256" }],
        },
      ] as const,
      functionName: "balanceOf",
      args: [account.address],
    }),
  ]);

  const { formatEther } = await import("viem");

  return {
    address: account.address,
    usdc: formatUnits(usdcBalance as bigint, 6),
    eth: formatEther(ethBalance),
  };
}

// Helper for tests: parse our own header back to the structured payload.
export function decodeXPaymentHeader(header: string): unknown {
  const decoded = Buffer.from(header, "base64").toString("utf-8");
  return JSON.parse(decoded);
}

// Re-export the parseUnits helper used elsewhere
export { parseUnits };
