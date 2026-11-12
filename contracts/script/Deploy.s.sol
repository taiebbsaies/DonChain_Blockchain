// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {DonationReceipt} from "../src/DonationReceipt.sol";
import {CampaignFactory} from "../src/CampaignFactory.sol";

/// @notice Déploie le registre, le reçu SBT et la fabrique, puis écrit `deployments/<chainId>.json`.
/// @dev Variables d'environnement :
///      USDC_ADDRESS     USDC natif du réseau (Base Sepolia : 0x036CbD53842c5426634e7929541eC2318f3dCF7e)
///      ADMIN_ADDRESS    multisig Safe qui administre registre et reçu (jamais une EOA en production)
///      GRACE_PERIOD, CHALLENGE_PERIOD   en secondes (défauts : 7 jours, 3 jours)
///      SECOND_APPROVAL_THRESHOLD        montant USDC (6 décimales) exigeant deux auditeurs (défaut : 10 000 USDC ; 0 = désactivé)
///      DISPUTE_DEPOSIT                  caution USDC (6 décimales) pour contester (défaut : 10 USDC)
///      TIMELOCK_DELAY   si > 0, l'administration passe par un TimelockController (§9.3) dont le Safe est
///                       seul proposant/exécutant, avec ce délai en secondes (production : 172800 = 48 h).
///                       Le Safe garde PAUSER_ROLE en direct : la pause d'urgence ne doit pas attendre.
///
///      forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --verify --account <keystore>
contract Deploy is Script {
    struct Config {
        IERC20 usdc;
        address safe;
        uint64 grace;
        uint64 challenge;
        uint256 secondApprovalThreshold;
        uint256 disputeDeposit;
        uint256 timelockDelay;
    }

    /// @notice Point d'entrée `forge script` : lit la configuration dans l'environnement (.env).
    function run()
        external
        returns (AttestationRegistry registry, DonationReceipt receipt, CampaignFactory factory, address admin)
    {
        Config memory
            c = Config({
            usdc: IERC20(vm.envAddress("USDC_ADDRESS")),
            safe: vm.envAddress("ADMIN_ADDRESS"),
            grace: uint64(vm.envOr("GRACE_PERIOD", uint256(7 days))),
            challenge: uint64(vm.envOr("CHALLENGE_PERIOD", uint256(3 days))),
            secondApprovalThreshold: vm.envOr("SECOND_APPROVAL_THRESHOLD", uint256(10_000e6)),
            disputeDeposit: vm.envOr("DISPUTE_DEPOSIT", uint256(10e6)),
            timelockDelay: vm.envOr("TIMELOCK_DELAY", uint256(0))
        });
        return deploy(c, vm.envOr("WRITE_DEPLOYMENT", true));
    }

    /// @notice Déploiement à partir d'une configuration explicite (utilisé par les tests, sans variables d'environnement).
    function deploy(Config memory c, bool writeDeployment)
        public
        returns (AttestationRegistry registry, DonationReceipt receipt, CampaignFactory factory, address admin)
    {
        require(c.safe != address(0), "ADMIN_ADDRESS manquant");
        uint256 startBlock = block.number;

        vm.startBroadcast();
        // Adresse qui signe réellement les transactions (--account / --private-key)
        (, address deployer,) = vm.readCallers();

        admin = c.safe;
        if (c.timelockDelay > 0) {
            address[] memory roles = new address[](1);
            roles[0] = c.safe;
            // admin = address(0) : le timelock s'administre lui-même, aucun contournement possible
            admin = address(new TimelockController(c.timelockDelay, roles, roles, address(0)));
        }

        // Le déployeur administre temporairement registre et reçu, le temps de câbler la fabrique
        // et la pause d'urgence, puis transfère l'administration et renonce à ses rôles.
        registry = new AttestationRegistry(deployer);
        receipt = new DonationReceipt(deployer);
        factory = new CampaignFactory(
            c.usdc, registry, receipt, c.grace, c.challenge, c.secondApprovalThreshold, c.disputeDeposit
        );

        bytes32 adminRole = receipt.DEFAULT_ADMIN_ROLE();
        receipt.grantRole(adminRole, address(factory));
        registry.grantRole(registry.PAUSER_ROLE(), c.safe);

        if (admin != deployer) {
            receipt.grantRole(adminRole, admin);
            receipt.renounceRole(adminRole, deployer);
            registry.grantRole(adminRole, admin);
            registry.renounceRole(adminRole, deployer);
        }
        vm.stopBroadcast();

        if (writeDeployment) {
            _writeDeployment(c.usdc, registry, receipt, factory, admin, startBlock);
        }

        console.log("AttestationRegistry", address(registry));
        console.log("DonationReceipt    ", address(receipt));
        console.log("CampaignFactory    ", address(factory));
        console.log("Admin (Safe/Timelock)", admin);
    }

    function _writeDeployment(
        IERC20 usdc,
        AttestationRegistry registry,
        DonationReceipt receipt,
        CampaignFactory factory,
        address admin,
        uint256 startBlock
    ) internal {
        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeUint(key, "startBlock", startBlock);
        vm.serializeAddress(key, "usdc", address(usdc));
        vm.serializeAddress(key, "registry", address(registry));
        vm.serializeAddress(key, "receipt", address(receipt));
        vm.serializeAddress(key, "admin", admin);
        string memory json = vm.serializeAddress(key, "factory", address(factory));
        vm.writeJson(json, string.concat("./deployments/", vm.toString(block.chainid), ".json"));
    }
}
