// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {DonationReceipt} from "../src/DonationReceipt.sol";
import {CampaignFactory} from "../src/CampaignFactory.sol";

/// @notice Déploie le registre, le reçu SBT et la fabrique.
/// @dev Variables d'environnement :
///      USDC_ADDRESS   USDC natif du réseau (Base Sepolia : 0x036CbD53842c5426634e7929541eC2318f3dCF7e)
///      ADMIN_ADDRESS  multisig Safe qui administre registre et reçu (jamais une EOA en production)
///      GRACE_PERIOD, CHALLENGE_PERIOD  en secondes (défauts : 7 jours, 3 jours)
///
///      forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --verify
contract Deploy is Script {
    function run() external returns (AttestationRegistry registry, DonationReceipt receipt, CampaignFactory factory) {
        IERC20 usdc = IERC20(vm.envAddress("USDC_ADDRESS"));
        address admin = vm.envAddress("ADMIN_ADDRESS");
        uint64 grace = uint64(vm.envOr("GRACE_PERIOD", uint256(7 days)));
        uint64 challenge = uint64(vm.envOr("CHALLENGE_PERIOD", uint256(3 days)));

        vm.startBroadcast();
        address deployer = msg.sender;

        registry = new AttestationRegistry(admin);

        // Le déployeur administre temporairement le reçu pour y autoriser la fabrique,
        // puis transfère l'administration au multisig et renonce à son rôle.
        receipt = new DonationReceipt(deployer);
        factory = new CampaignFactory(usdc, registry, receipt, grace, challenge);

        bytes32 adminRole = receipt.DEFAULT_ADMIN_ROLE();
        receipt.grantRole(adminRole, address(factory));
        if (admin != deployer) {
            receipt.grantRole(adminRole, admin);
            receipt.renounceRole(adminRole, deployer);
        }
        vm.stopBroadcast();

        console.log("AttestationRegistry", address(registry));
        console.log("DonationReceipt    ", address(receipt));
        console.log("CampaignFactory    ", address(factory));
    }
}
