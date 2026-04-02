import { swapEndianness } from "@bitauth/libauth";
import localforage from "localforage";
import { fetchToken } from "./glyph";
import { contractsUrl, useIndexerApi } from "./signals";
import { ContractGroup, Token } from "./types";
import { arrayChunks, deriveSubContractRef } from "./utils";
import { fetchRef } from "./client";
import { 
  fetchContractsSimple, 
  fetchContractsExtended, 
  fetchMostProfitable,
  isDmintApiAvailable,
  ExtendedContract,
  ExtendedContractsResponse 
} from "./dmint-api";

// Lightweight contract summary for fast list rendering
export interface ContractSummaryItem {
  ref: string;
  ticker: string;
  name: string;
  outputs: number;
  contractCount?: number;
  algorithm: number;
  difficulty: number;
  reward: number;
  percentMined: number;
  active: boolean;
  deployHeight: number;
  daaMode: number;
  daaModeName: string;
  iconType?: string;
  iconData?: string;
  iconUrl?: string;
}

type ContractCountCacheEntry = {
  count: number;
  verified: true;
};

const LIVE_COUNT_CACHE_PREFIX = "verified-contract-count:";
const LIVE_COUNT_MAX_INDEX = 4096;
const LIVE_COUNT_GAP_CONFIRMATION = 4;
const LIVE_COUNT_CONCURRENCY = 4;

// Cache for API availability check
let apiAvailable: boolean | null = null;
let apiCheckTime = 0;
const API_CHECK_INTERVAL = 60000; // Re-check every 60 seconds

/**
 * Check if RXinDexer dMint API is available (with caching).
 */
async function checkApiAvailable(): Promise<boolean> {
  const now = Date.now();
  if (apiAvailable !== null && now - apiCheckTime < API_CHECK_INTERVAL) {
    return apiAvailable;
  }
  
  apiAvailable = await isDmintApiAvailable();
  apiCheckTime = now;
  
  if (apiAvailable) {
    console.log("RXinDexer dMint API available");
  } else {
    console.log("RXinDexer dMint API not available, using fallback URL");
  }
  
  return apiAvailable;
}

/**
 * Fetch contracts from RXinDexer API or fallback to static URL.
 * Tries API first if useIndexerApi is enabled, falls back to static URL.
 */
async function fetchCuratedContracts(): Promise<[string, number][]> {
  // Try RXinDexer API first if enabled
  if (useIndexerApi.value) {
    const isAvailable = await checkApiAvailable();
    
    if (isAvailable) {
      const contracts = await fetchContractsSimple();
      if (contracts.length > 0) {
        return contracts;
      }
    }
  }
  
  // Fallback to static URL
  try {
    const response = await fetch(contractsUrl.value);
    if (!response.ok) {
      return [];
    }
    return (await response.json()) as [string, number][];
  } catch {
    return [];
  }
}

/**
 * Fetch contracts with extended metadata from RXinDexer.
 * Returns null if API not available or useIndexerApi is disabled.
 */
export async function fetchExtendedContracts(): Promise<ExtendedContract[] | null> {
  if (!useIndexerApi.value) {
    return null;
  }
  
  const isAvailable = await checkApiAvailable();
  if (!isAvailable) {
    return null;
  }
  
  const response = await fetchContractsExtended();
  return response?.contracts || null;
}

/**
 * Fetch most profitable contracts from RXinDexer.
 * Returns null if API not available or useIndexerApi is disabled.
 */
export async function fetchProfitableContracts(limit: number = 10): Promise<ExtendedContract[] | null> {
  if (!useIndexerApi.value) {
    return null;
  }
  
  const isAvailable = await checkApiAvailable();
  if (!isAvailable) {
    return null;
  }
  
  return await fetchMostProfitable(limit);
}

/**
 * Reset API availability cache (useful after server change).
 */
export function resetApiCache(): void {
  apiAvailable = null;
  apiCheckTime = 0;
}

// Needs improvement to remove spam
/*
async function fetchContractUtxos() {
  const cache = await localforage.getItem("unspent");
  if (cache) {
    return cache as Utxo[];
  }

  const unspent = (
    (await client.request(
      "blockchain.codescripthash.listunspent",
      "e8ed45cef15052dbe4b53274cd10a4c55c4065505cbb3420b6d1da20c365dad1" // SHA-256 of mining contract
    )) as Utxo[]
  ).filter(
    (u) => u.refs?.length === 2 && u.refs[0].type === "single" && u.refs[1].type
  );

  localforage.setItem("unspent", unspent);
  return unspent;
}
*/

const RESULTS_PER_PAGE = 10;
export async function fetchDeployments(
  onProgress: (n: number) => undefined = () => undefined,
  page = 0,
  refresh = false
): Promise<{ contractGroups: ContractGroup[]; pages: number }> {
  if (refresh) {
    await localforage.clear();
  }

  const allKey = "tokens";
  const cacheKey = `tokens-${page}`;
  const pageCache = await localforage.getItem(cacheKey);
  if (pageCache) {
    const contractAddresses = await localforage.getItem<string[]>(allKey);
    if (contractAddresses?.length) {
      const pages = Math.ceil(contractAddresses.length / RESULTS_PER_PAGE);

      // Get each cached group
      const firstRefs = pageCache as string[];
      const contractGroups = (
        await Promise.all(
          firstRefs.map((firstRef) =>
            localforage.getItem<ContractGroup>(`contractGroup.${firstRef}`)
          )
        )
      ).filter(Boolean) as ContractGroup[];

      return { contractGroups, pages };
    }
  }

  // TODO implement pagination in ElectrumX
  const all =
    (await localforage.getItem<[string, number][]>(allKey)) ||
    (await fetchCuratedContracts());
  const contractAddresses = all.slice(
    page * RESULTS_PER_PAGE,
    (page + 1) * RESULTS_PER_PAGE
  );

  const expanded = contractAddresses.flatMap(([singleton, numContracts]) => {
    const txid = singleton.slice(0, 64);
    const vout = parseInt(singleton.slice(65), 16);

    return new Array(numContracts).fill(undefined).map((_, i) => {
      // Add to vout and convert short format to big endian hex
      const buf = Buffer.alloc(36);
      buf.write(txid, 0, 32, "hex");
      buf.writeUInt32BE(vout + i, 32);
      // Save firstVout so we can group by first ref later
      return { firstVout: vout, singleton: buf.toString("hex") };
    });
  });

  const batches = arrayChunks(expanded, 4);
  const contracts: { firstVout: number; token: Token }[] = [];
  let progress = 1;

  // Fetch in batches
  for (const batch of batches) {
    contracts.push(
      ...((
        await Promise.all(
          batch.map(async ({ firstVout, singleton }) => {
            const cachedToken = await localforage.getItem<Token>(singleton);
            const token = cachedToken || (await fetchToken(singleton));
            onProgress((++progress / expanded.length) * 100);
            if (token) {
              localforage.setItem(singleton, token);
              return { firstVout, token };
            }
            return undefined;
          })
        )
      ).filter(Boolean) as { firstVout: number; token: Token }[])
    );
  }

  // Build contract groups
  const contractGroups = new Map<string, ContractGroup>();
  contracts.forEach(({ firstVout, token: contract }) => {
    const txid = contract.contract.contractRef.substring(0, 64);
    // Group by the first ref
    const buf = Buffer.alloc(36);
    buf.write(swapEndianness(txid), 0, 32, "hex");
    buf.writeUInt32BE(firstVout, 32);
    const firstRef = buf.toString("hex");

    if (!contractGroups.has(firstRef)) {
      contractGroups.set(firstRef, {
        glyph: contract.glyph,
        summary: {
          numContracts: 0,
          totalSupply: 0n,
          mintedSupply: 0n,
        },
        contracts: [],
      });
    }
    const token = contractGroups.get(firstRef);
    if (token) {
      token.contracts.push(contract.contract);
      token.summary.numContracts++;
      token.summary.totalSupply +=
        contract.contract.maxHeight * contract.contract.reward;
      token.summary.mintedSupply +=
        contract.contract.height * contract.contract.reward;
    }
  });

  // Cache page refs and contract groups
  for (const [firstRef, g] of contractGroups) {
    localforage.setItem(`contractGroup.${firstRef}`, g);
  }
  const firstRefs = [...contractGroups.keys()];
  localforage.setItem(cacheKey, firstRefs);

  const pages = Math.ceil(all.length / RESULTS_PER_PAGE);
  return { contractGroups: [...contractGroups.values()], pages };
}

export async function getCachedTokenContracts(firstRef: string) {
  return await localforage.getItem<ContractGroup>(`contractGroup.${firstRef}`);
}

/**
 * Fast fetch of contract summaries from the extended JSON endpoint.
 * Returns all contracts in a single HTTP request — no per-contract RPC calls.
 * Falls back to Electrum RPC extended format, then to null.
 */
const EXTENDED_CONTRACTS_URL = "https://glyph-miner.com/contracts-extended.json";

export async function fetchContractSummaries(): Promise<ContractSummaryItem[]> {
  // Prefer Electrum RPC/API when enabled so icon metadata stays in sync.
  if (useIndexerApi.value) {
    const isAvailable = await checkApiAvailable();
    if (isAvailable) {
      const response = await fetchContractsExtended();
      if (response?.contracts?.length) {
        const mineableContracts = response.contracts.filter(isContractMineable);
        console.log(`Loaded ${mineableContracts.length} mineable contracts from Electrum API`);
        return mineableContracts.map(mapExtendedToSummary);
      }
    }
  }

  // Fallback: HTTPS extended endpoint (single HTTP call)
  try {
    const response = await fetch(EXTENDED_CONTRACTS_URL, { signal: AbortSignal.timeout(8000) });
    if (response.ok) {
      const data = await response.json() as ExtendedContractsResponse;
      if (data?.contracts?.length > 0) {
        const mineableContracts = data.contracts.filter(isContractMineable);
        console.log(`Fast-loaded ${mineableContracts.length} mineable contracts from extended endpoint`);
        return mineableContracts.map(mapExtendedToSummary);
      }
    }
  } catch (e) {
    console.debug("Extended endpoint not available:", e);
  }

  return [];
}

async function probeSubContractExists(
  tokenRef: string,
  index: number,
  seen: Map<number, boolean | null>
): Promise<boolean | null> {
  const cached = seen.get(index);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const ref = deriveSubContractRef(tokenRef, index);
    const history = await fetchRef(ref);
    const exists = history.length > 0;
    seen.set(index, exists);
    return exists;
  } catch (e) {
    console.debug(`Contract count probe failed for ${tokenRef} @${index}:`, e);
    seen.set(index, null);
    return null;
  }
}

async function deriveVerifiedContractCount(tokenRef: string): Promise<number | null> {
  const normalizedRef = tokenRef.toLowerCase();
  const cacheKey = `${LIVE_COUNT_CACHE_PREFIX}${normalizedRef}`;
  const cached = await localforage.getItem<ContractCountCacheEntry>(cacheKey);
  if (cached?.verified && Number.isFinite(cached.count) && cached.count >= 0) {
    return cached.count;
  }

  const seen = new Map<number, boolean | null>();

  const firstExists = await probeSubContractExists(normalizedRef, 0, seen);
  if (firstExists === null) return null;
  if (!firstExists) {
    await localforage.setItem(cacheKey, { count: 0, verified: true });
    return 0;
  }

  let low = 0;
  let high = 1;
  while (high <= LIVE_COUNT_MAX_INDEX) {
    const exists = await probeSubContractExists(normalizedRef, high, seen);
    if (exists === null) return null;
    if (!exists) break;
    low = high;
    high *= 2;
  }

  if (high > LIVE_COUNT_MAX_INDEX) {
    return null;
  }

  let left = low + 1;
  let right = high;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    const exists = await probeSubContractExists(normalizedRef, mid, seen);
    if (exists === null) return null;
    if (exists) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  const firstMissing = left;
  for (let i = 0; i < LIVE_COUNT_GAP_CONFIRMATION; i++) {
    const exists = await probeSubContractExists(normalizedRef, firstMissing + i, seen);
    if (exists === null) return null;
    if (exists) {
      return null;
    }
  }

  await localforage.setItem(cacheKey, { count: firstMissing, verified: true });
  return firstMissing;
}

export async function enrichContractSummariesWithVerifiedCounts(
  items: ContractSummaryItem[]
): Promise<ContractSummaryItem[]> {
  if (!items.length) return items;

  const enriched = [...items];
  let cursor = 0;
  const workerCount = Math.min(LIVE_COUNT_CONCURRENCY, items.length);

  const workers = new Array(workerCount).fill(undefined).map(async () => {
    while (cursor < items.length) {
      const idx = cursor;
      cursor += 1;

      const item = items[idx];
      const count = await deriveVerifiedContractCount(item.ref);
      if (count !== null) {
        enriched[idx] = {
          ...item,
          contractCount: count,
        };
      }
    }
  });

  await Promise.all(workers);
  return enriched;
}

function isContractMineable(c: ExtendedContract): boolean {
  return c.active && c.outputs > 0 && c.percent_mined < 100;
}

function mapExtendedToSummary(c: ExtendedContract): ContractSummaryItem {
  return {
    ref: c.ref,
    ticker: c.ticker || "???",
    name: c.name || "",
    outputs: c.outputs,
    algorithm: c.algorithm,
    difficulty: c.difficulty,
    reward: c.reward,
    percentMined: c.percent_mined,
    active: c.active,
    deployHeight: c.deploy_height,
    daaMode: c.daa_mode ?? 0,
    daaModeName: c.daa_mode_name || "Fixed",
    iconType: c.icon_type || undefined,
    iconData: c.icon_data || undefined,
    iconUrl: c.icon_url || undefined,
  };
}
