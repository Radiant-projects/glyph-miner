import { useEffect, useState } from "react";
import { useClipboard } from "@chakra-ui/react";
import { changeToken } from "../blockchain";
import {
  Box,
  Button,
  Container,
  Flex,
  Heading,
  Icon,
  IconButton,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@chakra-ui/react";
import {
  ArrowBackIcon,
  CheckIcon,
  CloseIcon,
  CopyIcon,
} from "@chakra-ui/icons";
import { LuRefreshCw } from "react-icons/lu";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ContractGroup, Contract } from "../types";
import { miningEnabled, miningStatus, selectedContract } from "../signals";
import ShortId from "../ShortId";
import { reverseRef } from "../utils";
import miner from "../miner";
import { addMessage } from "../message";
import { getCachedTokenContracts } from "../deployments";

function ContractRow({ num, contract }: { num: number; contract: Contract }) {
  const navigate = useNavigate();
  const { contractRef, height, maxHeight, location } = contract;
  const { onCopy, hasCopied } = useClipboard(location);
  const load = () => {
    const ref = reverseRef(contractRef);
    selectedContract.value = ref;
    changeToken(ref);
    if (miningStatus.value !== "ready") {
      addMessage({ type: "stop" });
    }
    miner.stop();
    miningEnabled.value = false;
    navigate("/");
  };

  return (
    <Tr _hover={{ bg: "whiteAlpha.50" }} transition="background 0.1s">
      <Td fontSize="sm">{num}</Td>
      <Td fontSize="sm">
        <ShortId id={location} />
        <IconButton
          display="inline"
          onClick={onCopy}
          icon={
            hasCopied ? (
              <CheckIcon color="lightGreen.A400" />
            ) : (
              <CopyIcon color="lightGreen.A400" />
            )
          }
          variant="ghost"
          aria-label="Copy"
          size="xs"
        />
      </Td>
      <Td isNumeric fontSize="sm">
        <Box
          as="span"
          px={2}
          py={0.5}
          borderRadius="full"
          fontSize="xs"
          fontWeight="semibold"
          bg={
            Number(height) >= Number(maxHeight) ? "red.900" :
            (Number(height) / Number(maxHeight)) >= 0.75 ? "yellow.900" :
            "whiteAlpha.100"
          }
          color={
            Number(height) >= Number(maxHeight) ? "red.200" :
            (Number(height) / Number(maxHeight)) >= 0.75 ? "yellow.200" :
            "inherit"
          }
        >
          {((Number(height) / Number(maxHeight)) * 100).toFixed(2)}%
        </Box>
      </Td>
      <Td isNumeric>
        <Button size="xs" onClick={load} variant="outline">Load</Button>
      </Td>
    </Tr>
  );
}

export default function ContractList() {
  const { firstRef } = useParams();
  const [contractGroup, setContractGroup] = useState<
    ContractGroup | null | undefined
  >(null);
  useEffect(() => {
    setContractGroup(null);
    (async () => {
      const gr = await getCachedTokenContracts(firstRef || "");
      if (gr) {
        setContractGroup(gr);
      } else {
        setContractGroup(undefined);
      }
    })();
  }, []);

  return (
    <>
      <Box bg="bg.300" borderBottom="1px solid" borderBottomColor="whiteAlpha.50">
        <Container maxW="container.lg">
          <Flex
            justifyContent="space-between"
            h={{ base: "64px", md: "96px" }}
            alignItems="center"
          >
            <Heading
              size={{ base: "md", md: "lg" }}
              fontWeight="500"
              flexGrow={1}
            >
              {contractGroup === undefined
                ? "Unknown token"
                : (contractGroup?.glyph.payload.ticker as string) || ""}
            </Heading>
            <IconButton
              icon={<Icon as={LuRefreshCw} />}
              aria-label="Refresh list"
              display={{ base: "flex", md: "none" }}
              variant="ghost"
              size="sm"
            />
            <Button
              as={Link}
              to="/tokens"
              leftIcon={<ArrowBackIcon />}
              display={{ base: "none", md: "flex" }}
              variant="outline"
              size="sm"
            >
              Back
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
        {contractGroup && (
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
                  <Th>#</Th>
                  <Th>Location</Th>
                  <Th isNumeric>Claimed</Th>
                  <Th></Th>
                </Tr>
              </Thead>
              <Tbody>
                {contractGroup &&
                  contractGroup.contracts.map((contract, num) => (
                    <ContractRow
                      key={contract.contractRef}
                      contract={contract}
                      num={num}
                    />
                  ))}
              </Tbody>
            </Table>
          </Box>
        )}
      </Container>
    </>
  );
}
