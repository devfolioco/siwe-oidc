import React from "react";
import ReactDOM from "react-dom/client";
import { WagmiProvider, createConfig, fallback, http } from "wagmi";
import { getDefaultConfig } from "connectkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mainnet } from "wagmi/chains";

import App from "./App";
import "./index.css";

const config = createConfig(
  getDefaultConfig({
    walletConnectProjectId: process.env.WALLET_CONNECT_ID ?? "",
    chains: [mainnet],
    transports: {
      [mainnet.id]: fallback([
        http(
          `https://mainnet.infura.io/v3/${process.env.INFURA_ID ?? ""}`,
        ),
        http(), // public fallback
      ]),
    },

    // Required
    appName: "SIWE | Devfolio",
    appUrl: "https://devfolio.co", // your app's url
    appIcon: "https://siwe.devfolio.co/favicon.png", // your app's logo,no bigger than 1024x1024px (max. 1MB)
  }),
);

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
);
