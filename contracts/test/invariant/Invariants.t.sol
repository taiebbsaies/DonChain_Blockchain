// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {BaseTest} from "../Base.t.sol";
import {DonationVault} from "../../src/DonationVault.sol";
import {MilestoneTracker} from "../../src/MilestoneTracker.sol";
import {MockUSDC} from "../mocks/MockUSDC.sol";

/// @dev Pilote aléatoirement une campagne : dons, temps, jalons, expiration, clôture, remboursements.
contract Handler is Test {
    MockUSDC usdc;
    DonationVault vault;
    MilestoneTracker tracker;
    address org;
    address auditor;
    uint256 supplierPk;
    address supplier;

    address[] public donors;

    uint256 public ghostDeposits;
    uint256 public ghostReleased;
    uint256 public ghostRefunded;
    mapping(uint256 => uint256) public releaseCount;
    uint256 public maxReleaseCount;
    uint256 public ghostDepositsHeld; // cautions de contestation en cours, détenues par le tracker
    address public arbiter;

    constructor(
        MockUSDC usdc_,
        DonationVault vault_,
        MilestoneTracker tracker_,
        address org_,
        address auditor_,
        uint256 supplierPk_
    ) {
        usdc = usdc_;
        vault = vault_;
        tracker = tracker_;
        org = org_;
        auditor = auditor_;
        supplierPk = supplierPk_;
        supplier = vm.addr(supplierPk_);
        for (uint256 i; i < 5; i++) {
            address d = makeAddr(string.concat("donor", vm.toString(i)));
            donors.push(d);
            usdc_.mint(d, 1_000_000e6);
            vm.prank(d);
            usdc_.approve(address(tracker_), type(uint256).max); // caution de contestation
        }
    }

    function donate(uint256 seed, uint256 amount) external {
        if (vault.state() != DonationVault.State.Funding) return;
        uint256 room = vault.hardCap() - vault.totalRaised();
        if (room < vault.minDonation()) return;
        amount = bound(amount, vault.minDonation(), room);
        address d = donors[seed % donors.length];

        vm.startPrank(d);
        usdc.approve(address(vault), amount);
        vault.donate(amount);
        vm.stopPrank();
        ghostDeposits += amount;
    }

    function setArbiter(address arbiter_) external {
        arbiter = arbiter_;
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1, 20 days));
    }

    /// @dev Exécute un jalon complet jusqu'à la libération.
    function runMilestone(uint256 amount) external {
        if (vault.state() != DonationVault.State.Active || tracker.activeCount() != 0) return;
        uint256 available = vault.totalRaised() - tracker.committed();
        if (available == 0) return;
        amount = bound(amount, 1, available);

        vm.startPrank(org);
        uint256 id = tracker.createMilestone(supplier, amount, uint64(block.timestamp + 30 days), "ipfs://d");
        tracker.lockMilestone(id);
        tracker.submitProof(id, "bafy");
        vm.stopPrank();

        uint256 dl = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(supplierPk, tracker.confirmDigest(id, dl));
        tracker.confirmDelivery(id, dl, abi.encodePacked(r, s, v));

        vm.prank(auditor);
        tracker.approve(id);
        vm.warp(block.timestamp + tracker.challengePeriod());
        tracker.executeRelease(id);

        ghostReleased += amount;
        releaseCount[id]++;
        if (releaseCount[id] > maxReleaseCount) maxReleaseCount = releaseCount[id];
    }

    /// @dev Tente de relibérer un jalon déjà payé : doit toujours échouer.
    function rerelease(uint256 id) external {
        uint256 n = tracker.milestoneCount();
        if (n == 0) return;
        id = id % n;
        try tracker.executeRelease(id) {
            releaseCount[id]++;
            if (releaseCount[id] > maxReleaseCount) maxReleaseCount = releaseCount[id];
        } catch {}
    }

    /// @dev Verrouille un jalon puis le laisse expirer : campagne Halted.
    function lockAndExpire(uint256 amount) external {
        if (vault.state() != DonationVault.State.Active || tracker.activeCount() != 0) return;
        uint256 available = vault.totalRaised() - tracker.committed();
        if (available == 0) return;
        amount = bound(amount, 1, available);

        vm.startPrank(org);
        uint256 id = tracker.createMilestone(supplier, amount, uint64(block.timestamp + 1 days), "ipfs://e");
        tracker.lockMilestone(id);
        vm.stopPrank();

        vm.warp(block.timestamp + 1 days + tracker.gracePeriod() + 1);
        tracker.expire(id);
    }

    /// @dev Jalon approuvé, contesté par un donateur, puis tranché (retenu ou rejeté) ou laissé expirer.
    function disputeMilestone(uint256 amount, uint256 seed, uint8 outcome) external {
        if (vault.state() != DonationVault.State.Active || tracker.activeCount() != 0) return;
        uint256 available = vault.totalRaised() - tracker.committed();
        if (available == 0) return;
        amount = bound(amount, 1, available);
        address d = donors[seed % donors.length];
        if (vault.donations(d) == 0) return;

        vm.startPrank(org);
        uint256 id = tracker.createMilestone(supplier, amount, uint64(block.timestamp + 30 days), "ipfs://x");
        tracker.lockMilestone(id);
        tracker.submitProof(id, "bafy");
        vm.stopPrank();
        uint256 dl = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(supplierPk, tracker.confirmDigest(id, dl));
        tracker.confirmDelivery(id, dl, abi.encodePacked(r, s, v));
        vm.prank(auditor);
        tracker.approve(id);

        vm.prank(d);
        tracker.openDispute(id, "contestation");
        ghostDepositsHeld += tracker.disputeDeposit();

        outcome = outcome % 3;
        if (outcome == 2) return; // laissée ouverte : `expireDisputes` pourra la faire expirer

        vm.prank(arbiter);
        tracker.resolveDispute(id, outcome == 0, "decision");
        ghostDepositsHeld -= tracker.getDispute(id).deposit;
        if (outcome == 1) {
            vm.warp(block.timestamp + tracker.challengePeriod());
            tracker.executeRelease(id);
            ghostReleased += amount;
            releaseCount[id]++;
            if (releaseCount[id] > maxReleaseCount) maxReleaseCount = releaseCount[id];
        }
    }

    /// @dev Fait expirer les contestations jamais tranchées (caution rendue, campagne Halted).
    function expireDisputes() external {
        uint256 n = tracker.milestoneCount();
        for (uint256 id; id < n; id++) {
            MilestoneTracker.Milestone memory m = tracker.getMilestone(id);
            if (m.status != MilestoneTracker.Status.Disputed) continue;
            if (block.timestamp <= uint256(m.deadline) + tracker.gracePeriod()) {
                vm.warp(uint256(m.deadline) + tracker.gracePeriod() + 1);
            }
            tracker.expire(id);
            ghostDepositsHeld -= tracker.getDispute(id).deposit;
        }
    }

    function close() external {
        if (vault.state() != DonationVault.State.Active || tracker.activeCount() != 0) return;
        vm.prank(org);
        tracker.closeCampaign();
    }

    function refund(uint256 seed) external {
        address d = donors[seed % donors.length];
        uint256 amount = vault.refundableOf(d);
        if (amount == 0) return;
        vm.prank(d);
        vault.refund();
        ghostRefunded += amount;
    }
}

contract InvariantsTest is BaseTest {
    Handler handler;

    function setUp() public override {
        disputeDeposit = 5e6;
        super.setUp();
        handler = new Handler(usdc, vault, tracker, org, auditor, supplierPk);
        handler.setArbiter(arbiter);
        targetContract(address(handler));
    }

    /// @notice Somme des libérations + remboursements ≤ somme des dépôts (§9.7).
    function invariant_OutflowsNeverExceedDeposits() public view {
        assertLe(vault.totalReleased() + vault.totalRefunded(), vault.totalRaised());
        assertEq(vault.totalRaised(), handler.ghostDeposits());
        assertEq(vault.totalReleased(), handler.ghostReleased());
        assertEq(vault.totalRefunded(), handler.ghostRefunded());
    }

    /// @notice Le solde du coffre couvre exactement les fonds restant dus (§9.7).
    function invariant_VaultBalanceCoversOwed() public view {
        assertEq(usdc.balanceOf(address(vault)), vault.totalRaised() - vault.totalReleased() - vault.totalRefunded());
    }

    /// @notice Un jalon n'est libéré qu'une seule fois (§8.2).
    function invariant_MilestoneReleasedAtMostOnce() public view {
        assertLe(handler.maxReleaseCount(), 1);
    }

    /// @notice Le tracker ne détient que les cautions des contestations en cours (Phase 2).
    function invariant_TrackerHoldsOnlyOpenDeposits() public view {
        assertEq(usdc.balanceOf(address(tracker)), handler.ghostDepositsHeld());
    }

    /// @notice Les engagements ne dépassent jamais le total collecté (§4.3).
    function invariant_CommittedWithinRaised() public view {
        assertLe(tracker.committed(), vault.totalRaised());
    }
}
