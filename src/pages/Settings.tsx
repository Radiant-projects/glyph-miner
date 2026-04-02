import { CloseIcon } from "@chakra-ui/icons";
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Center,
  Code,
  Container,
  Flex,
  FormControl,
  FormHelperText,
  FormLabel,
  Heading,
  IconButton,
  Input,
  Select,
  Textarea,
  useClipboard,
  useToast,
} from "@chakra-ui/react";
import { QRCodeSVG } from "qrcode.react";
import { useReducer, useState } from "react";
import { CheckIcon, CopyIcon } from "@chakra-ui/icons";
import { useSignals } from "@preact/signals-react/runtime";
import {
  autoReseed,
  contractsUrl,
  hideMessages,
  mineToAddress,
  miningStatus,
  mintMessage,
  servers,
  useIndexerApi,
  wallet,
} from "../signals";
import Balance from "../Balance";
import { Script } from "@radiantblockchain/radiantjs";
import { Link } from "react-router-dom";
import { connect } from "../client";
import { sweepWallet } from "../sweep";

const parseServers = (value: string): string[] =>
  value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

export default function Settings() {
  useSignals();
  const [showMnemonic, setShowMnemonic] = useState(false);
  const { onCopy, hasCopied } = useClipboard(wallet.value?.address || "");
  const toast = useToast();
  const onClickSweep = async () => {
    const result = await sweepWallet();
    if (result.success) {
      toast({
        status: "success",
        description: `All coins sent to ${mineToAddress.value} (txid: ${result.txid})`,
        variant: "subtle",
        duration: 10000,
        isClosable: true,
      });
    } else {
      toast({
        status: "error",
        description: `Broadcast failed${
          result.reason ? ` (${result.reason})` : ""
        }`,
        variant: "subtle",
      });
    }
  };

  const [error, setError] = useState("");
  const formReducer = (
    state: { [key: string]: string },
    event: { name: string; value: string }
  ) => {
    return { ...state, [event.name]: event.value };
  };
  const [form, setForm] = useReducer(formReducer, {
    mineToAddress: mineToAddress.value,
    mintMessage: mintMessage.value,
    hideMessages: hideMessages.value ? "1" : "",
    autoReseed: autoReseed.value ? "1" : "",
    servers: servers.value.join("\n"),
    contractsUrl: contractsUrl.value,
    useIndexerApi: useIndexerApi.value ? "1" : "",
  });
  const onFormChange = ({
    target: { name, value },
  }: React.ChangeEvent<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >) => {
    setForm({ name, value });
  };

  const moveServer = (index: number, direction: -1 | 1) => {
    const list = parseServers(form.servers);
    const target = index + direction;
    if (target < 0 || target >= list.length) {
      return;
    }

    [list[index], list[target]] = [list[target], list[index]];
    setForm({ name: "servers", value: list.join("\n") });
  };

  const serverList = parseServers(form.servers);

  const onSave = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      Script.buildPublicKeyHashOut(form.mineToAddress).toHex();
    } catch {
      setError("Invalid address");
      return;
    }
    if (form.mineToAddress === wallet.value?.address) {
      setError("Cannot mine to temporary wallet");
      return;
    }

    const serversArray = parseServers(form.servers);

    // Check if server has changed and reconnect
    const didChangeServer = serversArray[0] !== servers.value[0];

    mineToAddress.value = form.mineToAddress;
    mintMessage.value = form.mintMessage;
    hideMessages.value = form.hideMessages === "1";
    autoReseed.value = form.autoReseed === "1";
    contractsUrl.value = form.contractsUrl;
    useIndexerApi.value = form.useIndexerApi === "1";
    servers.value = serversArray;

    localStorage.setItem("mineToAddress", form.mineToAddress);
    localStorage.setItem("mintMessage", form.mintMessage);
    localStorage.setItem("hideMessages", form.hideMessages);
    localStorage.setItem("autoReseed", form.autoReseed);
    localStorage.setItem("servers", JSON.stringify(serversArray));
    localStorage.setItem("contractsUrl", form.contractsUrl);
    localStorage.setItem("useIndexerApi", form.useIndexerApi);

    // Update work
    if (miningStatus.value === "mining") {
      miningStatus.value = "change";
    }

    if (didChangeServer) {
      console.debug("Server changed, reconnecting");
      connect(true);
    }

    toast({
      status: "success",
      description: "Saved",
      variant: "subtle",
    });
  };

  return (
    <>
      <Box bg="bg.300" borderBottom="1px solid" borderBottomColor="whiteAlpha.50">
        <Container maxW="container.lg">
          <Flex
            justifyContent="space-between"
            h={{ base: "64px", md: "96px" }}
            alignItems="center"
          >
            <Heading size="lg" fontWeight="500">
              Settings
            </Heading>
            <IconButton
              icon={<CloseIcon />}
              as={Link}
              aria-label="Close"
              to="/"
              ml={4}
              variant="ghost"
              size="sm"
            />
          </Flex>
        </Container>
      </Box>
      <Container maxW="container.lg" py={6}>
        <Box
          bg="bg.100"
          p={6}
          mb={4}
          as="form"
          onSubmit={onSave}
          borderRadius="2xl"
          border="1px solid"
          borderColor="whiteAlpha.50"
        >
          {error && (
            <Alert status="error" mb={4} borderRadius="xl">
              {error}
            </Alert>
          )}
          <FormControl mb={5} isRequired>
            <FormLabel fontWeight="semibold" fontSize="sm">Mine to address</FormLabel>
            <Input
              name="mineToAddress"
              defaultValue={form.mineToAddress}
              onChange={onFormChange}
            />
            <FormHelperText fontSize="xs">
              Radiant address to send mined tokens to
            </FormHelperText>
          </FormControl>
          <FormControl mb={5}>
            <FormLabel fontWeight="semibold" fontSize="sm">Mint message</FormLabel>
            <Input
              name="mintMessage"
              defaultValue={form.mintMessage}
              maxLength={80}
              onChange={onFormChange}
            />
            <FormHelperText fontSize="xs">Written on-chain on successful mint</FormHelperText>
          </FormControl>
          <FormControl mb={5}>
            <FormLabel fontWeight="semibold" fontSize="sm">Hide messages from other miners</FormLabel>
            <Select
              name="hideMessages"
              defaultValue={form.hideMessages}
              onChange={onFormChange}
              title="Hide messages from other miners"
            >
              <option value="">No</option>
              <option value="1">Yes</option>
            </Select>
          </FormControl>
          <FormControl mb={5}>
            <FormLabel fontWeight="semibold" fontSize="sm">Auto-reseed nonce space</FormLabel>
            <Select
              name="autoReseed"
              defaultValue={form.autoReseed}
              onChange={onFormChange}
              title="Automatically reseed work entropy"
            >
              <option value="1">Yes (continue mining)</option>
              <option value="">No (stop after full nonce space)</option>
            </Select>
            <FormHelperText fontSize="xs">
              When enabled, miner mutates mint-message entropy and continues after exhausting 32-bit nonce space.
            </FormHelperText>
          </FormControl>
          <FormControl mb={5}>
            <FormLabel fontWeight="semibold" fontSize="sm">Servers</FormLabel>
            <Textarea
              name="servers"
              value={form.servers}
              onChange={onFormChange}
              rows={3}
            ></Textarea>
            <Box mt={2}>
              {serverList.map((server, index) => (
                <Flex key={`${server}-${index}`} align="center" gap={2} mb={2}>
                  <Code flex="1" fontSize="xs" p={2}>
                    {server}
                  </Code>
                  <Button
                    type="button"
                    size="xs"
                    onClick={() => moveServer(index, -1)}
                    isDisabled={index === 0}
                  >
                    Up
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    onClick={() => moveServer(index, 1)}
                    isDisabled={index === serverList.length - 1}
                  >
                    Down
                  </Button>
                </Flex>
              ))}
            </Box>
            <FormHelperText fontSize="xs">
              List of servers in order of preference (top is tried first)
            </FormHelperText>
          </FormControl>
          <FormControl mb={5}>
            <FormLabel fontWeight="semibold" fontSize="sm">Use RXinDexer API</FormLabel>
            <Select
              name="useIndexerApi"
              defaultValue={form.useIndexerApi}
              onChange={onFormChange}
              title="Use RXinDexer API for contract discovery"
            >
              <option value="1">Yes (recommended)</option>
              <option value="">No (use fallback URL)</option>
            </Select>
            <FormHelperText fontSize="xs">
              Fetch contracts from RXinDexer dMint API. Falls back to URL if unavailable.
            </FormHelperText>
          </FormControl>
          <FormControl mb={5}>
            <FormLabel fontWeight="semibold" fontSize="sm">Contracts URL (fallback)</FormLabel>
            <Input
              name="contractsUrl"
              defaultValue={form.contractsUrl}
              onChange={onFormChange}
            />
            <FormHelperText fontSize="xs">
              Used when RXinDexer API is disabled or unavailable
            </FormHelperText>
          </FormControl>
          <Center>
            <Button type="submit" size="lg" px={12}>Save</Button>
          </Center>
        </Box>

        <Box
          bg="bg.100"
          p={6}
          mb={4}
          borderRadius="2xl"
          border="1px solid"
          borderColor="whiteAlpha.50"
        >
          {wallet.value ? (
            <>
              <Alert status="warning" borderRadius="xl">
                <AlertIcon />
                <Box fontSize="sm">
                  <b>
                    This is a temporary wallet that is not password protected.
                  </b>{" "}
                  Do not send more coins than necessary for paying transaction
                  fees. You must sweep any remaining funds when you are finished
                  mining.
                </Box>
              </Alert>
              <Flex direction="column" alignItems="center" mt={6}>
                <Heading fontSize="md" mb={2}>Temporary Address</Heading>
                <Box>
                  <Code fontSize="xs">{wallet.value.address}</Code>
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
                </Box>
                <Box bgColor="white" p={2} mt={3} borderRadius="lg">
                  <QRCodeSVG size={128} value={wallet.value.address} />
                </Box>
                <Heading fontSize="md" mt={5}>
                  Balance
                </Heading>
                <Balance /> RXD
                <Heading fontSize="md" mt={5}>
                  Recovery phrase:
                </Heading>
                <Box
                  textAlign="center"
                  p={3}
                  mt={2}
                  borderWidth="1px"
                  borderColor="whiteAlpha.200"
                  borderRadius="xl"
                  alignSelf="stretch"
                >
                  {showMnemonic ? (
                    wallet.value.mnemonic.split(" ").map((word, i) => (
                      <>
                        <Code key={i}>{word}</Code>{" "}
                      </>
                    ))
                  ) : (
                    <Button onClick={() => setShowMnemonic(true)} variant="outline" size="sm">Show</Button>
                  )}
                </Box>
              </Flex>
            </>
          ) : (
            <Alert status="error" borderRadius="xl">
              <AlertIcon />
              No wallet found
            </Alert>
          )}
        </Box>

        <Box
          bg="bg.100"
          p={6}
          borderRadius="2xl"
          border="1px solid"
          borderColor="whiteAlpha.50"
        >
          <Heading size="md" mb={4}>Sweep</Heading>
          <Box my={4} fontSize="sm">
            Sweeping will send all coins to your address:{" "}
            <Code fontSize="xs">{mineToAddress.value || "no address set"}</Code>
          </Box>
          <Center>
            <Button
              mr={3}
              onClick={onClickSweep}
              disabled={!mineToAddress.value}
            >
              Sweep
            </Button>
          </Center>
        </Box>
      </Container>
    </>
  );
}
