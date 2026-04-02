import { base58AddressToLockingBytecode } from "@bitauth/libauth";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { Script, Transaction } from "@radiantblockchain/radiantjs";
import { burnScript, dMintScript, fetchToken, parseContractTx } from "./glyph";
import {
  accepted,
  balance,
  contract,
  glyph,
  loadingContract,
  mineToAddress,
  miningEnabled,
  miningStatus,
  mintMessage,
  rejected,
  selectedContract,
  utxos,
  wallet,
  work,
} from "./signals";
import { addMessage } from "./message";
import miner, { updateWork } from "./miner";
import {
  reverseRef,
  scriptHash,
  deriveSubContractRef,
  push4bytes,
} from "./utils";
import { broadcast, client, fetchRef, fetchTx } from "./client";
import { Contract, Work, Utxo, AlgorithmId } from "./types";
import { FEE_PER_KB } from "./constants";
import { fetchContract as fetchContractFromApi } from "./dmint-api";
import { normalizeNonceHexForScriptSig } from "./nonce";

// Map API algorithm ID to AlgorithmId string (0/1/2 only for now)
function mapAlgorithmId(apiAlgo: number): AlgorithmId {
  // 0 = sha256d, 1 = blake3, 2 = k12
  switch (apiAlgo) {
    case 0: return 'sha256d';
    case 1: return 'blake3';
    case 2: return 'k12';
    default: return 'sha256d';
  }
}

// Subscription statuses
let addressSubscriptionStatus = "";
let contractSubscriptionStatus = "";

// Timer to ensure address subscription is received after mint
let subscriptionCheckTimer: ReturnType<typeof setTimeout>;

// Timer to periodically update the contract in case of subscription failure
let contractCheckTimer: ReturnType<typeof setTimeout>;

let nonces: string[] = [];

// Ready will be true when there is no pending token claim
let ready: boolean = true;

// Sometimes subscriptions arrive late after another nonce is found so keep track of previous locations
let acceptedLocations: string[] = [];

// Keep track of consecutive mempool conflicts
let mempoolConflictCounter = 0;

enum ClaimError {
  MEMPOOL_CONFLICT,
  CONTRACT_FAIL,
  MISSING_INPUTS,
  LOW_FEE,
  NON_MINIMAL_PUSH,
}

type DmintPreimageStackCheck = {
  usesIndexedLegacyPreimage: boolean;
  stateItemCount: number;
  pick5: string;
  pick9a: string;
  pick9b: string;
  roll10: string;
  matchesExpectedLayout: boolean;
};

function pickStackItem(stack: string[], n: number): string {
  return stack[stack.length - 1 - n];
}

function stackPick(stack: string[], n: number) {
  stack.push(pickStackItem(stack, n));
}

function stackCat(stack: string[]) {
  const right = stack.pop();
  const left = stack.pop();
  stack.push(`cat(${left},${right})`);
}

function stackSha256(stack: string[]) {
  const value = stack.pop();
  stack.push(`sha256(${value})`);
}

function stackRoll(stack: string[], n: number): string {
  const index = stack.length - 1 - n;
  const [value] = stack.splice(index, 1);
  stack.push(value);
  return value;
}

function getStateItemsFromScriptHex(stateScriptHex: string): string[] | undefined {
  const asm = Script.fromHex(stateScriptHex).toASM();
  const tokens = asm.split(" ").filter(Boolean);
  const singletonIndex = tokens.indexOf("OP_PUSHINPUTREFSINGLETON");
  const refIndex = tokens.indexOf("OP_PUSHINPUTREF", singletonIndex + 2);
  if (singletonIndex < 0 || refIndex < 0) {
    return;
  }

  const height = tokens[0];
  const contractRef = tokens[singletonIndex + 1];
  const tokenRef = tokens[refIndex + 1];
  const tail = tokens.slice(refIndex + 2);
  return [height, contractRef, tokenRef, ...tail];
}

function analyzeDmintPreimageStackLayout(
  stateScriptHex: string,
  codeScriptHex?: string,
): DmintPreimageStackCheck | undefined {
  if (!codeScriptHex) {
    return;
  }

  const codeAsm = Script.fromHex(codeScriptHex).toASM();
  const usesIndexedLegacyPreimage =
    codeAsm.includes("OP_OUTPOINTTXHASH OP_5 OP_PICK") &&
    codeAsm.includes("OP_9 OP_PICK OP_9 OP_PICK") &&
    codeAsm.includes("OP_10 OP_ROLL");

  if (!usesIndexedLegacyPreimage) {
    return;
  }

  const stateItems = getStateItemsFromScriptHex(stateScriptHex);
  if (!stateItems) {
    return;
  }

  const stack = [
    "nonce",
    "inputHash",
    "outputHash",
    "outputIndex",
    ...stateItems,
    "outpointTxHash",
  ];

  stackPick(stack, 5);
  const pick5 = stack[stack.length - 1];
  stackCat(stack);
  stackSha256(stack);

  stackPick(stack, 9);
  const pick9a = stack[stack.length - 1];
  stackPick(stack, 9);
  const pick9b = stack[stack.length - 1];
  stackCat(stack);
  stackSha256(stack);
  stackCat(stack);

  const roll10 = stackRoll(stack, 10);

  const matchesExpectedLayout =
    pick5 === "contractRef" &&
    pick9a === "inputHash" &&
    pick9b === "outputHash" &&
    roll10 === "nonce";

  return {
    usesIndexedLegacyPreimage,
    stateItemCount: stateItems.length,
    pick5,
    pick9a,
    pick9b,
    roll10,
    matchesExpectedLayout,
  };
}

function extractCodeScriptHashOp(codeScript?: string): "aa" | "ee" | "ef" | undefined {
  if (!codeScript) return;
  const match = codeScript
    .toLowerCase()
    .match(/7ea87e5a7a7e(aa|ee|ef)bc01147f/);
  return match?.[1] as "aa" | "ee" | "ef" | undefined;
}

function mapHashOpToAlgorithm(hashOp?: "aa" | "ee" | "ef"): AlgorithmId | undefined {
  switch (hashOp) {
    case "aa":
      return "sha256d";
    case "ee":
      return "blake3";
    case "ef":
      return "k12";
    default:
      return;
  }
}

function nonceBytesForAlgorithm(algorithm?: AlgorithmId): 4 | 8 {
  return algorithm === "blake3" || algorithm === "k12" ? 8 : 4;
}

function normalizeNonceHex(nonceHex: string, nonceBytes: 4 | 8): string {
  return normalizeNonceHexForScriptSig(nonceHex, nonceBytes);
}

function findNonMinimalDataPush(scriptHex: string): string | undefined {
  const asm = Script.fromHex(scriptHex).toASM();
  const parts = asm.split(" ");

  for (const token of parts) {
    if (!/^[0-9a-f]{2}$/i.test(token)) continue;
    const value = Number.parseInt(token, 16);

    if (value === 0 || (value >= 1 && value <= 16) || value === 0x81) {
      return token.toLowerCase();
    }
  }

  return;
}

type NextContractState = {
  script: string;
  target: bigint;
  lastTime?: bigint;
};

function buildNextContractState(
  contract: Contract,
  newHeight: bigint
): NextContractState {
  // contract.script stores the mutable state section. Replace only the first
  // 4-byte height push and preserve the rest exactly as-is.
  const nextStateScript = `${push4bytes(Number(newHeight))}${contract.script.substring(10)}`;

  // If codeScript was parsed from chain, preserve it exactly so algorithm/DAA
  // specific bytecode remains unchanged.
  if (contract.codeScript) {
    return {
      script: `${nextStateScript}bd${contract.codeScript}`,
      target: contract.target,
      lastTime: contract.lastTime,
    };
  }

  // Legacy fallback for older parsed contracts without codeScript.
  return {
    script: dMintScript({
      ...contract,
      height: newHeight,
    }),
    target: contract.target,
    lastTime: contract.lastTime,
  };
}

async function claimTokens(
  contract: Contract,
  work: Work,
  nonce: string
): Promise<
  {
    success: true;
    txid: string;
    nextContractState?: { target: bigint; lastTime?: bigint };
  } | { success: false; error?: ClaimError }
> {
  if (!wallet.value) return { success: false };

  const newHeight = contract.height + 1n;
  const lastMint = newHeight === contract.maxHeight;
  const codeScriptHashOp = extractCodeScriptHashOp(contract.codeScript);
  const codeScriptAlgo = mapHashOpToAlgorithm(codeScriptHashOp);
  const resolvedAlgorithm = work.algorithm || contract.algorithm || codeScriptAlgo;
  const nonceBytes = nonceBytesForAlgorithm(resolvedAlgorithm);
  const nonceForScriptSig = normalizeNonceHex(nonce, nonceBytes);
  const inputScriptHash = bytesToHex(sha256(sha256(work.inputScript)));
  const outputScriptHash = bytesToHex(sha256(sha256(work.outputScript)));
  const fundingInputCount = utxos.value.length;
  const fundingInputsMatchInputHash = fundingInputCount > 0;
  const fullContractScript = contract.codeScript
    ? `${contract.script}bd${contract.codeScript}`
    : contract.script;
  const nonMinimalPush = findNonMinimalDataPush(fullContractScript);
  const preimageStackCheck = analyzeDmintPreimageStackLayout(
    contract.script,
    contract.codeScript,
  );

  console.debug("Pre-submit validation", {
    nonceHexLength: nonceForScriptSig.length,
    nonceByteLength: nonceForScriptSig.length / 2,
    nonceMode: `${nonceBytes}-byte`,
    fundingInputCount,
    fundingInputsMatchInputHash,
    codeScriptHashOp,
    nonMinimalPush,
    inputScriptHash,
    outputScriptHash,
    preimageStackCheck,
  });

  if (nonMinimalPush) {
    console.warn(
      `Blocking submit: contract script contains non-minimal push (${nonMinimalPush}); node rejects with Data push larger than necessary`
    );
    return { success: false, error: ClaimError.NON_MINIMAL_PUSH };
  }

  if (!fundingInputsMatchInputHash) {
    console.warn(
      `Blocking submit: no funding inputs available for required inputHash ${inputScriptHash}`
    );
    return { success: false, error: ClaimError.MISSING_INPUTS };
  }

  if (preimageStackCheck && !preimageStackCheck.matchesExpectedLayout) {
    console.warn(
      "Blocking submit: dMint preimage stack layout mismatch; codeScript OP_PICK/OP_ROLL indices do not map to contractRef/inputHash/outputHash/nonce",
      preimageStackCheck,
    );
    if (resolvedAlgorithm !== "sha256d") {
      return { success: false, error: ClaimError.CONTRACT_FAIL };
    }
    console.warn(
      "Continuing submit despite preimage stack layout warning for legacy SHA256d contract",
      {
        resolvedAlgorithm,
        codeScriptHashOp,
      },
    );
  }

  const noncePushOp = nonceBytes.toString(16).padStart(2, "0");
  const scriptSigHex = `${noncePushOp}${nonceForScriptSig}20${inputScriptHash}20${outputScriptHash}00`;
  const scriptSig = Script.fromHex(scriptSigHex);

  const tx = new Transaction();
  tx.feePerKb(FEE_PER_KB);
  const p2pkh = Script.fromAddress(wallet.value.address).toHex();
  const ft = `${Script.fromAddress(mineToAddress.value).toHex()}bdd0${
    contract.tokenRef
  }dec0e9aa76e378e4a269e69d`;
  const privKey = wallet.value.privKey;
  const reward = Number(contract.reward);

  tx.addInput(
    new Transaction.Input({
      prevTxId: contract.location,
      outputIndex: contract.outputIndex,
      script: new Script(),
      output: new Transaction.Output({
        script: contract.script,
        satoshis: 1,
      }),
    })
  );

  // @ts-expect-error ...
  tx.setInputScript(0, () => scriptSig);

  // Consolidate all UTXOs
  utxos.value.forEach((utxo) => {
    tx.from({
      txId: utxo.tx_hash,
      outputIndex: utxo.tx_pos,
      script: p2pkh,
      satoshis: utxo.value,
    });
  });

  const nextContractState = !lastMint
    ? buildNextContractState(contract, newHeight)
    : undefined;

  if (lastMint) {
    const burn = burnScript(contract.contractRef);
    tx.addOutput(
      new Transaction.Output({
        satoshis: 0,
        script: burn,
      })
    );
  } else {
    const dmint = nextContractState?.script;
    tx.addOutput(
      new Transaction.Output({
        satoshis: 1,
        script: dmint,
      })
    );
  }

  tx.addOutput(
    new Transaction.Output({
      satoshis: reward,
      script: ft,
    })
  );

  // Output script is message
  tx.addOutput(
    new Transaction.Output({
      satoshis: 0,
      script: bytesToHex(work.outputScript),
    })
  );

  tx.change(wallet.value.address);
  tx.sign(privKey);
  tx.seal();

  const scriptSigAsm = scriptSig.toASM();
  const scriptSigParts = scriptSigAsm.split(" ");
  const txOutputAudit = tx.outputs.map((output, index) => {
    const scriptHex = output.script.toHex();
    return {
      index,
      scriptHash: bytesToHex(sha256(sha256(hexToBytes(scriptHex)))),
      scriptHex,
    };
  });
  console.debug("Contract submit audit", {
    nonce: nonceForScriptSig,
    algorithm: resolvedAlgorithm,
    codeScriptHashOp,
    target: contract.target.toString(),
    nextTarget: nextContractState?.target?.toString(),
    nextLastTime: nextContractState?.lastTime?.toString(),
    txLockTime: tx.getLockTime(),
    contractLocation: contract.location,
    contractOutputIndex: contract.outputIndex,
    scriptSigAsm,
    scriptSigHex,
    scriptSigPartCount: scriptSigParts.length,
    scriptSigNonceLen: scriptSigParts[0]?.length,
    scriptSigInputHashLen: scriptSigParts[1]?.length,
    scriptSigOutputHashLen: scriptSigParts[2]?.length,
    inputScriptHash,
    outputScriptHash,
    txInputCount: tx.inputs.length,
    txOutputCount: tx.outputs.length,
    txOutputAudit,
  });

  const hex = tx.toString();
  try {
    console.debug("Broadcasting", hex);
    const txid = (await broadcast(hex)) as string;
    console.debug(`txid ${txid}`);

    // Update UTXOs so if there's a mint before subscription updates it can be funded
    // Set a timer that will refresh wallet in case tx was replaced and no subscription received
    startSubscriptionCheckTimer();
    const changeOutputIndex = tx.outputs.length - 1;
    utxos.value = [
      {
        tx_hash: txid,
        tx_pos: changeOutputIndex,
        value: tx.outputs[changeOutputIndex].satoshis,
      },
    ];

    // Also update balance so low balance message can be shown if needed
    balance.value = utxos.value.reduce((a, { value }) => a + value, 0);

    return {
      success: true,
      txid,
      nextContractState: nextContractState
        ? {
            target: nextContractState.target,
            lastTime: nextContractState.lastTime,
          }
        : undefined,
    };
  } catch (exception) {
    console.debug("Broadcast failed", exception);

    const msg = ((exception as Error).message || "").toLowerCase();
    let error = undefined;

    if (msg.includes("missing inputs")) {
      error = ClaimError.MISSING_INPUTS;
    }

    if (
      msg.includes("min relay fee not met") ||
      msg.includes("bad-txns-in-belowout")
    ) {
      error = ClaimError.LOW_FEE;
    }
    if (msg.includes("txn-mempool-conflict")) {
      error = ClaimError.MEMPOOL_CONFLICT;
    }
    if (msg.includes("mandatory-script-verify-flag-failed")) {
      error = ClaimError.CONTRACT_FAIL;
    }

    return { success: false, error };
  }
}

// Sometimes a tx might not get mined and no subscription status is received
// Set a timer to update unspent. This timer will be cleared when a subscription is received.
function startSubscriptionCheckTimer() {
  clearTimeout(subscriptionCheckTimer);
  subscriptionCheckTimer = setTimeout(() => {
    console.debug("No subscription received. Updating unspent.");
    updateUnspent();
  }, 10000);
}

// If no subscription has been received in the last minute then force an update
// This timer is cleared and recreated every time a subscription is received
// The timeout is shorter after a mempool conflict
function startContractCheckTimer(duration = 60000, fullRecovery = false) {
  clearTimeout(contractCheckTimer);
  contractCheckTimer = setTimeout(() => {
    try {
      if (fullRecovery) {
        // Pause mining and update unspent and contract
        recoverFromError();
      } else if (contract.value) {
        // Only refresh contract
        updateContract();
      }
    } catch (error) {
      console.debug("Contract check error", error);
    }
    startContractCheckTimer();
  }, duration);
}

const updateUnspent = async () => {
  if (wallet.value) {
    const p2pkh = base58AddressToLockingBytecode(wallet.value?.address);
    if (typeof p2pkh !== "string") {
      const sh = scriptHash(p2pkh.bytecode);

      console.debug("updateUnspent", sh);
      const response = (await client.request(
        "blockchain.scripthash.listunspent",
        sh
      )) as Utxo[];
      if (response) {
        balance.value = response.reduce((a, { value }) => a + value, 0);
        utxos.value = response;
      }
    }
  }
};

// Resubscribe to everything and restart mining
export async function recoverFromError() {
  if (!contract.value?.contractRef) {
    return;
  }

  addMessage({
    type: "general",
    msg: "Updating wallet and resubscribing to contract",
  });

  loadingContract.value = true;
  try {
    const refBE = reverseRef(contract.value.contractRef);
    // Stop miner and wait for UTXOs to update
    miner.stop();
    await updateUnspent();
    // Refetch token and resubscribe to contract
    await changeToken(refBE);
    if (miningEnabled.value) {
      miner.start();
      addMessage({ type: "start" });
    }
    loadingContract.value = false;
  } catch {
    loadingContract.value = false;
    addMessage({
      type: "general",
      msg: "Waiting for contract",
    });
    if (miningEnabled.value) {
      miner.start();
    }
  }
}

export function subscribeToAddress() {
  console.debug("Subscribing to address");
  const address = wallet.value?.address;
  if (!address) {
    return;
  }

  const p2pkh = base58AddressToLockingBytecode(address);
  if (typeof p2pkh !== "string") {
    console.debug(`Address set to ${address}`);

    const sh = scriptHash(p2pkh.bytecode);
    client.subscribe(
      "blockchain.scripthash",
      (_, newStatus: unknown) => {
        clearTimeout(subscriptionCheckTimer);
        if (newStatus !== addressSubscriptionStatus) {
          addressSubscriptionStatus = newStatus as string;
          console.debug(`Status received ${newStatus}`);
          updateUnspent();
        }
      },
      sh
    );
  }
}

async function mintedOut(location: string) {
  if (!contract.value) return;

  const currentContractRef = contract.value.contractRef;
  const tokenRef = contract.value.tokenRef;

  addMessage({
    type: "minted-out",
    ref: reverseRef(currentContractRef),
  });

  // No contract data exists in burn output so use existing data and set height to max
  contract.value = {
    ...contract.value,
    location,
    height: contract.value.maxHeight,
  };

  // Auto-switch: try to find the next available sub-contract
  const beContractRef = reverseRef(currentContractRef);
  const beTokenRef = reverseRef(tokenRef);
  const currentVout = parseInt(beContractRef.substring(64), 16);
  const tokenVout = parseInt(beTokenRef.substring(64), 16);
  const currentSubIndex = currentVout - tokenVout - 1;

  addMessage({ type: "general", msg: "Searching for next available sub-contract..." });

  // Scan forward from the next sub-contract
  for (let i = currentSubIndex + 1; i < currentSubIndex + 64; i++) {
    const candidateRef = deriveSubContractRef(beTokenRef, i);
    try {
      const token = await fetchToken(candidateRef);
      if (token && token.contract.height < token.contract.maxHeight) {
        addMessage({ type: "general", msg: `Auto-switching to sub-contract ${i + 1}` });
        selectedContract.value = candidateRef;
        changeToken(candidateRef);
        miningEnabled.value = true;
        return;
      }
    } catch {
      // No more sub-contracts found, stop scanning
      break;
    }
  }

  // Also try from the beginning in case earlier sub-contracts became available
  for (let i = 0; i < currentSubIndex; i++) {
    const candidateRef = deriveSubContractRef(beTokenRef, i);
    try {
      const token = await fetchToken(candidateRef);
      if (token && token.contract.height < token.contract.maxHeight) {
        addMessage({ type: "general", msg: `Auto-switching to sub-contract ${i + 1}` });
        selectedContract.value = candidateRef;
        changeToken(candidateRef);
        miningEnabled.value = true;
        return;
      }
    } catch {
      continue;
    }
  }

  // No available sub-contracts found
  miningEnabled.value = false;
  miner.stop();
  addMessage({ type: "general", msg: "All sub-contracts are fully mined. Mining stopped." });
}

export function foundNonce(nonce: string) {
  nonces.push(nonce);

  if (ready) {
    submit();
  }
}

async function submit() {
  console.debug("Submitting", { nonceCount: nonces.length, ready, contract: !!contract.value, work: !!work.value });
  const nonce = nonces.pop();

  // TODO handle multiple nonces, if one fails try the next
  nonces = [];

  if (!contract.value || !work.value || !nonce) {
    return;
  }

  const codeScriptHashOp = extractCodeScriptHashOp(contract.value.codeScript);
  const codeScriptAlgo = mapHashOpToAlgorithm(codeScriptHashOp);
  const resolvedAlgorithm =
    work.value.algorithm || contract.value.algorithm || codeScriptAlgo;
  const nonceBytes = nonceBytesForAlgorithm(resolvedAlgorithm);
  console.debug("Submit context", {
    nonceHexLength: nonce.length,
    nonceByteLength: nonce.length / 2,
    nonceMode: `${nonceBytes}-byte`,
    fundingInputCount: utxos.value.length,
    codeScriptHashOp,
  });

  ready = false;

  const result = await claimTokens(contract.value, work.value, nonce);
  if (result.success) {
    const { txid } = result;
    accepted.value++;
    mempoolConflictCounter = 0;
    ready = true;
    addMessage({
      type: "accept",
      nonce,
      msg: mintMessage.value || "",
      txid,
    });

    // Keep track of the last 20 accepted locations
    acceptedLocations.push(txid);
    acceptedLocations = acceptedLocations.slice(-20);

    // Set the new location now instead of waiting for the subscription
    const height = contract.value.height + 1n;
    if (height === contract.value.maxHeight) {
      mintedOut(txid);
    } else {
      console.debug(`Changed location to ${txid}`);
      contract.value = {
        ...contract.value,
        height,
        location: txid,
        outputIndex: 0,
        target: result.nextContractState?.target ?? contract.value.target,
        lastTime: result.nextContractState?.lastTime ?? contract.value.lastTime,
      };
      miningStatus.value = "change";
    }

    if (balance.value < 0.0001 + Number(contract.value.reward) / 100000000) {
      addMessage({ type: "general", msg: "Balance is low" });
      miner.stop();
      miningEnabled.value = false;
      addMessage({ type: "stop" });
    }
  } else {
    const rejectMessage = (reason: string) =>
      addMessage({
        type: "reject",
        nonce,
        reason,
      });

    if (
      result.error === ClaimError.MISSING_INPUTS ||
      result.error === ClaimError.CONTRACT_FAIL ||
      result.error === ClaimError.NON_MINIMAL_PUSH
    ) {
      clearTimeout(subscriptionCheckTimer);

      if (result.error === ClaimError.MISSING_INPUTS) {
        // This should be caught by subscription and subscriptionCheckTimer, but handle here in case
        rejectMessage("missing inputs");
      } else if (result.error === ClaimError.NON_MINIMAL_PUSH) {
        rejectMessage("contract uses non-minimal pushdata");
        addMessage({
          type: "general",
          msg: "Contract script is non-minimal and cannot be mined on this node policy",
        });
        miner.stop();
        miningEnabled.value = false;
        addMessage({ type: "stop" });
      } else {
        console.debug("Contract fail context", {
          algorithm: (work.value as (Work & { algorithm?: string }) | undefined)?.algorithm,
          codeScriptHashOp: extractCodeScriptHashOp(contract.value?.codeScript),
          nonce,
          inputScriptHash: work.value ? bytesToHex(sha256(sha256(work.value.inputScript))) : undefined,
          outputScriptHash: work.value ? bytesToHex(sha256(sha256(work.value.outputScript))) : undefined,
        });
        rejectMessage("contract execution failed");
      }

      recoverFromError();
    } else if (result.error == ClaimError.LOW_FEE) {
      // Stop mining if fees can't be paid
      rejectMessage("fee not met");
      miner.stop();
      miningEnabled.value = false;
      addMessage({ type: "stop" });
    } else if (result.error == ClaimError.MEMPOOL_CONFLICT) {
      rejectMessage("mempool conflict");
      mempoolConflictCounter++;

      // If there are consecutive mempool conflicts, then refetch and resubscribe to everything again
      if (mempoolConflictCounter === 3) {
        recoverFromError();
      } else {
        // If no subscription is received within the next 10 seconds, refetch
        // This timer will be cleared when contract subscription is received
        startContractCheckTimer(10000, true);
      }
    }

    rejected.value++;
    ready = true;
  }
}

// Change token. Ref is big-endian.
export async function changeToken(ref: string) {
  loadingContract.value = true;
  acceptedLocations = [];
  // Unsubscribe from current subscription
  if (work.value?.contractRef) {
    console.debug(
      `Unsubscribing from current contract ${bytesToHex(
        work.value?.contractRef
      )}`
    );
    const sh = scriptHash(work.value?.contractRef);
    // Some Electrum servers don't implement unsubscribe. Ignore that specific RPC error.
    void client
      .unsubscribe("blockchain.scripthash", sh)
      .catch((error: unknown) => {
        const msg = String((error as Error)?.message || error || "").toLowerCase();
        if (msg.includes("unknown method")) {
          console.debug("Server does not support blockchain.scripthash.unsubscribe");
          return;
        }
        console.debug("Failed to unsubscribe from current contract", error);
      });
  }

  const token = await fetchToken(ref);
  loadingContract.value = false;

  if (!token) {
    addMessage({ type: "not-found", ref });
    return;
  }

  // Try to get algorithm from dmint API.
  // If API is unavailable, leave algorithm undefined so miner can fall back
  // to algorithm from glyph payload.
  let algorithm: AlgorithmId | undefined;
  try {
    const apiContract = await fetchContractFromApi(ref);
    if (apiContract) {
      algorithm = mapAlgorithmId(apiContract.algorithm);
      console.log("Algorithm from API:", apiContract.algorithm, "->", algorithm);
    }
  } catch (e) {
    console.warn("Failed to fetch algorithm from API:", e);
  }

  // Store algorithm in contract only when API provided it
  contract.value = algorithm
    ? { ...token.contract, algorithm }
    : { ...token.contract };
  glyph.value = token.glyph;
  updateWork();

  if (token.contract.height === token.contract.maxHeight) {
    addMessage({ type: "minted-out", ref, msg: token.contract.message });
    return;
  }

  addMessage({ type: "loaded", ref, msg: token.contract.message });

  if (balance.value < 0.01) {
    addMessage({
      type: "general",
      msg: "Balance is low. Please fund wallet to start mining.",
    });
  }

  if (miningStatus.value === "mining") {
    miningStatus.value = "change";
  }

  // Subscribe to the singleton so we know when the contract moves
  // Change ref to little-endian
  const refLe = reverseRef(ref);
  const sh = scriptHash(hexToBytes(refLe));
  client.subscribe(
    "blockchain.scripthash",
    async (_, status) => {
      startContractCheckTimer();

      if (status !== contractSubscriptionStatus) {
        updateContract();
      }

      contractSubscriptionStatus = status as string;
    },
    sh
  );

  return { contract, glyph };
}

async function updateContract() {
  const ref = contract.value?.contractRef;
  if (!ref) return;

  const ids = await fetchRef(reverseRef(ref));
  const location = ids[1]?.tx_hash;
  if (
    contract.value &&
    location !== contract.value?.location &&
    !acceptedLocations.includes(location)
  ) {
    console.debug(`New contract location ${location}`);
    const locTx = await fetchTx(location, true);
    const parsed = await parseContractTx(locTx, ref);

    if (parsed?.state && parsed.params.message) {
      addMessage({
        type: "new-location",
        txid: location,
        msg: parsed.params.message,
      });
    }

    if (parsed?.state === "active") {
      contract.value = parsed.params;
      if (miningStatus.value === "mining") {
        miningStatus.value = "change";
      }
    } else if (parsed?.state === "burn") {
      mintedOut(location);
    }
  } else if (acceptedLocations.includes(location)) {
    console.debug(`Old location received ${location}`);
  }
}
