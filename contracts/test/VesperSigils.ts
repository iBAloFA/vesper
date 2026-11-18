import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";

const VIGIL_TYPES = {
  Vigil: [
    { name: "id", type: "bytes32" },
    { name: "keeper", type: "address" },
    { name: "startedAt", type: "string" },
    { name: "durationMin", type: "uint32" },
    { name: "seal", type: "bytes32" },
  ],
} as const;

const sigilId = `0x${"11".repeat(32)}` as const;
const seal = `0x${"ab".repeat(32)}` as const;
const startedAt = "1763000000000";

describe("VesperSigils", async function () {
  const { viem, networkHelpers } = await network.create();
  const [keeper, stranger] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();
  const chainId = await publicClient.getChainId();

  async function deployFixture() {
    const sigils = await viem.deployContract("VesperSigils");
    return { sigils };
  }

  type Sigil = Awaited<ReturnType<typeof deployFixture>>["sigils"];

  async function signVigil(
    sigils: Sigil,
    overrides: {
      signer?: (typeof keeper);
      id?: `0x${string}`;
      startedAt?: string;
      durationMin?: number;
      seal?: `0x${string}`;
    } = {},
  ) {
    const signer = overrides.signer ?? keeper;
    const message = {
      id: overrides.id ?? sigilId,
      keeper: signer.account.address,
      startedAt: overrides.startedAt ?? startedAt,
      durationMin: overrides.durationMin ?? 25,
      seal: overrides.seal ?? seal,
    };
    const signature = await signer.signTypedData({
      domain: { name: "Vesper", version: "1", chainId, verifyingContract: sigils.address },
      types: VIGIL_TYPES,
      primaryType: "Vigil",
      message,
    });
    return { message, signature };
  }

  type VigilMessage = Awaited<ReturnType<typeof signVigil>>["message"];

  const mintWith = (
    sigils: Sigil,
    message: VigilMessage,
    signature: `0x${string}`,
    account = keeper.account,
  ) => sigils.write.mint([message, signature], { account });

  it("deploys with the Vesper identity", async function () {
    const { sigils } = await networkHelpers.loadFixture(deployFixture);
    assert.equal(await sigils.read.name(), "Vesper Sigils");
    assert.equal(await sigils.read.symbol(), "VESPER");
    assert.equal(await sigils.read.totalSupply(), 0n);
  });

  it("mints a sigil from a valid keeper signature", async function () {
    const { sigils } = await networkHelpers.loadFixture(deployFixture);
    const { message, signature } = await signVigil(sigils);

    await viem.assertions.emitWithArgs(mintWith(sigils, message, signature), sigils, "SigilSealed", [
      1n,
      sigilId,
      keeper.account.address,
      seal,
    ]);

    assert.equal(await sigils.read.totalSupply(), 1n);
    assert.equal((await sigils.read.ownerOf([1n])).toLowerCase(), keeper.account.address.toLowerCase());
    assert.equal(await sigils.read.tokenOfSigil([sigilId]), 1n);
    assert.equal(await sigils.read.sealOf([1n]), seal);
    assert.equal(await sigils.read.durationOf([1n]), 25);
    assert.equal(await sigils.read.startedAtOf([1n]), startedAt);
    assert.equal(await sigils.read.tokenOfSigil([`0x${"22".repeat(32)}`]), 0n);
  });

  it("publishes an on-chain tokenURI with attributes and an SVG", async function () {
    const { sigils } = await networkHelpers.loadFixture(deployFixture);
    const { message, signature } = await signVigil(sigils);
    await mintWith(sigils, message, signature);

    const uri = await sigils.read.tokenURI([1n]);
    assert.ok(uri.startsWith("data:application/json;base64,"));
    const json = JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString("utf8"));

    assert.equal(json.name, "Vesper Sigil #1");
    assert.deepEqual(
      json.attributes.map((attribute: { trait_type: string }) => attribute.trait_type),
      ["Seal", "Duration", "Started", "Soulbound"],
    );
    assert.equal(json.attributes[0].value, seal);
    assert.equal(json.attributes[1].value, 25);

    assert.ok(json.image.startsWith("data:image/svg+xml;base64,"));
    const svg = Buffer.from(json.image.split(",")[1], "base64").toString("utf8");
    assert.match(svg, /^<svg/);
    assert.match(svg, /VESPER SIGIL #1/);
  });

  it("refuses to seal the same sigil twice", async function () {
    const { sigils } = await networkHelpers.loadFixture(deployFixture);
    const { message, signature } = await signVigil(sigils);
    await mintWith(sigils, message, signature);

    await viem.assertions.revertWithCustomErrorWithArgs(
      mintWith(sigils, message, signature),
      sigils,
      "AlreadySealed",
      [sigilId],
    );
  });

  it("refuses a mint from anyone other than the keeper", async function () {
    const { sigils } = await networkHelpers.loadFixture(deployFixture);
    const { message, signature } = await signVigil(sigils);

    await viem.assertions.revertWithCustomError(
      mintWith(sigils, message, signature, stranger.account),
      sigils,
      "KeeperMismatch",
    );
  });

  it("refuses a signature from another key", async function () {
    const { sigils } = await networkHelpers.loadFixture(deployFixture);
    const message = {
      id: sigilId,
      keeper: keeper.account.address,
      startedAt,
      durationMin: 25,
      seal,
    };
    const forged = await stranger.signTypedData({
      domain: { name: "Vesper", version: "1", chainId, verifyingContract: sigils.address },
      types: VIGIL_TYPES,
      primaryType: "Vigil",
      message,
    });

    await viem.assertions.revertWithCustomError(mintWith(sigils, message, forged), sigils, "KeeperMismatch");
  });

  it("validates the seal, duration and timestamp", async function () {
    const { sigils } = await networkHelpers.loadFixture(deployFixture);

    const zeroSeal = await signVigil(sigils, { seal: `0x${"00".repeat(32)}` });
    await viem.assertions.revertWithCustomError(mintWith(sigils, zeroSeal.message, zeroSeal.signature), sigils, "InvalidSeal");

    const zeroDuration = await signVigil(sigils, { durationMin: 0 });
    await viem.assertions.revertWithCustomError(
      mintWith(sigils, zeroDuration.message, zeroDuration.signature),
      sigils,
      "InvalidDuration",
    );

    const longDuration = await signVigil(sigils, { durationMin: 601 });
    await viem.assertions.revertWithCustomError(
      mintWith(sigils, longDuration.message, longDuration.signature),
      sigils,
      "InvalidDuration",
    );

    const badTimestamp = await signVigil(sigils, { startedAt: "12x3" });
    await viem.assertions.revertWithCustomError(
      mintWith(sigils, badTimestamp.message, badTimestamp.signature),
      sigils,
      "InvalidStartedAt",
    );
  });

  it("is soulbound: transfers and approvals always revert", async function () {
    const { sigils } = await networkHelpers.loadFixture(deployFixture);
    const { message, signature } = await signVigil(sigils);
    await mintWith(sigils, message, signature);

    await viem.assertions.revertWithCustomError(
      sigils.write.transferFrom([keeper.account.address, stranger.account.address, 1n], { account: keeper.account }),
      sigils,
      "Soulbound",
    );
    await viem.assertions.revertWithCustomError(
      sigils.write.safeTransferFrom([keeper.account.address, stranger.account.address, 1n], { account: keeper.account }),
      sigils,
      "Soulbound",
    );
    await viem.assertions.revertWithCustomError(
      sigils.read.approve([stranger.account.address, 1n]),
      sigils,
      "Soulbound",
    );
    await viem.assertions.revertWithCustomError(
      sigils.read.setApprovalForAll([stranger.account.address, true]),
      sigils,
      "Soulbound",
    );
  });

  it("reports locked sigils and rejects unknown tokens", async function () {
    const { sigils } = await networkHelpers.loadFixture(deployFixture);
    const { message, signature } = await signVigil(sigils);
    await mintWith(sigils, message, signature);

    assert.equal(await sigils.read.locked([1n]), true);
    await viem.assertions.revertWithCustomErrorWithArgs(sigils.read.locked([99n]), sigils, "UnknownToken", [99n]);
  });
});
