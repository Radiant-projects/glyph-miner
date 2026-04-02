import { connect } from "./client";
import {
  autoReseed,
  contractsUrl,
  hideMessages,
  mineToAddress,
  mintMessage,
  servers,
  useIndexerApi,
  wallet,
} from "./signals";
import { shuffle } from "./utils";
import { createWallet, openWallet } from "./wallet";

const defaultServers = [
  //"wss://electrumx-testnet.radiant4people.com:53002",
  "wss://82.180.136.182:50004",
  "wss://radiantus.bladenet.online:50022",
  "wss://electrumx.radiant4people.com:50022",
  "wss://radiant2.bladenet.online:50022",
  "wss://radiant4.bladenet.online:50022",
  "wss://electrumx2.radiant4people.com:50022",
  "wss://radiantcore.org:50004",
];

console.debug("Init wallet");
wallet.value = openWallet() || createWallet();
mineToAddress.value = localStorage.getItem("mineToAddress") || "";
mintMessage.value = localStorage.getItem("mintMessage") || "";
hideMessages.value = localStorage.getItem("hideMessages") === "1";
contractsUrl.value =
  localStorage.getItem("contractsUrl") ||
  "https://glyph-miner.com/contracts.json";
// Default to using RXinDexer API (true unless explicitly disabled)
useIndexerApi.value = localStorage.getItem("useIndexerApi") !== "";
// Default to enabled unless explicitly disabled
autoReseed.value = localStorage.getItem("autoReseed") !== "";

// If servers isn't saved then set to default servers, randomly sorted
// Also ensure any new default servers are added to stored list
const storedServers = localStorage.getItem("servers");
if (storedServers) {
  const parsed: string[] = JSON.parse(storedServers);
  const missing = defaultServers.filter((s) => !parsed.includes(s));
  if (missing.length > 0) {
    parsed.push(...missing);
    localStorage.setItem("servers", JSON.stringify(parsed));
  }
  servers.value = parsed;
} else {
  servers.value = shuffle(defaultServers);
}

connect();
