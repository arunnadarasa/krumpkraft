// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/KrumpKraftMod.sol";

contract DeployScript is Script {
    function run() external {
        address usdcK = vm.envOr("USDC_K_ADDRESS", address(0xd35890acdf3BFFd445C2c7fC57231bDE5cAFbde5));
        require(usdcK != address(0), "USDC_K_ADDRESS");
        uint256 deployerPrivateKey = vm.envUint("ADMIN_PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);
        KrumpKraftMod mod = new KrumpKraftMod(usdcK);
        vm.stopBroadcast();
        console.log("KrumpKraftMod deployed at", address(mod));
    }
}
