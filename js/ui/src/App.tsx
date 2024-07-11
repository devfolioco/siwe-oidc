import React from "react";
import Cookies from "js-cookie";
import { ConnectKitButton, ConnectKitProvider } from "connectkit";
import { SiweMessage } from "siwe";
import { useAccount, useChainId, useDisconnect, useSignMessage } from "wagmi";
import { useCountdown } from "usehooks-ts";

import devfolioLogoFull from "./assets/devfolio-logo-full.svg";
import connectWallet from "./assets/connect-wallet.svg";
import stepCheck from "./assets/step-check.svg";
import loader from "./assets/loader.svg";

type ACTION_TYPE = "signin" | "signup" | "connect";
type STEP_STAGE = "complete" | "incomplete";

const params = new URLSearchParams(window.location.search);
const nonce = params.get("nonce") ?? "";
const redirect = params.get("redirect_uri") ?? "";
const state = params.get("state") ?? "";
const oidc_nonce = params.get("oidc_nonce") ?? "";
const client_id = params.get("client_id") ?? "";
const action = (params.get("action") as ACTION_TYPE | undefined) ?? "signin";

const COUNTDOWN_IN_SECONDS = 3;

const TITLE: Record<ACTION_TYPE, string> = {
  signin: "Sign in with Ethereum",
  signup: "Sign up with Ethereum",
  connect: "Link your Ethereum Wallet",
};

const SIGNING_MESSAGE: Record<ACTION_TYPE, string> = {
  signin: `You are signing-in to Devfolio.`,
  signup: `You are signing-up to Devfolio.`,
  connect: `You are connecting your Ethereum Wallet to Devfolio.`,
};

const CONNECT_WALLET: Record<STEP_STAGE, { header: string; subText: string }> =
  {
    complete: {
      header: "Wallet connected",
      subText: " is successfully connected",
    },
    incomplete: {
      header: "Connect wallet",
      subText: "Go to your wallet app and accept the connection request",
    },
  };

const VERIFY_ADDRESS: Record<STEP_STAGE, { header: string; subText: string }> =
  {
    complete: {
      header: "Address verified",
      subText: "Your wallet address is verified",
    },
    incomplete: {
      header: "Verify address",
      subText: "Verify your address by signing a message",
    },
  };

const Step = ({
  isCompleted,
  isActive,
  number,
  header,
  subText,
  address,
}: {
  isCompleted: boolean;
  isActive: boolean;
  number: number;
  header: string;
  subText: string;
  address?: string;
}) => {
  return (
    <div
      className={`flex p-5 gap-5 justify-start items-center rounded-lg ${isActive ? "border-2 border-solid border-blue-3" : "border border-solid border-gray-3"}`}
    >
      {isCompleted ? (
        <img
          src={stepCheck}
          alt="Step Check"
          height={32}
          width={32}
          className=" max-h-8 max-w-8"
        />
      ) : (
        <div
          className={`flex justify-center items-center rounded-[32px] px-[13px] py-[8px] h-8 w-8 ${isActive ? "bg-blue-3" : "bg-gray-bg"}`}
        >
          <p
            className={`text-sm font-montserrat font-extrabold ${isActive ? "text-white" : "text-gray-6"}`}
          >
            {number}
          </p>
        </div>
      )}
      <div className="flex flex-col gap-1 justify-start items-start">
        <p className="text-lg text-gray-8 font-bold">{header}</p>
        <p className="text-base font-normal text-gray-7">
          {address ? `${address.substring(0, 6)}...${address.slice(-4)}` : ""}
          {subText}
        </p>
      </div>
    </div>
  );
};

function App() {
  let siweSessionTimeout: NodeJS.Timeout;
  let redirectTimeout: NodeJS.Timeout;

  const account = useAccount();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();

  const { signMessage: wagmiSignMessage } = useSignMessage({
    mutation: {
      onSuccess: (signature) => onVerifyAddressSuccess(signature),
    },
  });

  const [count, { startCountdown }] = useCountdown({
    countStart: COUNTDOWN_IN_SECONDS,
    intervalMs: 1000,
  });

  const [localSession, setLocalSession] = React.useState<{
    message: SiweMessage;
    raw: string;
    signature?: string;
  } | null>(null);

  const [isVerifyingAddress, setIsVerifyingAddress] =
    React.useState<boolean>(false);

  const [activeStepNumber, setActiveStepNumber] = React.useState<number>(1);

  const expirationTime = React.useMemo(() => {
    return new Date(
      new Date().getTime() + 2 * 24 * 60 * 60 * 1000, // 48h
    );
  }, []);

  // Clear all the timeout before closing the tab/app
  React.useEffect(() => {
    return () => {
      clearTimeout(siweSessionTimeout);
      clearTimeout(redirectTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onVerifyAddressSuccess = (signature?: string) => {
    if (
      !localSession?.message ||
      !localSession?.raw ||
      typeof signature !== "string" ||
      signature?.length === 0
    )
      return;

    // Start countdown for redirect
    startCountdown();
    setIsVerifyingAddress(false);

    setActiveStepNumber(3);

    siweSessionTimeout = setTimeout(
      () => {
        Cookies.set(
          "siwe",
          JSON.stringify({
            ...localSession,
            signature,
          }),
          {
            expires: expirationTime,
          },
        );
      },
      (COUNTDOWN_IN_SECONDS - 2) * 1000,
    );

    redirectTimeout = setTimeout(() => {
      window.location.replace(
        `/sign_in?redirect_uri=${encodeURI(redirect)}&state=${encodeURI(
          state,
        )}&client_id=${encodeURI(client_id)}${encodeURI(oidc_nonce)}`,
      );
    }, COUNTDOWN_IN_SECONDS * 1000);
  };

  const onWalletConnectSuccess = () => {
    setActiveStepNumber(2);
  };

  const handleSignInWithEthereum = async (e: React.MouseEvent) => {
    e.preventDefault();
    setIsVerifyingAddress(true);
    const address = account?.address;
    try {
      const signMessage = new SiweMessage({
        domain: window.location.host,
        address: address,
        chainId,
        expirationTime: expirationTime.toISOString(),
        uri: window.location.origin,
        version: "1",
        statement: SIGNING_MESSAGE[action],
        nonce,
        resources: [redirect],
      }).prepareMessage();

      wagmiSignMessage({
        account: account.address,
        message: signMessage,
      });

      const message = new SiweMessage(signMessage);

      setLocalSession({
        message,
        raw: signMessage,
      });

      return;
    } catch (e) {
      setIsVerifyingAddress(false);
      console.error(e);
    }
  };

  const handleChangeWallet = async (e: React.MouseEvent) => {
    e.preventDefault();
    await disconnect();
  };

  React.useEffect(() => {
    if (typeof account.address === "string" && activeStepNumber === 1) {
      onWalletConnectSuccess();
    }
  }, [account, activeStepNumber]);

  React.useEffect(() => {
    if (!account.isConnected) {
      setActiveStepNumber(1);
    }
  }, [account]);

  const walletConnectStage: STEP_STAGE =
    activeStepNumber === 1 ? "incomplete" : "complete";
  const verifyAddressStage: STEP_STAGE =
    activeStepNumber <= 2 ? "incomplete" : "complete";

  return (
    <div className="bg-white md:bg-gray-bg min-h-screen w-full flex flex-col items-center font-nunito justify-start">
      <img
        src={devfolioLogoFull}
        alt="Devfolio logo"
        height={36}
        width={174}
        className="mt-10 h-[27px] w-[135px] md:h-[36px] md:w-[174px] md:mt-16"
      />
      <div className="md:rounded-2xl md:w-[600px] bg-white md:shadow-[0px_1px_4px_rgba(3, 0, 92, 0.05)]  mt-10">
        <div className="h-full md:h-auto w-full md:rounded-t-2xl p-6 pt-2 md:pt-6 md:border-b border-solid border-gray-3 px-8 border-b-0">
          <h1 className="text-[22px] font-semibold text-gray-8">
            {TITLE[action]}
          </h1>
        </div>
        <div className="block md:invisible h-px bg-gray-3 w-5/6 mx-4" />
        <div className="h-full w-full md:w-[600px] bg-white md:rounded-b-2xl pt-2 md:pt-8 p-8 flex flex-col justify-between">
          <div className="flex flex-col mt-6 w-full justify-center">
            <img
              src={connectWallet}
              alt="An illustration showing a wallet linking"
              height="191"
              width="191"
              className="mx-auto"
            />

            <div className="flex flex-col gap-4 mt-8">
              <Step
                isActive={activeStepNumber === 1}
                isCompleted={walletConnectStage === "complete"}
                number={1}
                header={CONNECT_WALLET[walletConnectStage].header}
                subText={CONNECT_WALLET[walletConnectStage].subText}
                address={account.address}
              />
              <Step
                isActive={activeStepNumber === 2}
                isCompleted={verifyAddressStage === "complete"}
                number={2}
                header={VERIFY_ADDRESS[verifyAddressStage].header}
                subText={VERIFY_ADDRESS[verifyAddressStage].subText}
              />
            </div>
          </div>
          <div
            className={`flex flex-col w-full ${activeStepNumber === 2 ? "justify-between" : "justify-end"} gap-4 md:gap-0 md:flex-row  items-center mt-10`}
          >
            {activeStepNumber === 2 && (
              <>
                <p
                  onClick={handleChangeWallet}
                  role="button"
                  className="block md-max:hidden text-base underline text-gray-7"
                >
                  Change wallet
                </p>
                <button
                  onClick={handleSignInWithEthereum}
                  className={`flex w-full md:w-auto md:h-[42px] justify-center items-center px-6 py-2.5 border border-solid ${isVerifyingAddress ? "bg-blue-2 border-blue-2" : "bg-blue-4 border-blue-4B"} shadow-blue-1 rounded-lg gap-2`}
                >
                  {isVerifyingAddress && (
                    <img
                      src={loader}
                      alt="Step Check"
                      height={16}
                      width={16}
                      className="max-h-4 max-w-4 animate-spin"
                    />
                  )}
                  <p className="text-white text-bold text-base font-normal">
                    Verify address
                  </p>
                </button>
                <p
                  onClick={handleChangeWallet}
                  role="button"
                  className="block md:hidden text-base underline text-gray-7"
                >
                  Change wallet
                </p>
              </>
            )}
            {activeStepNumber === 1 && (
              <ConnectKitProvider
                theme="soft"
                debugMode
                customTheme={{
                  "--ck-font-family": '"Nunito Sans", sans-serif',
                  "--ck-primary-button-font-weight": 700,
                  "--ck-modal-heading-font-weight": 800,
                  "--ck-secondary-button-font-weight": 600,
                }}
              >
                <ConnectKitButton.Custom>
                  {({ show, isConnecting }) => (
                    <button
                      onClick={show}
                      className={`flex w-full md:w-auto md:h-[42px] justify-center items-center px-6 py-2.5 border border-solid ${isConnecting ? "bg-blue-2 border-blue-2" : "bg-blue-4 border-blue-4B"}  shadow-blue-1 rounded-lg gap-2`}
                    >
                      {isConnecting && (
                        <img
                          src={loader}
                          alt="Step Check"
                          height={16}
                          width={16}
                          className="max-h-4 max-w-4 animate-spin"
                        />
                      )}
                      <p className="text-white text-bold text-base font-normal">
                        Connect wallet
                      </p>
                    </button>
                  )}
                </ConnectKitButton.Custom>
              </ConnectKitProvider>
            )}
            {activeStepNumber === 3 && (
              <button
                onClick={handleSignInWithEthereum}
                className="flex w-full md:w-auto md:h-[42px] justify-center items-center px-6 py-2.5 bg-white border border-solid border-gray-3 rounded-lg"
              >
                <p className="text-blue-7 font-bold">
                  Redirecting in ({count}s)
                </p>
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="block md-max:hidden w-[600px] h-[1px] bg-gray-3 mt-10 " />
      <div className=" w-[600px] flex md-max:hidden justify-between items-center mt-8 mb-2">
        <p className="text-base text-gray-6">
          © {new Date().getFullYear()}, NSB Classic PTE LTD
        </p>
        <div className="w-auto flex justify-stretch items-center gap-4">
          <a
            href="https://devfolio.co/terms-of-use"
            target="_blank"
            rel="noreferrer noopener"
            className="text-base text-gray-6 font-normal"
          >
            Terms
          </a>
          <a
            href="https://devfolio.co/privacy-policy"
            target="_blank"
            rel="noreferrer noopener"
            className="text-base text-gray-6 font-normal"
          >
            Privacy
          </a>
          <a
            href="mailto:hello@devfolio.co"
            target="_blank"
            rel="noreferrer noopener"
            className="text-base text-gray-6 font-normal"
          >
            Contact Us
          </a>
        </div>
      </div>
    </div>
  );
}

export default App;
