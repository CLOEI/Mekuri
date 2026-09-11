import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#83d4c8",
      light: "#b7eee5",
      dark: "#4ca89c",
      contrastText: "#0f1919",
    },
    background: {
      default: "#111718",
      paper: "#1a2021",
    },
    text: {
      primary: "#eef3f1",
      secondary: "#a6b4b1",
    },
    divider: "rgba(219, 239, 234, 0.11)",
  },
  typography: {
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h1: {
      fontSize: "clamp(1.55rem, 1.25rem + 0.8vw, 2.1rem)",
      fontWeight: 700,
      letterSpacing: "-0.035em",
    },
    h2: {
      fontSize: "1.2rem",
      fontWeight: 700,
      letterSpacing: "-0.02em",
    },
    body2: {
      lineHeight: 1.5,
    },
    button: {
      textTransform: "none",
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 14,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        "*": { boxSizing: "border-box" },
        html: { backgroundColor: "#111718" },
        body: { margin: 0, minWidth: 320, backgroundColor: "#111718" },
        "button, input": { font: "inherit" },
        "@media (prefers-reduced-motion: reduce)": {
          "*, *::before, *::after": {
            animationDuration: "0.01ms !important",
            animationIterationCount: "1 !important",
            transitionDuration: "0.01ms !important",
            scrollBehavior: "auto !important",
          },
        },
      },
    },
    MuiButtonBase: {
      defaultProps: { disableRipple: true },
    },
    MuiTooltip: {
      defaultProps: { arrow: true },
    },
  },
});
