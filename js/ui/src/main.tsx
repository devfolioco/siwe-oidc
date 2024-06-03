import React from "react";
import ReactDOM from "react-dom/client";
import { WagmiProvider, createConfig, http, fallback } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mainnet } from "wagmi/chains";
import { injected, coinbaseWallet, walletConnect } from "wagmi/connectors";
import { getDefaultConfig } from "connectkit";
import App from "./App";
import "./index.css";
const queryClient = new QueryClient();

const config = createConfig(
  getDefaultConfig({
    // Required API Keys
    // infuraId: process.env.INFURA_ID,

    walletConnectProjectId: process.env.WALLET_CONNECT_ID ?? "",

    // Required
    appName: "SIWE | Devfolio",
    appUrl: "https://devfolio.co", // your app's url
    appIcon: "https://siwe.devfolio.co/favicon.png", // your app's logo,no bigger than 1024x1024px (max. 1MB)
    // autoConnect: false,
    connectors: [
      injected({ target: "metaMask" }),
      coinbaseWallet({
        appName: "SIWE | Devfolio",
        appLogoUrl: "https://siwe.devfolio.co/favicon.png",
        headlessMode: true,
        overrideIsMetaMask: false,
      }),
      walletConnect({
        showQrModal: false,
        projectId: process.env.WALLET_CONNECT_ID ?? "",
        metadata: {
          name: "SIWE | Devfolio",
          description: "Some description",
          url: "https://devfolio.co",
          icons: ["https://siwe.devfolio.co/favicon.png"],
        },
      }),
    ],

    chains: [mainnet],
    transports: {
      [mainnet.id]: fallback([
        http(`https://mainnet.infura.io/v3/${process.env.INFURA_ID}`),
        // http(`https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_ID}`),
        http(),
      ]),
    },
  })
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
