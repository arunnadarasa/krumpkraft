/**
 * Example deploy script for KrumpKraftMod (run with tsx or compile to JS)
 * Requires: STORY_RPC_URL, ADMIN_PRIVATE_KEY, USDC_K_ADDRESS
 *
 * npx tsx contracts/deploy/deploy.ts
 * Or with Foundry: forge create --rpc-url $STORY_RPC_URL --private-key $ADMIN_KEY \
 *   src/KrumpKraftMod.sol:KrumpKraftMod --constructor-args $(cast abi-encode "constructor(address)" $USDC_K_ADDRESS)
 */

async function main() {
  const rpc = process.env.STORY_RPC_URL || 'https://aeneid.storyrpc.io';
  const usdcK = process.env.USDC_K_ADDRESS || '0xd35890acdf3BFFd445C2c7fC57231bDE5cAFbde5';
  console.log('Deploy KrumpKraftMod to', rpc, 'with USDC.k', usdcK);
  console.log('Using Foundry: forge create contracts/KrumpKraftMod.sol:KrumpKraftMod --rpc-url', rpc, '--private-key $ADMIN_KEY --constructor-args', usdcK);
}

main().catch(console.error);
