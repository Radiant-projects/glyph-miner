import { useRef } from "react";
import { Link } from "react-router-dom";
import { useSignals } from "@preact/signals-react/runtime";
import {
  Container,
  Input,
  IconButton,
  Flex,
  Icon,
  Box,
  Text,
  Button,
  useToast,
} from "@chakra-ui/react";
import { BsGpuCard } from "react-icons/bs";
import { Search2Icon, SettingsIcon } from "@chakra-ui/icons";
import { FaPlay, FaStop } from "react-icons/fa6";
import { TbPick, TbListDetails } from "react-icons/tb";
import TokenDetails from "../TokenDetails";
import miner from "../miner";
import Hashrate from "../Hashrate";
import Messages from "../Messages";
import Accepted from "../Accepted";
import {
  balance,
  contract,
  gpu,
  mineToAddress,
  miningEnabled,
  miningStatus,
  selectedContract,
  work,
} from "../signals";
import { changeToken } from "../blockchain";
import Rejected from "../Rejected";
import TopBar from "../TopBar";
import "../initGpu";
import "../initWallet";
import "../index.css";
import { addMessage } from "../message";
import BottomBar from "../BottomBar";
import { isRef } from "../utils";
import { ServerStatus, serverStatus } from "../client";

export default function Miner() {
  useSignals();
  const toast = useToast();

  const { start, stop } = miner;
  const refInput = useRef<HTMLInputElement>(null);

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const ref = (refInput.current?.value as string) || "";
    if (!isRef(ref)) {
      toast({
        status: "error",
        description: "Please enter a valid contract address",
        variant: "subtle",
      });
      return;
    }
    console.debug("Changing token");
    if (miningStatus.value !== "ready") {
      addMessage({ type: "stop" });
    }
    stop();
    changeToken(ref);
  };

  const startMining = () => {
    console.debug("Start mining");
    if (!contract.value) {
      return;
    }

    if (work.value) {
      addMessage({ type: "start" });
      miningEnabled.value = true;
      start();
    } else {
      console.log("Invalid work");
    }
  };

  const stopMining = async () => {
    miningEnabled.value = false;
    if (miningStatus.value !== "ready" && miningStatus.value !== "stop") {
      await stop();
      addMessage({ type: "stop" });
      console.log("Stopped miner");
    }
  };

  const gpuSupported = navigator.gpu && gpu.value !== undefined;
  const reward = Number(contract.value?.reward || 0) / 100000000;
  const canStart =
    contract.value !== undefined &&
    contract.value.height < contract.value.maxHeight &&
    balance.value > 0.01 + reward &&
    mineToAddress.value &&
    serverStatus.value === ServerStatus.CONNECTED;

  return (
    <>
      <TopBar />
      <BottomBar />
      <Box bg="bg.300" mt="56px" borderBottom="1px solid" borderBottomColor="whiteAlpha.50">
        <Container maxW="container.lg">
          <form onSubmit={onSubmit}>
            <Flex gap={3} mx="auto" py={4}>
              <IconButton
                display={{ base: "flex", sm: "none" }}
                as={Link}
                to="/tokens"
                icon={<Icon as={TbListDetails} />}
                aria-label="Contract list"
                variant="outline"
              />
              <Button
                display={{ base: "none", sm: "flex" }}
                as={Link}
                to="/tokens"
                leftIcon={<Icon as={TbListDetails} />}
                aria-label="Contract list"
                variant="outline"
              >
                Contracts
              </Button>
              <Input
                width="auto"
                flexGrow={1}
                type="text"
                placeholder="Enter token contract address"
                ref={refInput}
                defaultValue={selectedContract.value}
              />
              <IconButton
                icon={<Search2Icon />}
                aria-label="Search"
                type="submit"
              />
            </Flex>
          </form>
        </Container>
      </Box>
      <Container maxW="container.lg">
        {gpuSupported && (
          <Flex
            bg="bg.100"
            py={3}
            px={4}
            mt={4}
            alignItems="center"
            justifyContent="space-between"
            gap={4}
            borderRadius="xl"
            border="1px solid"
            borderColor="whiteAlpha.50"
          >
            <Icon as={BsGpuCard} boxSize={6} color="lightGreen.A200" />
            <Box flexGrow={1} fontSize="sm" fontWeight="medium">{gpu.value}</Box>
            <Box fontSize="sm" fontWeight="semibold" color="lightGreen.A200">
              <Hashrate />
            </Box>
            {miningEnabled.value ? (
              <IconButton
                onClick={stopMining}
                icon={<Icon as={FaStop} color="red.400" />}
                aria-label="Stop mining"
                variant="ghost"
                size="sm"
              />
            ) : (
              <IconButton
                onClick={startMining}
                isDisabled={!canStart}
                icon={
                  <Icon
                    as={FaPlay}
                    color={canStart ? "lightGreen.A200" : undefined}
                  />
                }
                aria-label="Start mining"
                variant="ghost"
                size="sm"
              />
            )}
          </Flex>
        )}

        <TokenDetails />

        {gpuSupported ? (
          <>
            {mineToAddress.value ? (
              <>
                <Flex
                  bg="bg.100"
                  p={4}
                  mt={3}
                  alignItems="center"
                  justifyContent="space-between"
                  gap={4}
                  flexWrap={{ base: "wrap", md: "initial" }}
                  borderRadius="xl"
                  border="1px solid"
                  borderColor="whiteAlpha.50"
                >
                  <Flex flexGrow={1} wordBreak="break-all" alignItems="center" fontSize="sm">
                    <Icon as={TbPick} boxSize={5} color="gray.400" mr={2} />
                    <Text>Mine to</Text>
                    <Text
                      bgColor="whiteAlpha.100"
                      as="span"
                      px={2}
                      py={0.5}
                      ml={2}
                      borderRadius="md"
                      fontFamily="Source Code Pro Variable, monospace"
                      fontSize="xs"
                    >
                      {mineToAddress.value}
                    </Text>
                  </Flex>
                  <Box
                    borderRight="1px solid"
                    borderRightColor="whiteAlpha.200"
                    pr={4}
                    fontSize="sm"
                  >
                    Accepted:{" "}
                    <Text as="b" color="lightGreen.A200">
                      <Accepted />
                    </Text>
                  </Box>
                  <Box fontSize="sm">
                    Rejected:{" "}
                    <Text as="b" color="red.400">
                      <Rejected />
                    </Text>
                  </Box>
                </Flex>
                <Box
                  mt={3}
                  mb={8}
                  bgColor="bg.400"
                  p={3}
                  px={4}
                  borderRadius="xl"
                  border="1px solid"
                  borderColor="whiteAlpha.50"
                  fontSize="sm"
                >
                  <Messages />
                </Box>
              </>
            ) : (
              <Flex direction="column" alignItems="center" my={24}>
                <Text fontSize="x-large" mb={4} fontWeight="medium">
                  Please configure the miner and fund the wallet
                </Text>
                <Button as={Link} leftIcon={<SettingsIcon />} to="/settings">
                  Settings
                </Button>
              </Flex>
            )}
          </>
        ) : (
          <Flex direction="column" alignItems="center" my={24}>
            <Icon as={BsGpuCard} width={16} height={16} mb={4} color="gray.500" />
            <Text fontSize="x-large" mb={2} fontWeight="medium">
              No GPU found
            </Text>
            <Text textAlign="center" color="gray.400">
              Please check your browser supports WebGPU
            </Text>
          </Flex>
        )}
      </Container>
    </>
  );
}
