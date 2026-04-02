import { useEffect, useMemo, useState, useCallback } from "react";
import { changeToken } from "../blockchain";
import {
  Box, Button, Center, CircularProgress, Container, Flex, Heading,
  Icon, IconButton, Image, Input, InputGroup, InputLeftElement,
  Select,
  Table, Tbody, Td, Th, Thead, Tr, Text,
} from "@chakra-ui/react";
import { SearchIcon, TriangleDownIcon, TriangleUpIcon, CloseIcon } from "@chakra-ui/icons";
import { FaQuestionCircle } from "react-icons/fa";
import { LuRefreshCw } from "react-icons/lu";
import { Link, useNavigate } from "react-router-dom";
import { deriveSubContractRef } from "../utils";
import { miningEnabled, miningStatus, selectedContract } from "../signals";
import miner from "../miner";
import { addMessage } from "../message";
import {
  fetchContractSummaries,
  ContractSummaryItem,
  enrichContractSummariesWithVerifiedCounts,
} from "../deployments";
import { fetchToken } from "../glyph";
import { getAlgorithmName } from "../glyph";

type SortField = "ticker" | "algorithm" | "claimed" | "contracts" | "reward";
type SortDir = "asc" | "desc";

/**
 * Build a blob URL from hex-encoded icon data and MIME type.
 * This mirrors how Photonic Wallet decodes embedded icons:
 *   const blob = new Blob([embed.b], { type: embed.t });
 * Except the API returns hex-encoded bytes, so we decode first.
 */
function iconDataUrl(iconType?: string, iconData?: string): string | undefined {
  if (!iconType || !iconData) return undefined;
  try {
    const bytes = new Uint8Array(
      iconData.match(/.{1,2}/g)?.map(b => parseInt(b, 16)) || []
    );
    const blob = new Blob([bytes], { type: iconType });
    return URL.createObjectURL(blob);
  } catch {
    return undefined;
  }
}

/**
 * Resolve IPFS URLs to a public gateway, similar to Photonic Wallet's useIpfsUrl.
 */
function resolveIconUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("ipfs://")) {
    const cid = url.replace("ipfs://", "");
    return `https://ipfs.io/ipfs/${cid}`;
  }
  return url;
}

function TokenIcon({ iconType, iconData, iconUrl }: {
  iconType?: string; iconData?: string; iconUrl?: string;
}) {
  const [blobUrl, setBlobUrl] = useState<string | undefined>();

  useEffect(() => {
    const u = iconDataUrl(iconType, iconData);
    setBlobUrl(u);
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [iconType, iconData]);

  const src = blobUrl || resolveIconUrl(iconUrl);
  if (src) {
    return (
      <Image
        src={src}
        boxSize="24px"
        borderRadius="full"
        objectFit="cover"
        fallback={<Icon as={FaQuestionCircle} boxSize={5} color="gray.500" />}
      />
    );
  }
  return <Icon as={FaQuestionCircle} boxSize={5} color="gray.500" />;
}

function SummaryRow({ item, showContracts }: { item: ContractSummaryItem; showContracts: boolean }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Derive sub-contract refs from token ref (big-endian 72-char format)
      // changeToken and fetchToken both expect big-endian refs
      const numToTry = 64;
      let loaded = false;

      for (let i = 0; i < numToTry; i++) {
        const candidateRef = deriveSubContractRef(item.ref, i);
        try {
          const token = await fetchToken(candidateRef);
          if (token && token.contract.height < token.contract.maxHeight) {
            selectedContract.value = candidateRef;
            changeToken(candidateRef);
            loaded = true;
            break;
          }
        } catch {
          continue;
        }
      }

      if (!loaded) {
        addMessage({ type: "general", msg: `All sub-contracts for ${item.ticker} are fully mined` });
        setLoading(false);
        return;
      }

      if (miningStatus.value !== "ready") addMessage({ type: "stop" });
      miner.stop();
      miningEnabled.value = false;
      navigate("/");
    } catch (e) {
      console.error("Failed to load contract:", e);
      addMessage({ type: "general", msg: `Failed to load ${item.ticker}` });
    } finally {
      setLoading(false);
    }
  }, [item, navigate]);

  return (
    <Tr
      _hover={{ bg: "whiteAlpha.50" }}
      transition="background 0.1s"
      cursor="default"
    >
      <Td>
        <Flex gap={2} alignItems="center">
          <TokenIcon iconType={item.iconType} iconData={item.iconData} iconUrl={item.iconUrl} />
          <Text fontWeight="medium">{item.ticker.substring(0, 20)}</Text>
        </Flex>
      </Td>
      <Td fontFamily="Source Code Pro Variable, monospace" fontSize="xs" color="gray.400">
        {item.ref.substring(0, 4)}&middot;{item.ref.substring(60, 64)}
      </Td>
      <Td isNumeric>
        <Box
          as="span"
          px={2}
          py={0.5}
          borderRadius="full"
          fontSize="xs"
          fontWeight="semibold"
          bg={item.percentMined >= 100 ? "red.900" : item.percentMined >= 75 ? "yellow.900" : "whiteAlpha.100"}
          color={item.percentMined >= 100 ? "red.200" : item.percentMined >= 75 ? "yellow.200" : "inherit"}
        >
          {item.percentMined.toFixed(2)}%
        </Box>
      </Td>
      <Td>{getAlgorithmName(item.algorithm)}</Td>
      {showContracts && <Td isNumeric>{item.contractCount?.toLocaleString()}</Td>}
      <Td isNumeric>{item.reward.toLocaleString()}</Td>
      <Td isNumeric>
        <Button
          size="xs"
          onClick={load}
          variant="outline"
          isLoading={loading}
          loadingText="..."
          isDisabled={item.percentMined >= 100}
        >
          {item.percentMined >= 100 ? "Done" : "Load"}
        </Button>
      </Td>
    </Tr>
  );
}

function SortTh({ label, field, cur, dir, onSort, isNumeric = false }: {
  label: string; field: SortField; cur: SortField; dir: SortDir;
  onSort: (f: SortField) => void; isNumeric?: boolean;
}) {
  const active = cur === field;
  return (
    <Th
      isNumeric={isNumeric}
      cursor="pointer"
      onClick={() => onSort(field)}
      _hover={{ color: "lightGreen.A200" }}
      userSelect="none"
      whiteSpace="nowrap"
      color={active ? "lightGreen.A200" : undefined}
    >
      {label}
      {active && (dir === "asc"
        ? <TriangleUpIcon ml={1} boxSize={2.5} />
        : <TriangleDownIcon ml={1} boxSize={2.5} />
      )}
    </Th>
  );
}

function sortVal(item: ContractSummaryItem, f: SortField): number | string {
  if (f === "ticker") return item.ticker.toLowerCase();
  if (f === "algorithm") return getAlgorithmName(item.algorithm).toLowerCase();
  if (f === "claimed") return item.percentMined;
  if (f === "contracts") return item.contractCount ?? -1;
  if (f === "reward") return item.reward;
  return item.reward;
}

export default function TokenList() {
  const [items, setItems] = useState<ContractSummaryItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [algorithm, setAlgorithm] = useState("all");
  const [sf, setSf] = useState<SortField>("ticker");
  const [sd, setSd] = useState<SortDir>("asc");

  const doLoad = useCallback(async () => {
    setLoading(true);
    setItems(null);
    const data = await fetchContractSummaries();
    const enriched = await enrichContractSummariesWithVerifiedCounts(data);
    setItems(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { doLoad(); }, [doLoad]);

  const onSort = useCallback((field: SortField) => {
    setSf(prev => {
      if (prev === field) {
        setSd(d => d === "asc" ? "desc" : "asc");
        return prev;
      }
      setSd(field === "ticker" ? "asc" : "desc");
      return field;
    });
  }, []);

  const algorithmOptions = useMemo(() => {
    if (!items) return [] as Array<[number, string]>;
    return [...new Map(items.map(item => [item.algorithm, getAlgorithmName(item.algorithm)] as [number, string])).entries()]
      .sort((a, b) => a[0] - b[0]);
  }, [items]);

  const filtered = useMemo(() => {
    if (!items) return null;
    const q = search.toLowerCase().trim();
    let list = q
      ? items.filter(i =>
          i.ticker.toLowerCase().includes(q) ||
          i.name.toLowerCase().includes(q) ||
          getAlgorithmName(i.algorithm).toLowerCase().includes(q) ||
          i.ref.includes(q))
      : [...items];

    if (algorithm !== "all") {
      const algoId = Number(algorithm);
      list = list.filter(i => i.algorithm === algoId);
    }

    list.sort((a, b) => {
      const av = sortVal(a, sf);
      const bv = sortVal(b, sf);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sd === "asc" ? cmp : -cmp;
    });
    return list;
  }, [items, search, algorithm, sf, sd]);

  const showContractsColumn = useMemo(() => {
    if (!filtered || filtered.length === 0) return false;
    return filtered.every((item) => typeof item.contractCount === "number");
  }, [filtered]);

  return (
    <>
      <Box bg="bg.300" borderBottom="1px solid" borderBottomColor="whiteAlpha.50">
        <Container maxW="container.lg">
          <Flex
            justifyContent="space-between"
            h={{ base: "64px", md: "96px" }}
            alignItems="center"
          >
            <Heading size={{ base: "md", md: "lg" }} fontWeight="500" flexGrow={1}>
              Mining Contracts
            </Heading>
            <IconButton
              icon={<Icon as={LuRefreshCw} />}
              aria-label="Refresh"
              onClick={doLoad}
              display={{ base: "flex", md: "none" }}
              variant="ghost"
              size="sm"
            />
            <Button
              onClick={doLoad}
              leftIcon={<Icon as={LuRefreshCw} />}
              display={{ base: "none", md: "flex" }}
              variant="outline"
              size="sm"
            >
              Refresh
            </Button>
            <IconButton
              icon={<CloseIcon />}
              as={Link}
              aria-label="Close"
              to="/"
              ml={3}
              variant="ghost"
              size="sm"
            />
          </Flex>
        </Container>
      </Box>

      <Container maxW="container.lg" py={6} px={{ base: 2, md: 0 }}>
        <Box mb={4}>
          <Flex gap={3} direction={{ base: "column", md: "row" }} align={{ base: "stretch", md: "center" }}>
            <InputGroup maxW={{ base: "100%", md: "360px" }}>
              <InputLeftElement pointerEvents="none">
                <SearchIcon color="gray.500" />
              </InputLeftElement>
              <Input
                placeholder="Search by name, algo, or ID..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                bg="bg.100"
                border="1px solid"
                borderColor="whiteAlpha.100"
                _focus={{ borderColor: "lightGreen.A400", bg: "bg.50" }}
                size="sm"
                borderRadius="lg"
                h="40px"
              />
            </InputGroup>

            <Select
              value={algorithm}
              onChange={e => setAlgorithm(e.target.value)}
              maxW={{ base: "100%", md: "220px" }}
              bg="bg.100"
              border="1px solid"
              borderColor="whiteAlpha.100"
              _focus={{ borderColor: "lightGreen.A400", bg: "bg.50" }}
              size="sm"
              borderRadius="lg"
              h="40px"
            >
              <option value="all">All Algorithms</option>
              {algorithmOptions.map(([id, label]) => (
                <option key={id} value={id.toString()}>{label}</option>
              ))}
            </Select>
          </Flex>
        </Box>

        <Box
          width="100%"
          overflowX="auto"
          bg="bg.100"
          borderRadius="2xl"
          border="1px solid"
          borderColor="whiteAlpha.50"
        >
          <Table variant="unstyled" size="sm">
            <Thead>
              <Tr borderBottom="1px solid" borderBottomColor="whiteAlpha.100">
                <SortTh label="Name" field="ticker" cur={sf} dir={sd} onSort={onSort} />
                <Th>ID</Th>
                <SortTh label="Claimed" field="claimed" cur={sf} dir={sd} onSort={onSort} isNumeric />
                <SortTh label="Algo" field="algorithm" cur={sf} dir={sd} onSort={onSort} />
                {showContractsColumn && (
                  <SortTh label="Contracts" field="contracts" cur={sf} dir={sd} onSort={onSort} isNumeric />
                )}
                <SortTh label="Reward" field="reward" cur={sf} dir={sd} onSort={onSort} isNumeric />
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody>
              {filtered && filtered.map(item => (
                <SummaryRow key={item.ref} item={item} showContracts={showContractsColumn} />
              ))}
            </Tbody>
          </Table>
        </Box>

        {loading && (
          <Center my={16}>
            <CircularProgress
              isIndeterminate
              size="80px"
              color="lightGreen.A200"
              trackColor="bg.300"
              thickness={8}
            />
          </Center>
        )}

        {!loading && filtered && filtered.length === 0 && (
          <Center my={16} color="gray.400" fontSize="sm">
            {search ? "No contracts match your search" : "No contracts found"}
          </Center>
        )}

        {!loading && items && (
          <Box mt={3} color="gray.500" fontSize="xs">
            {filtered?.length} of {items.length} contracts
          </Box>
        )}
      </Container>
    </>
  );
}
