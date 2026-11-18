import { network } from "hardhat";

const { viem } = await network.create();
const sigils = await viem.deployContract("VesperSigils");

console.log(`VesperSigils deployed at ${sigils.address}`);
console.log(`Set VITE_SIGIL_CONTRACT=${sigils.address} and VITE_CHAIN_ID=<chain id> in the app build.`);
