// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {DonationReceipt} from "../src/DonationReceipt.sol";
import {DonationVault} from "../src/DonationVault.sol";
import {MilestoneTracker} from "../src/MilestoneTracker.sol";
import {CampaignFactory} from "../src/CampaignFactory.sol";
import {MockUSDC} from "../test/mocks/MockUSDC.sol";

/// @notice Déploiement de démonstration sur anvil (LOCAL UNIQUEMENT).
/// @dev Utilise les comptes déterministes d'anvil :
///      0 admin/pauser, 1 organisation, 2 prestataire, 3 auditeur, 4-7 donateurs,
///      8 second auditeur (double validation), 9 arbitre (contestations).
///      Écrit les adresses dans `deployments/31337.json` pour le frontend.
///
///      anvil
///      forge script script/LocalDemo.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
contract LocalDemo is Script {
    string constant MNEMONIC = "test test test test test test test test test test test junk";

    uint256 adminPk;
    uint256 orgPk;
    uint256 supplierPk;
    uint256 auditorPk;
    uint256[4] donorPks;

    MockUSDC usdc;
    CampaignFactory factory;

    function run() external {
        require(block.chainid == 31337, "LocalDemo: anvil only");

        adminPk = vm.deriveKey(MNEMONIC, 0);
        orgPk = vm.deriveKey(MNEMONIC, 1);
        supplierPk = vm.deriveKey(MNEMONIC, 2);
        auditorPk = vm.deriveKey(MNEMONIC, 3);
        for (uint32 i; i < 4; i++) {
            donorPks[i] = vm.deriveKey(MNEMONIC, 4 + i);
        }
        address admin = vm.addr(adminPk);
        uint256 startBlock = block.number;

        // ---------------- Infrastructure ----------------
        vm.startBroadcast(adminPk);
        usdc = new MockUSDC();
        AttestationRegistry registry = new AttestationRegistry(admin);
        DonationReceipt receipt = new DonationReceipt(admin);
        // Phase 2 : double validation à partir de 2 000 USDC, caution de contestation de 10 USDC
        factory = new CampaignFactory(usdc, registry, receipt, 7 days, 3 days, 2_000e6, 10e6);
        receipt.grantRole(receipt.DEFAULT_ADMIN_ROLE(), address(factory));

        registry.grantRole(registry.ORG_ROLE(), vm.addr(orgPk));
        registry.grantRole(registry.SUPPLIER_ROLE(), vm.addr(supplierPk));
        registry.grantRole(registry.AUDITOR_ROLE(), vm.addr(auditorPk));
        registry.grantRole(registry.PAUSER_ROLE(), admin);
        registry.grantRole(registry.AUDITOR_ROLE(), vm.addr(vm.deriveKey(MNEMONIC, 8)));
        registry.grantRole(registry.ARBITER_ROLE(), vm.addr(vm.deriveKey(MNEMONIC, 9)));

        for (uint256 i; i < 4; i++) {
            usdc.mint(vm.addr(donorPks[i]), 10_000e6);
        }
        vm.stopBroadcast();

        // ---------------- Campagne A : collecte en cours ----------------
        (DonationVault vaultA,) = _createCampaign(
            unicode"Eau potable : puits à Kasserine",
            unicode"Forage et équipement d'un puits pour trois écoles rurales.",
            5_000e6,
            20_000e6,
            30 days
        );
        _donate(vaultA, 0, 1_200e6);
        _donate(vaultA, 1, 800e6);

        // ---------------- Campagne B : active, jalon approuvé (fenêtre de contestation) ----------------
        (DonationVault vaultB, MilestoneTracker trackerB) = _createCampaign(
            "Fournitures scolaires 2026",
            unicode"Cartables, cahiers et manuels pour 300 élèves.",
            2_000e6,
            3_000e6,
            20 days
        );
        _donate(vaultB, 0, 1_500e6);
        _donate(vaultB, 1, 1_000e6);
        _donate(vaultB, 2, 500e6); // hardCap atteint : campagne Active

        uint256 b0 = _createMilestone(trackerB, 1_200e6, "Achat des cahiers et manuels", "Devis Librairie Centrale");
        _lockAndSubmit(trackerB, b0, "ipfs://bafkreidemo-facture-librairie");
        _confirm(trackerB, b0);
        vm.broadcast(auditorPk);
        trackerB.approve(b0);
        _createMilestone(trackerB, 1_500e6, "Achat des cartables", "Devis Maroquinerie du Sud");

        // ---------------- Campagne C : active, preuve soumise en attente du prestataire ----------------
        (DonationVault vaultC, MilestoneTracker trackerC) = _createCampaign(
            unicode"Clinique mobile : Siliana",
            unicode"Location d'un véhicule médicalisé pour 6 mois.",
            1_000e6,
            1_500e6,
            15 days
        );
        _donate(vaultC, 2, 1_000e6);
        _donate(vaultC, 3, 500e6);

        uint256 c0 = _createMilestone(trackerC, 1_000e6, unicode"Location du véhicule (3 mois)", "Contrat de location");
        _lockAndSubmit(trackerC, c0, "ipfs://bafkreidemo-contrat-location");

        // ---------------- Sortie pour le frontend ----------------
        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeUint(key, "startBlock", startBlock);
        vm.serializeAddress(key, "usdc", address(usdc));
        vm.serializeAddress(key, "registry", address(registry));
        vm.serializeAddress(key, "receipt", address(receipt));
        string memory json = vm.serializeAddress(key, "factory", address(factory));
        vm.writeJson(json, "./deployments/31337.json");

        console.log("MockUSDC           ", address(usdc));
        console.log("AttestationRegistry", address(registry));
        console.log("DonationReceipt    ", address(receipt));
        console.log("CampaignFactory    ", address(factory));
        console.log("Org      (account 1)", vm.addr(orgPk));
        console.log("Supplier (account 2)", vm.addr(supplierPk));
        console.log("Auditor  (account 3)", vm.addr(auditorPk));
        console.log("Donors   (accounts 4-7) hold 10,000 mUSDC each");
        console.log("Auditor2 (account 8)", vm.addr(vm.deriveKey(MNEMONIC, 8)));
        console.log("Arbiter  (account 9)", vm.addr(vm.deriveKey(MNEMONIC, 9)));
        console.log("Second approval from 2,000 USDC; dispute deposit 10 USDC");
    }

    // ------------------------------------------------------------------

    function _createCampaign(
        string memory name,
        string memory description,
        uint256 softCap,
        uint256 hardCap,
        uint64 duration
    ) internal returns (DonationVault vault, MilestoneTracker tracker) {
        string memory metadata = string.concat('{"name":"', name, '","description":"', description, '"}');
        vm.broadcast(orgPk);
        (, vault, tracker) = factory.createCampaign(
            CampaignFactory.CampaignParams({
                softCap: softCap,
                hardCap: hardCap,
                minDonation: 1e6,
                fundingDeadline: uint64(block.timestamp) + duration,
                sequential: true,
                metadataURI: _dataUri(metadata)
            })
        );
    }

    function _donate(DonationVault vault, uint256 donor, uint256 amount) internal {
        vm.startBroadcast(donorPks[donor]);
        usdc.approve(address(vault), amount);
        vault.donate(amount);
        vm.stopBroadcast();
    }

    function _createMilestone(MilestoneTracker tracker, uint256 amount, string memory title, string memory quote)
        internal
        returns (uint256 id)
    {
        string memory doc = string.concat('{"title":"', title, '","quote":"', quote, '"}');
        vm.broadcast(orgPk);
        id = tracker.createMilestone(vm.addr(supplierPk), amount, uint64(block.timestamp + 45 days), _dataUri(doc));
    }

    function _lockAndSubmit(MilestoneTracker tracker, uint256 id, string memory cid) internal {
        vm.startBroadcast(orgPk);
        tracker.lockMilestone(id);
        tracker.submitProof(id, cid);
        vm.stopBroadcast();
    }

    function _confirm(MilestoneTracker tracker, uint256 id) internal {
        uint256 sigDeadline = block.timestamp + 1 days;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(supplierPk, tracker.confirmDigest(id, sigDeadline));
        vm.broadcast(supplierPk);
        tracker.confirmDelivery(id, sigDeadline, abi.encodePacked(r, s, v));
    }

    function _dataUri(string memory json) internal pure returns (string memory) {
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }
}
