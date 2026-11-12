// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {DonationReceipt} from "../src/DonationReceipt.sol";
import {DonationVault} from "../src/DonationVault.sol";
import {MilestoneTracker} from "../src/MilestoneTracker.sol";
import {CampaignFactory} from "../src/CampaignFactory.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// @dev Fixture commune : registre, reçu, fabrique, acteurs attestés et une campagne par défaut.
abstract contract BaseTest is Test {
    uint64 constant GRACE = 7 days;
    uint64 constant CHALLENGE = 3 days;
    uint256 constant SOFT_CAP = 1_000e6;
    uint256 constant HARD_CAP = 5_000e6;
    uint256 constant MIN_DONATION = 1e6;
    uint64 constant FUNDING_DURATION = 30 days;

    /// @dev Paramètres Phase 2 de la fabrique ; les suites dérivées peuvent les modifier avant super.setUp().
    uint256 secondApprovalThreshold;
    uint256 disputeDeposit;

    MockUSDC usdc;
    AttestationRegistry registry;
    DonationReceipt receipt;
    CampaignFactory factory;
    DonationVault vault;
    MilestoneTracker tracker;

    address admin = makeAddr("admin");
    address org = makeAddr("org");
    address auditor = makeAddr("auditor");
    address auditor2 = makeAddr("auditor2");
    address arbiter = makeAddr("arbiter");
    address pauser = makeAddr("pauser");
    address supplier;
    uint256 supplierPk;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public virtual {
        (supplier, supplierPk) = makeAddrAndKey("supplier");

        usdc = new MockUSDC();
        registry = new AttestationRegistry(admin);
        receipt = new DonationReceipt(admin);
        factory =
            new CampaignFactory(usdc, registry, receipt, GRACE, CHALLENGE, secondApprovalThreshold, disputeDeposit);

        vm.startPrank(admin);
        receipt.grantRole(receipt.DEFAULT_ADMIN_ROLE(), address(factory));
        registry.grantRole(registry.ORG_ROLE(), org);
        registry.grantRole(registry.SUPPLIER_ROLE(), supplier);
        registry.grantRole(registry.AUDITOR_ROLE(), auditor);
        registry.grantRole(registry.AUDITOR_ROLE(), auditor2);
        registry.grantRole(registry.ARBITER_ROLE(), arbiter);
        registry.grantRole(registry.PAUSER_ROLE(), pauser);
        vm.stopPrank();

        (vault, tracker) = _createCampaign(true);

        usdc.mint(alice, 100_000e6);
        usdc.mint(bob, 100_000e6);
    }

    function _createCampaign(bool sequential) internal returns (DonationVault v, MilestoneTracker t) {
        vm.prank(org);
        (, v, t) = factory.createCampaign(
            CampaignFactory.CampaignParams({
                softCap: SOFT_CAP,
                hardCap: HARD_CAP,
                minDonation: MIN_DONATION,
                fundingDeadline: uint64(block.timestamp) + FUNDING_DURATION,
                sequential: sequential,
                metadataURI: "ipfs://campaign"
            })
        );
    }

    function _donate(address donor, uint256 amount) internal {
        vm.startPrank(donor);
        usdc.approve(address(vault), amount);
        vault.donate(amount);
        vm.stopPrank();
    }

    /// @dev Dons puis passage de la deadline : la campagne est Active si softCap atteint.
    function _fundAndClose(uint256 aliceAmount, uint256 bobAmount) internal {
        if (aliceAmount > 0) _donate(alice, aliceAmount);
        if (bobAmount > 0) _donate(bob, bobAmount);
        vm.warp(vault.fundingDeadline());
    }

    function _sign(uint256 pk, uint256 id, uint256 sigDeadline) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, tracker.confirmDigest(id, sigDeadline));
        return abi.encodePacked(r, s, v);
    }

    function _createAndLock(uint256 amount) internal returns (uint256 id) {
        vm.startPrank(org);
        id = tracker.createMilestone(supplier, amount, uint64(block.timestamp + 30 days), "ipfs://desc");
        tracker.lockMilestone(id);
        vm.stopPrank();
    }

    /// @dev Jalon verrouillé, preuve soumise, livraison confirmée et approuvé par l'auditeur.
    function _approvedMilestone(uint256 amount) internal returns (uint256 id) {
        id = _createAndLock(amount);
        vm.prank(org);
        tracker.submitProof(id, "bafyproof");
        tracker.confirmDelivery(id, block.timestamp + 1 hours, _sign(supplierPk, id, block.timestamp + 1 hours));
        vm.prank(auditor);
        tracker.approve(id);
    }
}
