import { effect, signal } from "@preact/signals-react";
import { Contract, Glyph, Message, Utxo, Wallet, Work } from "./types";
import { calcTimeToMine } from "./pow";
import { addMessage } from "./message";

export const servers = signal<string[]>([]);
export const messages = signal<Message[]>([]);
export const hashrate = signal(0);
export const found = signal(0);
export const accepted = signal(0);
export const rejected = signal(0);
export const wallet = signal<Wallet | undefined>(undefined);
export const balance = signal(0);
export const utxos = signal<Utxo[]>([]);
export const gpu = signal<string | undefined>(""); // undefined means unsupported
export const selectedContract = signal("");
export const contract = signal<Contract | undefined>(undefined);
export const glyph = signal<Glyph | undefined>(undefined);
export const work = signal<Work | undefined>(undefined);
export const miningEnabled = signal(false); // The user requested state of the miner
export const miningStatus = signal<"stop" | "change" | "mining" | "ready">( // The actual state of the miner
  "ready"
);
export const loadingContract = signal(false);

// Settings
export const mineToAddress = signal("");
export const mintMessage = signal("");
export const hideMessages = signal(false);
export const contractsUrl = signal("");
// Use RXinDexer dMint API for contract discovery (with fallback to contractsUrl)
export const useIndexerApi = signal(true);
// Automatically mutate work entropy when full nonce-space is exhausted
export const autoReseed = signal(true);

let timer = 0;
let mintTimeShown = false;

effect(() => {
  const isMining = miningStatus.value === "mining";
  const hasPositiveHashrate = hashrate.value > 0;

  if (isMining && hasPositiveHashrate) {
    if (!mintTimeShown && timer === 0) {
      timer = window.setTimeout(() => {
        timer = 0;
        if (contract.value && miningStatus.value === "mining" && hashrate.value > 0) {
          mintTimeShown = true;
          addMessage({
            type: "mint-time",
            seconds: calcTimeToMine(contract.value.target, hashrate.value),
          });
        }
      }, 10000);
    }
    return;
  }

  if (timer !== 0) {
    clearTimeout(timer);
    timer = 0;
  }

  if (!isMining) {
    mintTimeShown = false;
  }
});
