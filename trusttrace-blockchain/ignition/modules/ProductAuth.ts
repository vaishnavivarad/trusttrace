import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("ProductAuthModule", (m) => {
  const productAuth = m.contract("ProductAuth");

  return { productAuth };
});