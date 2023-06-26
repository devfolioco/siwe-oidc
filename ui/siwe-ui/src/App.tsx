import devfolioLogoFull from './assets/devfolio-logo-full.svg';
import signInWithEthereum from './assets/sign-in-ethereum.svg';
import ethereumLogo from './assets/ethereum-logo.svg';

function App() {
  return (
    <div className="bg-white md:bg-gray-bg h-full w-full flex flex-col items-center font-nunito justify-start">
      <img
        src={devfolioLogoFull}
        alt="Devfolio logo"
        height={36}
        width={174}
        className="mt-10 h-[27px] w-[135px] md:h-[36px] md:w-[174px] md:mt-16"
      />
      <div className="w-full md:w-[476px] bg-white md:rounded-2xl md:shadow-blue-1 pt-2 md:pt-8 p-8 mt-10">
        <h1 className=" text-2xl font-extrabold text-black">
          Sign in with Ethereum
        </h1>
        <p className="mt-1 text-base font-normal text-gray-7">
          Continue below to sign to Devfolio
        </p>

        <div className="flex flex-col mt-6 w-full justify-center">
          <img
            src={signInWithEthereum}
            alt="An illustration showing a wallet linking"
            height="191"
            width="191"
            className="mx-auto"
          />

          <div className="mt-8 flex flex-col gap-4">
            <button className="bg-white rounded-lg px-8 py-3 h-14 border border-solid border-gray-3 text-lg font-bold text-gray-8 flex items-center justify-center gap-2 hover:bg-blue-0 hover:border-blue-1 active:border-blue-1 active:bg-blue-0 active:shadow-inner">
              <img
                src={ethereumLogo}
                alt="Ethereum Logo"
                height={24}
                width={24}
                className=" max-h-6 max-w-6"
              />
              Continue with Ethereum
            </button>
            <div className=" text-sm text-gray-6 text-center">
              By continuing you agree to the&nbsp;
              <a
                href="https://devfolio.co/terms-of-use"
                target="_blank"
                rel="noreferrer noopener"
              >
                Terms of Use
              </a>&nbsp;
              and&nbsp;
              <a
                href="https://devfolio.co/privacy-policy"
                target="_blank"
                rel="noreferrer noopener"
              >
                Privacy Policy
              </a>
              .
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
