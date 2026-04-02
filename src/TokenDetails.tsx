import { Box, Flex, Icon, Image, Spinner, Text } from "@chakra-ui/react";
import { FaQuestionCircle } from "react-icons/fa";
import { MAX_TARGET } from "./pow";
import { glyph, contract, loadingContract } from "./signals";
import { PropsWithChildren } from "react";
import { useSignals } from "@preact/signals-react/runtime";

export function TokenImage({ type, file }: { type: string; file: Uint8Array }) {
  // Create a proper copy of the data to avoid SharedArrayBuffer issues
  const data = new Uint8Array(file);
  const blob = new Blob([data], { type });
  const src = URL.createObjectURL(blob);
  return <Image w={6} h={6} objectFit="contain" src={src} />;
}

function TextRow({ children }: PropsWithChildren) {
  return (
    <Flex
      bg="bg.100"
      mt={3}
      p={4}
      alignItems="center"
      justifyContent="center"
      minHeight="56px"
      textAlign="center"
      borderRadius="xl"
      border="1px solid"
      borderColor="whiteAlpha.50"
    >
      {children}
    </Flex>
  );
}

export default function TokenDetails() {
  useSignals();
  if (loadingContract.value) {
    return (
      <TextRow>
        <Spinner mr={2} color="lightGreen.A200" />
        Loading
      </TextRow>
    );
  }

  if (!glyph.value || !contract.value) {
    return (
      <TextRow>
        No mining contract loaded. Enter a contract address or select a contract
        from the list.
      </TextRow>
    );
  }

  const { target, height, maxHeight, reward } = contract.value;

  const file = glyph.value.files.main;
  const type = file?.t || "";
  const hasImage = type?.startsWith("image/") && file?.b instanceof Uint8Array;
  const difficulty = MAX_TARGET / target;
  const ticker = (glyph.value.payload.ticker as string) || "???";

  return (
    <Flex
      bg="bg.100"
      mt={3}
      p={4}
      alignItems="center"
      justifyContent="center"
      gap={4}
      flexWrap={{ base: "wrap", md: "initial" }}
      borderRadius="xl"
      border="1px solid"
      borderColor="whiteAlpha.50"
    >
      {hasImage ? (
        <TokenImage type={type} file={file.b} />
      ) : (
        <Icon as={FaQuestionCircle} boxSize={6} color="gray.500" />
      )}
      <Text as="div" flexGrow={1} fontWeight="semibold">
        {ticker}
      </Text>
      <Box borderRight="1px solid" borderRightColor="whiteAlpha.200" pr={4}>
        Height: <b>{`${height} / ${maxHeight}`}</b>
      </Box>
      <Box borderRight="1px solid" borderRightColor="whiteAlpha.200" pr={4}>
        Reward:{" "}
        <b>
          {reward.toLocaleString()} {ticker.substring(0, 20)}
        </b>
      </Box>
      <div>
        Difficulty: <b>{`${difficulty}`}</b>
      </div>
    </Flex>
  );
}
