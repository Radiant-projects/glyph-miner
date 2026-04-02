import { extendTheme } from "@chakra-ui/react";

export const theme = extendTheme({
  config: {
    initialColorMode: "dark",
    useSystemColorMode: false,
  },
  sizes: {
    container: {
      xl: "1600px",
    },
  },
  styles: {
    global: () => ({
      body: {
        bg: "bg.200",
      },
    }),
  },
  fonts: {
    heading: `'Inter Variable', sans-serif`,
    body: `'Inter Variable', sans-serif`,
    ono: `'Source Code Pro Variable', monospace`,
  },
  components: {
    Input: {
      defaultProps: {
        variant: "filled",
        focusBorderColor: "lightGreen.A400",
      },
      baseStyle: { field: { borderRadius: "lg" } },
    },
    Textarea: {
      defaultProps: {
        variant: "filled",
        focusBorderColor: "lightGreen.A400",
      },
      baseStyle: { borderRadius: "lg" },
    },
    Select: {
      defaultProps: {
        variant: "filled",
        focusBorderColor: "lightGreen.A400",
      },
      baseStyle: { field: { borderRadius: "lg" } },
    },
    Code: {
      baseStyle: {
        bgColor: "bg.300",
        borderRadius: "md",
        px: 2,
      },
    },
    Alert: {
      baseStyle: { container: { borderRadius: "xl" } },
      variants: {
        subtle: {
          container: {
            "&[data-status='success']": { bg: "#1C4532EE" },
            "&[data-status='error']": { bg: "#C53030EE" },
            "&[data-status='warning']": { bg: "#C05621EE" },
            "&[data-status='info']": { bg: "#1A365DEE" },
          },
        },
      },
    },
    Button: {
      baseStyle: {
        transition: "all 0.15s ease",
        fontWeight: "semibold",
        borderRadius: "lg",
      },
      defaultProps: {
        colorScheme: "green",
      },
      variants: {
        solid: {
          bg: "lightGreen.A400",
          color: "gray.900",
          _hover: { bg: "lightGreen.A200", transform: "translateY(-1px)" },
          _active: { bg: "lightGreen.A700", transform: "translateY(0)" },
        },
        ghost: {
          _hover: { bg: "whiteAlpha.100" },
        },
        outline: {
          borderColor: "whiteAlpha.300",
          _hover: { bg: "whiteAlpha.100", borderColor: "lightGreen.A200" },
        },
      },
    },
    IconButton: {
      baseStyle: {
        borderRadius: "lg",
        transition: "all 0.15s ease",
      },
    },
    Table: {
      baseStyle: {
        th: {
          textTransform: "uppercase",
          fontSize: "xs",
          fontWeight: "bold",
          letterSpacing: "wider",
          color: "gray.400",
        },
        td: {
          fontSize: "sm",
        },
      },
    },
    Heading: {
      baseStyle: {
        fontWeight: "600",
        letterSpacing: "-0.02em",
      },
    },
    Modal: {
      baseStyle: {
        overlay: {
          bg: "blackAlpha.600",
          backdropFilter: "blur(24px)",
        },
        dialog: {
          mx: { base: 4, md: 0 },
          bgColor: "bg.200",
          borderRadius: "2xl",
          border: "1px solid",
          borderColor: "whiteAlpha.100",
        },
        body: {
          display: "flex",
          flexDirection: "column",
        },
      },
    },
  },
  colors: {
    gray: {
      50: "#F7F7F7",
      100: "#EDEDED",
      200: "#E2E2E2",
      300: "#CBCBCB",
      400: "#A0A0A0",
      500: "#717171",
      600: "#4A4A4A",
      700: "#2D2D2D",
      800: "#1A1A1A",
      900: "#171717",
    },
    lightBlue: {
      50: "#e1f5fe", 100: "#b3e5fc", 200: "#81d4fa",
      300: "#4fc3f7", 400: "#29b6f6", 500: "#03a9f4",
      600: "#039be5", 700: "#0288d1", 800: "#0277bd",
      900: "#01579b", A100: "#80d8ff", A200: "#40c4ff",
      A400: "#00b0ff", A700: "#0091ea",
    },
    lightGreen: {
      50: "#f1f8e9", 100: "#dcedc8", 200: "#c5e1a5",
      300: "#aed581", 400: "#9ccc65", 500: "#8bc34a",
      600: "#7cb342", 700: "#689f38", 800: "#558b2f",
      900: "#33691e", A100: "#ccff90", A200: "#b2ff59",
      A400: "#76ff03", A700: "#64dd17",
    },
    red: {
      50: "#ffebee", 100: "#ffcdd2", 200: "#ef9a9a",
      300: "#e57373", 400: "#ef5350", 500: "#f44336",
      600: "#e53935", 700: "#d32f2f", 800: "#c62828",
      900: "#b71c1c", A100: "#ff8a80", A200: "#ff5252",
      A400: "#ff1744", A700: "#d50000",
    },
    bg: {
      50: "#323238",
      100: "#2a2a30",
      200: "#222228",
      300: "#1c1c22",
      400: "#16161b",
    },
  },
});
