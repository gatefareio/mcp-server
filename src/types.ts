export interface ApiSummary {
  slug: string;
  handle: string;
  urlName: string;
  name: string;
  description: string;
  price: string;
  network: string;
  proxyUrl: string;
  splitAddress: string;
  iconUrl: string | null;
  categories: string[];
  tags: string[];
  requests: number;
  sampleResponse?: string;
  publisher: PublisherSummary;
}

export interface PublisherSummary {
  handle: string;
  displayName: string | null;
  since: string;
  apisPublished: number;
  avgRating?: number;
}

export interface ApiDetail extends ApiSummary {
  uptime?: number;
  recent7d: {
    requests: number;
    revenue: number;
  };
  publisher: PublisherSummary & {
    bio?: string;
    twitter?: string;
    github?: string;
    website?: string;
  };
}

export interface Category {
  slug: string;
  name: string;
  apiCount: number;
}

export interface WalletBalance {
  address: string;
  network: string;
  balances: {
    usdc: string;
    eth: string;
  };
  remainingBudget?: string;
}

export interface PaymentResult {
  paid: boolean;
  amount: string;
  txHash?: string;
  receiptHeader?: string;
}

export interface CallApiResult {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  payment: PaymentResult;
}

export interface RegisterApiInput {
  urlName: string;
  name: string;
  targetUrl: string;
  price: string;
  ownerWallet: string;
  network?: "eip155:8453" | "eip155:84532";
  description?: string;
  categories?: string[];
  tags?: string[];
  headers?: Record<string, string>;
  sampleResponse?: string;
  walletSignature?: string;
}

export interface RegisterApiResult {
  id: number;
  urlName: string;
  handle: string;
  proxyUrl: string;
  legacyProxyUrl: string;
  splitAddress: string;
  apiKey: string;
}

export interface RevenueData {
  slug: string;
  days: number;
  total: number;
  currency: string;
  timeSeries: Array<{
    date: string;
    revenue: number;
    requests: number;
  }>;
}

export interface DistributeResult {
  txHash: string;
  distributed: number;
  network: string;
}

export interface AbuseReport {
  referenceId: string;
}

export type ErrorCode =
  | "WALLET_NOT_CONFIGURED"
  | "PAT_NOT_CONFIGURED"
  | "INVALID_INPUT"
  | "BUDGET_EXHAUSTED"
  | "INSUFFICIENT_BALANCE"
  | "PRICE_TOO_HIGH"
  | "API_NOT_FOUND"
  | "UPSTREAM_ERROR"
  | "RATE_LIMITED"
  | "NETWORK_ERROR"
  | "GATEFARE_API_ERROR";

export class GatefareError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "GatefareError";
  }
}
