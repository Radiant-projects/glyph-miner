import { signal } from "@preact/signals-react";
import { ElectrumWS } from "ws-electrumx-client";
import miner from "./miner";
import { miningEnabled, servers } from "./signals";
import { recoverFromError, subscribeToAddress } from "./blockchain";
import { Transaction } from "@radiantblockchain/radiantjs";
import localforage from "localforage";
import { addMessage } from "./message";
import { resetApiCache } from "./deployments";

export enum ServerStatus {
  DISCONNECTED,
  CONNECTING,
  CONNECTED,
}
export const serverStatus = signal(ServerStatus.DISCONNECTED);
export let client: ElectrumWS;
type Timeout = ReturnType<typeof setTimeout>;
type Interval = ReturnType<typeof setInterval>;

let serverNum = 0;
let autoStopTimer: Timeout;
let autoReconnectTimer: Timeout;
let connectionTimer: Timeout;
let connectAttemptCounter = 0;

function startConnectionTimer() {
  clearTimeout(connectionTimer);
  connectionTimer = setTimeout(() => {
    console.debug("Connection timed out");
    onClose(false);
  }, 10000);
}

function startAutoReconnectTimer() {
  if (!autoReconnectTimer) {
    const allServersAttempted =
      connectAttemptCounter > 0 &&
      connectAttemptCounter % servers.value.length === 0;
    autoReconnectTimer = setTimeout(
      () => {
        // Try the next server
        serverNum = (serverNum + 1) % servers.value.length;
        console.debug("Attempting to reconnect");
        connect();
      },
      allServersAttempted ? 120000 : 10000
    );
  }
}

let heartbeatInterval: Interval;
async function heartbeat() {
  const n = serverNum;
  const pong = await Promise.race([
    client.request("server.ping"),
    new Promise((resolve) => {
      // Time out after 10 seconds
      setTimeout(() => resolve(false), 10000);
    }),
  ]);

  // If server changed while waiting for a response then discard this heartbeat
  if (n !== serverNum) {
    return;
  }

  // This happens if the network connection is lost
  // If the server is down then the close function will be called instead
  // Close will also be called when network connection is reestablished
  if (pong !== null && serverStatus.value != ServerStatus.DISCONNECTED) {
    addMessage({
      type: "general",
      msg: "Connection lost, waiting to reconnect",
    });
    serverStatus.value = ServerStatus.DISCONNECTED;
    addMessage({ type: "stop" });
    miner.stop();
  }

  if (pong === null && serverStatus.value === ServerStatus.DISCONNECTED) {
    serverStatus.value = ServerStatus.CONNECTED;
    if (miningEnabled.value) {
      recoverFromError();
    }
  }
}

function onClose(wasClean: boolean) {
  console.debug("Close");
  clearTimeout(connectionTimer);
  clearTimeout(autoReconnectTimer);
  connectionTimer = 0 as unknown as Timeout;
  autoReconnectTimer = 0 as unknown as Timeout;
  if (!wasClean) {
    connectAttemptCounter++;

    if (connectAttemptCounter >= servers.value.length) {
      addMessage({
        type: "general",
        msg: "All servers unresponsive, waiting to reconnect",
      });
    } else {
      addMessage({
        type: "general",
        msg: "Server disconnected, waiting to reconnect",
      });
    }
  }
  serverStatus.value = ServerStatus.DISCONNECTED;
  if (miningEnabled.value) {
    // If mining, wait for 10 seconds before auto stopping
    if (!autoStopTimer) {
      autoStopTimer = setTimeout(() => {
        console.debug("Auto stopped miner");
        miner.stop();
        addMessage({ type: "stop" });
        startAutoReconnectTimer();
      }, 10000);
    }
  } else {
    // Not mining, so start auto reconnect timer immediately
    startAutoReconnectTimer();
  }
}

export async function connect(newServerList = false) {
  if (newServerList) {
    serverNum = 0;
  }

  // Reset API cache when connecting to a new server
  resetApiCache();

  await miner.stop();

  if (client?.isConnected()) {
    client.close("");
  }

  const server = servers.value[serverNum];
  client = new ElectrumWS(server);
  console.debug(`Connecting to ${server}`);
  startConnectionTimer();
  client.on("disconnected", () => {
    console.debug("Disconnected");
  });
  client.on("connected", () => {
    connectAttemptCounter = 0;
    clearTimeout(connectionTimer);
    clearInterval(heartbeatInterval);
    connectionTimer = 0 as unknown as Timeout;
    heartbeatInterval = 0 as unknown as Interval;
    // Check connection is alive every 30 seconds
    heartbeatInterval = setInterval(heartbeat, 30000);
    console.debug(`Connected to ${server}`);
    addMessage({
      type: "general",
      msg: `Connected to ${server}`,
    });
    serverStatus.value = ServerStatus.CONNECTED;
    clearTimeout(autoStopTimer);
    clearTimeout(autoReconnectTimer);
    autoStopTimer = 0 as unknown as Timeout;
    autoReconnectTimer = 0 as unknown as Timeout;

    if (miningEnabled.value) {
      // Resubscribe to everything and restart mining
      recoverFromError();
    }
  });
  client.on("close", (event) => {
    console.log("Close event received");
    onClose((event as CloseEvent).wasClean);
  });

  serverStatus.value = ServerStatus.CONNECTING;

  subscribeToAddress();
}

export async function fetchTx(txid: string, fresh: boolean) {
  const cached = fresh ? undefined : await localforage.getItem<string>(txid);
  if (cached) {
    return new Transaction(cached);
  }
  const hex = await client.request("blockchain.transaction.get", txid);
  localforage.setItem(txid, hex);
  return new Transaction(hex);
}

export async function fetchRef(ref: string) {
  const ids = (await client.request("blockchain.ref.get", ref)) as {
    tx_hash: string;
  }[];
  if (ids.length) {
    return [ids[0], ids[ids.length - 1]];
  }
  return [];
}

export async function broadcast(hex: string) {
  console.debug("Broadcasting transaction, length:", hex.length);
  const result = await client.request("blockchain.transaction.broadcast", hex);
  console.debug("Broadcast response:", result);
  return result;
}
