export interface Config {
  baseUrl: string;
  walletPrivateKey: string | null;
  walletBudgetUsd: number | null;
  walletNetwork: string;
  pat: string | null;
  logLevel: "debug" | "info" | "warn" | "error";
}

export interface Capabilities {
  discovery: true;
  buyer: boolean;
  publisher: boolean;
}

export function parseConfig(env: Record<string, string | undefined>): Config {
  const logLevel = env["LOG_LEVEL"];
  const validLogLevels = ["debug", "info", "warn", "error"] as const;

  let privateKey = env["WALLET_PRIVATE_KEY"] ?? null;
  if (privateKey !== null) {
    privateKey = privateKey.trim();
    if (privateKey && !privateKey.startsWith("0x")) {
      privateKey = `0x${privateKey}`;
    }
    if (privateKey && !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
      throw new Error(
        "WALLET_PRIVATE_KEY must be a 32-byte hex string (with or without 0x prefix)",
      );
    }
    if (!privateKey) privateKey = null;
  }

  let budgetUsd: number | null = null;
  const budgetRaw = env["WALLET_BUDGET_USD"];
  if (budgetRaw !== undefined) {
    budgetUsd = parseFloat(budgetRaw);
    if (isNaN(budgetUsd) || budgetUsd < 0) {
      throw new Error("WALLET_BUDGET_USD must be a non-negative number");
    }
  }

  let pat = env["GATEFARE_PAT"] ?? null;
  if (pat !== null) {
    pat = pat.trim();
    if (pat && !pat.startsWith("gfpat_")) {
      throw new Error("GATEFARE_PAT must start with 'gfpat_'");
    }
    if (!pat) pat = null;
  }

  const network = env["WALLET_NETWORK"] ?? "eip155:8453";
  if (network !== "eip155:8453" && network !== "eip155:84532") {
    throw new Error(
      "WALLET_NETWORK must be 'eip155:8453' (mainnet) or 'eip155:84532' (sepolia)",
    );
  }

  return {
    baseUrl: (env["GATEFARE_BASE_URL"] ?? "https://gatefare.io").replace(
      /\/$/,
      "",
    ),
    walletPrivateKey: privateKey,
    walletBudgetUsd: budgetUsd,
    walletNetwork: network,
    pat,
    logLevel:
      logLevel && validLogLevels.includes(logLevel as (typeof validLogLevels)[number])
        ? (logLevel as Config["logLevel"])
        : "info",
  };
}

export function detectCapabilities(config: Config): Capabilities {
  return {
    discovery: true,
    buyer: config.walletPrivateKey !== null,
    publisher: config.pat !== null,
  };
}
