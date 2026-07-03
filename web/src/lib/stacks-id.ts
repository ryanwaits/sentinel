// Real c32-checksum contract-id validation via the published @secondlayer/stacks SDK — not a
// hand-rolled regex. Covers all 4 Stacks address versions (SP/SM mainnet single-/multi-sig,
// ST/SN testnet single-/multi-sig) and validates the actual checksum, not just prefix+length.
import { isClarityName, parseContractId, validateStacksAddress } from "@secondlayer/stacks/utils"

export function isValidContractId(value: string): boolean {
  try {
    const [address, name] = parseContractId(value.trim())
    return validateStacksAddress(address) && isClarityName(name)
  } catch {
    return false
  }
}
