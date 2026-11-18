import bs58 from "bs58";
import nacl from "tweetnacl";
import { describe, expect, it } from "vitest";
import { createKeeper, verifyMessage } from "../src/lib/proof/keeper";
import { connectWallet, walletChain } from "../src/lib/proof/walletStandard";

const DEVNET = "solana:devnet";

function standardWallet(
  options: {
    keeper?: ReturnType<typeof createKeeper>;
    signer?: ReturnType<typeof createKeeper>;
    accounts?: { address: string; publicKey: Uint8Array; chains: string[] }[];
    chains?: string[];
  } = {},
) {
  const keeper = options.keeper ?? createKeeper();
  const signer = options.signer ?? keeper;
  const account = { address: keeper.address, publicKey: keeper.publicKey, chains: [DEVNET] };
  const accounts = options.accounts ?? [account];
  return {
    name: "Test Sigil",
    chains: options.chains ?? [DEVNET],
    accounts,
    features: {
      "standard:connect": { connect: async () => ({ accounts }) },
      "solana:signMessage": {
        signMessage: async (...inputs: { message: Uint8Array; account: unknown }[]) =>
          inputs.map((input) => ({
            signedMessage: input.message,
            signature: nacl.sign.detached(input.message, signer.secretKey),
          })),
      },
    },
  };
}

describe("wallet-standard signing", () => {
  it("names the chain the way wallets do", () => {
    expect(walletChain("devnet")).toBe("solana:devnet");
    expect(walletChain("mainnet-beta")).toBe("solana:mainnet");
    expect(walletChain("testnet")).toBe("solana:testnet");
  });

  it("connects, signs the exact bytes, and verifies against the wallet key", async () => {
    const keeper = createKeeper();
    const wallet = await connectWallet(standardWallet({ keeper }), "devnet");
    expect(wallet.address).toBe(keeper.address);
    const signature = await wallet.sign("vesper.vigil.v2\nkeeper=…");
    expect(bs58.decode(signature)).toHaveLength(64);
    expect(verifyMessage("vesper.vigil.v2\nkeeper=…", signature, keeper.address)).toBe(true);
  });

  it("refuses a wallet with no account on the configured cluster", async () => {
    const wallet = standardWallet({ accounts: [], chains: ["solana:mainnet"] });
    await expect(connectWallet(wallet, "devnet")).rejects.toThrow(/no account/);
  });

  it("refuses a signature the wallet's own key cannot verify", async () => {
    const keeper = createKeeper();
    const stranger = createKeeper();
    const wallet = await connectWallet(standardWallet({ keeper, signer: stranger }), "devnet");
    await expect(wallet.sign("a sealed message")).rejects.toThrow(/did not match its own key/);
  });

  it("refuses a wallet that cannot sign", async () => {
    const keeper = createKeeper();
    const wallet = standardWallet({ keeper });
    delete (wallet.features as Record<string, unknown>)["solana:signMessage"];
    await expect(connectWallet(wallet, "devnet")).rejects.toThrow(/cannot sign/);
  });
});
