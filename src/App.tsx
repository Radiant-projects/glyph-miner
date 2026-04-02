import { Link, Outlet } from "react-router-dom";
import { Center, ChakraBaseProvider, Container } from "@chakra-ui/react";
import { theme } from "./theme";
import "./initGpu";
import "./initWallet";
import "./index.css";

export default function App() {
  return (
    <ChakraBaseProvider theme={theme}>
      <Outlet />
      <Container maxW="container.lg" mb={2} mt={4}>
        <Center fontSize="xs" textAlign="center" mb={1} color="gray.500">
          <Link to="/license">
            Glyph Miner is distributed under the terms of the MIT License
          </Link>
        </Center>
        <Center fontSize="xs" textAlign="center" color="gray.600">
          v{APP_VERSION}
        </Center>
      </Container>
    </ChakraBaseProvider>
  );
}
