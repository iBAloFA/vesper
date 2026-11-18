import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("VesperSigils", (module) => {
  const sigils = module.contract("VesperSigils");
  return { sigils };
});
