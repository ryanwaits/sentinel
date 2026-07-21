// Real c32-checksum contract-id validation via the published @secondlayer/stacks SDK — not a
// hand-rolled regex. Covers all 4 Stacks address versions (SP/SM mainnet single-/multi-sig,
// ST/SN testnet single-/multi-sig) and validates the actual checksum, not just prefix+length.
import {
  AddressVersion,
  addressToVersion,
  isClarityName,
  parseContractId,
  validateStacksAddress,
} from "@secondlayer/stacks/utils"

export function isValidContractId(value: string): boolean {
  try {
    const [address, name] = parseContractId(value.trim())
    return validateStacksAddress(address) && isClarityName(name)
  } catch {
    return false
  }
}

const MAINNET_VERSIONS = new Set<number>([
  AddressVersion.MainnetSingleSig,
  AddressVersion.MainnetMultiSig,
])

/** Network derived from the address version (mirrors the backend `networkOf`): SP/SM = mainnet,
 *  ST/SN = testnet. null for an empty or invalid id. Devnet shares testnet's address space and is
 *  never inferred here. */
export function networkOf(value: string): "mainnet" | "testnet" | null {
  try {
    const [address] = parseContractId(value.trim())
    if (!validateStacksAddress(address)) return null
    return MAINNET_VERSIONS.has(addressToVersion(address)) ? "mainnet" : "testnet"
  } catch {
    return null
  }
}
