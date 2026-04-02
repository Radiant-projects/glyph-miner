/**
 * dMint Contracts API Client
 * 
 * Fetches mineable dMint contracts from RXinDexer via Electrum protocol.
 * Uses dmint.get_contracts v2 request/response contract and maps to
 * local ExtendedContract shape for existing UI consumers.
 */

import { client } from "./client";

let getContractSupported: boolean | null = null;
let getContractsSupported: boolean | null = null;
let warnedGetContractUnsupported = false;
let warnedGetContractsUnsupported = false;
const extendedContractsCache = new Map<string, ExtendedContract>();

function normalizeRef(ref: string): string {
  return ref.toLowerCase().replace(/[^0-9a-f]/g, "");
}

function isUnsupportedMethodError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("unknown method") || m.includes("not supported") || m.includes("method not found");
}

function indexExtendedContracts(contracts: ExtendedContract[]): void {
  extendedContractsCache.clear();
  for (const c of contracts) {
    extendedContractsCache.set(normalizeRef(c.ref), c);
  }
}

function getFromExtendedCache(ref: string): ExtendedContract | null {
  return extendedContractsCache.get(normalizeRef(ref)) ?? null;
}

// Extended contract info from RXinDexer
export interface ExtendedContract {
  ref: string;
  outputs: number;
  ticker?: string;
  name?: string;
  algorithm: number;
  difficulty: number;
  reward: number;
  percent_mined: number;
  active: boolean;
  deploy_height: number;
  daa_mode?: number;
  daa_mode_name?: string;
  icon_type?: string;
  icon_data?: string;
  icon_url?: string;
  total_supply?: number;
  mined_supply?: number;
}

export interface DmintV2TokenSummaryItem {
  token_ref: string;
  ticker?: string;
  name?: string;
  algorithm: { id: number; name?: string };
  daa_mode?: { id: number; name?: string };
  contracts?: {
    total?: number;
    mineable_remaining?: number | null;
    fully_mined?: number | null;
  };
  supply?: {
    total?: string;
    minted?: string;
    remaining?: string;
    unit?: string;
  };
  reward_per_mint?: string;
  target?: string;
  percent_mined?: number;
  deploy_height?: number;
  active?: boolean;
  is_fully_mined?: boolean;
  icon?: {
    type?: string | null;
    url?: string | null;
    data_hex?: string | null;
  };
}

export interface DmintV2ContractsRequest {
  version: 2;
  view: "token_summary";
  filters?: {
    status?: "mineable" | "finished" | "all";
    algorithm_ids?: number[];
  };
  sort?: {
    field?: "deploy_height" | "ticker" | "reward_per_mint" | "percent_mined" | "mineable_contracts_remaining" | "total_contracts";
    dir?: "asc" | "desc";
  };
  pagination?: {
    limit?: number;
    cursor?: string | null;
  };
}

export interface DmintV2ContractsResponse {
  version: 2;
  view: "token_summary";
  schema: string;
  generated_at: string;
  indexed_height: number;
  cursor_next?: string | null;
  count: number;
  total_estimate: number;
  items: DmintV2TokenSummaryItem[];
}

export interface ExtendedContractsResponse {
  version: number;
  updated_at: string;
  updated_height: number;
  count: number;
  contracts: ExtendedContract[];
}

function parseIntString(value: string | undefined): number {
  if (!value) return 0;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

function mapV2ItemToExtended(item: DmintV2TokenSummaryItem): ExtendedContract {
  const totalSupply = parseIntString(item.supply?.total);
  const minedSupply = parseIntString(item.supply?.minted);
  const percentMined =
    typeof item.percent_mined === "number"
      ? item.percent_mined
      : totalSupply > 0
        ? (minedSupply / totalSupply) * 100
        : 0;

  return {
    ref: item.token_ref,
    outputs: item.contracts?.total ?? 0,
    ticker: item.ticker,
    name: item.name,
    algorithm: item.algorithm?.id ?? 0,
    difficulty: parseIntString(item.target),
    reward: parseIntString(item.reward_per_mint),
    percent_mined: percentMined,
    active: item.active ?? !item.is_fully_mined,
    deploy_height: item.deploy_height ?? 0,
    daa_mode: item.daa_mode?.id ?? 0,
    daa_mode_name: item.daa_mode?.name,
    icon_type: item.icon?.type ?? undefined,
    icon_data: item.icon?.data_hex ?? undefined,
    icon_url: item.icon?.url ?? undefined,
    total_supply: totalSupply,
    mined_supply: minedSupply,
  };
}

function toExtendedResponse(result: unknown): ExtendedContractsResponse | null {
  if (!result || typeof result !== "object") {
    return null;
  }

  const candidate = result as Record<string, unknown>;

  if (Array.isArray(candidate.contracts)) {
    return candidate as unknown as ExtendedContractsResponse;
  }

  if (Array.isArray(candidate.items)) {
    const v2 = candidate as unknown as DmintV2ContractsResponse;
    return {
      version: 2,
      updated_at: v2.generated_at,
      updated_height: v2.indexed_height,
      count: v2.count,
      contracts: v2.items.map(mapV2ItemToExtended),
    };
  }

  return null;
}

// Algorithm IDs aligned with Glyph dMint v2
export const DMINT_ALGORITHM = {
  SHA256D: 0x00,
  BLAKE3: 0x01,
  K12: 0x02,
} as const;

/**
 * Fetch contracts in simple tuple format: [[ref, outputs], ...]
 * Derived from dmint.get_contracts v2 token summary response.
 */
export async function fetchContractsSimple(): Promise<[string, number][]> {
  try {
    const request: DmintV2ContractsRequest = {
      version: 2,
      view: "token_summary",
      filters: { status: "all" },
      pagination: { limit: 5000 },
    };
    const result = await client.request("dmint.get_contracts", request as unknown as string);
    
    // Handle error response
    if (result && typeof result === 'object' && 'error' in result) {
      console.warn("dMint API error:", (result as { error: string }).error);
      return [];
    }
    
    const response = toExtendedResponse(result);
    if (!response?.contracts?.length) {
      return [];
    }

    return response.contracts.map((c) => [c.ref, c.outputs]);
  } catch (error) {
    console.warn("Failed to fetch contracts from API:", error);
    return [];
  }
}

/**
 * Fetch contracts in extended format with full metadata.
 */
export async function fetchContractsExtended(): Promise<ExtendedContractsResponse | null> {
  if (getContractsSupported === false) {
    return null;
  }

  try {
    const request: DmintV2ContractsRequest = {
      version: 2,
      view: "token_summary",
      filters: { status: "mineable" },
      sort: { field: "deploy_height", dir: "desc" },
      pagination: { limit: 5000 },
    };

    const result = await client.request("dmint.get_contracts", request as unknown as string);
    
    // Handle error response
    if (result && typeof result === 'object' && 'error' in result) {
      const error = (result as { error: string }).error;
      if (isUnsupportedMethodError(error)) {
        getContractsSupported = false;
        if (!warnedGetContractsUnsupported) {
          console.warn("dmint.get_contracts unsupported; extended RPC fallback disabled");
          warnedGetContractsUnsupported = true;
        }
        return null;
      }

      getContractsSupported = true;
      console.warn("dMint API error:", error);
      return null;
    }

    const response = toExtendedResponse(result);
    if (!response) {
      console.warn("dMint API returned unexpected contracts response shape");
      return null;
    }
    getContractsSupported = true;
    if (Array.isArray(response.contracts)) {
      indexExtendedContracts(response.contracts);
    }

    return response;
  } catch (error) {
    const message = String((error as Error)?.message || error || "");
    if (isUnsupportedMethodError(message)) {
      getContractsSupported = false;
      if (!warnedGetContractsUnsupported) {
        console.warn("dmint.get_contracts unsupported; extended RPC fallback disabled");
        warnedGetContractsUnsupported = true;
      }
      return null;
    }

    getContractsSupported = true;
    console.warn("Failed to fetch extended contracts from API:", error);
    return null;
  }
}

/**
 * Fetch a single contract by ref.
 */
export async function fetchContract(ref: string): Promise<ExtendedContract | null> {
  // If we've already detected dmint.get_contract is unsupported on this server,
  // resolve from extended contracts cache and avoid repeat RPC errors.
  if (getContractSupported === false) {
    const cached = getFromExtendedCache(ref);
    if (cached) {
      return cached;
    }

    const extended = await fetchContractsExtended();
    if (extended?.contracts?.length) {
      return getFromExtendedCache(ref);
    }

    return null;
  }

  try {
    const result = await client.request("dmint.get_contract", ref);

    if (result && typeof result === 'object' && 'error' in result) {
      const error = (result as { error: string }).error;
      if (isUnsupportedMethodError(error)) {
        getContractSupported = false;
        if (!warnedGetContractUnsupported) {
          console.warn("dmint.get_contract unsupported; using extended contracts cache fallback");
          warnedGetContractUnsupported = true;
        }

        const cached = getFromExtendedCache(ref);
        if (cached) {
          return cached;
        }

        const extended = await fetchContractsExtended();
        if (extended?.contracts?.length) {
          return getFromExtendedCache(ref);
        }

        return null;
      }

      getContractSupported = true;
      console.warn("dMint API error:", error);
      return null;
    }

    getContractSupported = true;
    return result as ExtendedContract;
  } catch (error) {
    const message = String((error as Error)?.message || error || "");
    if (isUnsupportedMethodError(message)) {
      getContractSupported = false;
      if (!warnedGetContractUnsupported) {
        console.warn("dmint.get_contract unsupported; using extended contracts cache fallback");
        warnedGetContractUnsupported = true;
      }

      const cached = getFromExtendedCache(ref);
      if (cached) {
        return cached;
      }

      const extended = await fetchContractsExtended();
      if (extended?.contracts?.length) {
        return getFromExtendedCache(ref);
      }

      return null;
    }

    getContractSupported = true;
    console.warn("Failed to fetch contract from API:", error);
    return null;
  }
}

/**
 * Fetch contracts filtered by mining algorithm.
 */
export async function fetchContractsByAlgorithm(algorithm: number): Promise<ExtendedContract[]> {
  try {
    const result = await client.request("dmint.get_by_algorithm", algorithm);
    
    if (result && typeof result === 'object' && 'error' in result) {
      console.warn("dMint API error:", (result as { error: string }).error);
      return [];
    }
    
    return result as ExtendedContract[];
  } catch (error) {
    console.warn("Failed to fetch contracts by algorithm:", error);
    return [];
  }
}

/**
 * Fetch most profitable contracts sorted by reward/difficulty ratio.
 */
export async function fetchMostProfitable(limit: number = 10): Promise<ExtendedContract[]> {
  try {
    const result = await client.request("dmint.get_most_profitable", limit);
    
    if (result && typeof result === 'object' && 'error' in result) {
      console.warn("dMint API error:", (result as { error: string }).error);
      return [];
    }
    
    return result as ExtendedContract[];
  } catch (error) {
    console.warn("Failed to fetch most profitable contracts:", error);
    return [];
  }
}

/**
 * Check if the connected server supports the dMint API.
 * Returns true if the API is available.
 */
export async function isDmintApiAvailable(): Promise<boolean> {
  try {
    const request: DmintV2ContractsRequest = {
      version: 2,
      view: "token_summary",
      filters: { status: "mineable" },
      pagination: { limit: 1 },
    };

    // Try a minimal v2 request - if it returns data or a proper error, API is available
    const result = await Promise.race([
      client.request("dmint.get_contracts", request as unknown as string),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000))
    ]);
    
    // If we get an "unknown method" type error, API is not available
    if (result && typeof result === 'object' && 'error' in result) {
      const error = (result as { error: string }).error.toLowerCase();
      if (error.includes("unknown") || error.includes("not found") || error.includes("not supported")) {
        return false;
      }
    }
    
    return true;
  } catch {
    return false;
  }
}
