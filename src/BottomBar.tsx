import { Box, Container, Flex } from "@chakra-ui/react";
import Balance from "./Balance";
import ConnectionStatus from "./ConnectionStatus";

// Bottom bar is only shown on mobile since not everything can fit in the top bar
export default function BottomBar() {
  return (
    <Box
      bg="bg.400"
      position="fixed"
      width="100vw"
      bottom={0}
      display={{ base: "block", md: "none" }}
      borderTop="1px solid"
      borderTopColor="whiteAlpha.100"
      backdropFilter="blur(12px)"
    >
      <Container
        maxW="container.lg"
        as={Flex}
        alignItems="center"
        justifyContent="right"
        py={2}
      >
        <ConnectionStatus />
        <Box
          color="lightGreen.A200"
          bgColor="whiteAlpha.100"
          px={3}
          py={1}
          mr={2}
          fontSize="sm"
          fontWeight="semibold"
          borderRadius="lg"
        >
          Balance: <Balance />
        </Box>
      </Container>
    </Box>
  );
}
