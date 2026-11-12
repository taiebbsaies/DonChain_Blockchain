// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseTest} from "./Base.t.sol";
import {DonationVault} from "../src/DonationVault.sol";
import {MilestoneTracker} from "../src/MilestoneTracker.sol";

/// @dev Phase 2 : contestation par les donateurs (§5.4, §5.5) et double validation au-delà d'un seuil.
contract DisputesTest is BaseTest {
    uint256 constant THRESHOLD = 1_000e6;
    uint256 constant DEPOSIT = 10e6;

    address carol = makeAddr("carol"); // non-donatrice

    function setUp() public override {
        secondApprovalThreshold = THRESHOLD;
        disputeDeposit = DEPOSIT;
        super.setUp();
        _fundAndClose(1_500e6, 500e6); // 2000 levés, campagne Active

        vm.prank(alice);
        usdc.approve(address(tracker), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(tracker), type(uint256).max);
    }

    function _status(uint256 id) internal view returns (MilestoneTracker.Status) {
        return tracker.getMilestone(id).status;
    }

    function _submittedAndConfirmed(uint256 amount) internal returns (uint256 id) {
        id = _createAndLock(amount);
        vm.prank(org);
        tracker.submitProof(id, "bafyproof");
        tracker.confirmDelivery(id, block.timestamp + 1 hours, _sign(supplierPk, id, block.timestamp + 1 hours));
    }

    // ---------------- Paramètres ----------------

    function test_ParamsPropagatedFromFactory() public view {
        assertEq(tracker.secondApprovalThreshold(), THRESHOLD);
        assertEq(tracker.disputeDeposit(), DEPOSIT);
        assertEq(address(tracker.usdc()), address(usdc));
    }

    // ---------------- Double validation ----------------

    function test_BelowThresholdNeedsOneAuditor() public {
        uint256 id = _approvedMilestone(500e6);
        assertFalse(tracker.requiresSecondApproval(id));
        assertEq(uint8(_status(id)), uint8(MilestoneTracker.Status.Approved));
    }

    function test_AboveThresholdNeedsTwoDistinctAuditors() public {
        uint256 id = _submittedAndConfirmed(1_200e6);
        assertTrue(tracker.requiresSecondApproval(id));

        vm.prank(auditor);
        tracker.approve(id);
        assertEq(uint8(_status(id)), uint8(MilestoneTracker.Status.Submitted));
        assertEq(tracker.getMilestone(id).firstApprover, auditor);

        vm.prank(auditor);
        vm.expectRevert(MilestoneTracker.SameAuditor.selector);
        tracker.approve(id);

        vm.prank(auditor2);
        tracker.approve(id);
        MilestoneTracker.Milestone memory m = tracker.getMilestone(id);
        assertEq(uint8(m.status), uint8(MilestoneTracker.Status.Approved));
        assertEq(m.approvedBy, auditor2);

        vm.warp(block.timestamp + CHALLENGE);
        tracker.executeRelease(id);
        assertEq(usdc.balanceOf(supplier), 1_200e6);
    }

    function test_NewProofResetsFirstApproval() public {
        uint256 id = _submittedAndConfirmed(1_200e6);
        vm.prank(auditor);
        tracker.approve(id);

        vm.prank(org);
        tracker.submitProof(id, "bafyproof-v2");
        assertEq(tracker.getMilestone(id).firstApprover, address(0));

        tracker.confirmDelivery(id, block.timestamp + 1 hours, _sign(supplierPk, id, block.timestamp + 1 hours));
        vm.prank(auditor2);
        tracker.approve(id); // compte comme première approbation
        assertEq(uint8(_status(id)), uint8(MilestoneTracker.Status.Submitted));
    }

    function test_SingleAuditorCanStillRejectLargeMilestone() public {
        uint256 id = _submittedAndConfirmed(1_200e6);
        vm.prank(auditor);
        tracker.approve(id);
        vm.prank(auditor2);
        tracker.reject(id, "devis incoherent");
        assertEq(uint8(_status(id)), uint8(MilestoneTracker.Status.Rejected));
        assertEq(tracker.committed(), 0);
    }

    // ---------------- Contestation ----------------

    function test_DonorOpensDisputeWithDeposit() public {
        uint256 id = _approvedMilestone(500e6);
        uint256 before = usdc.balanceOf(alice);

        vm.prank(alice);
        tracker.openDispute(id, "Livraison non constatee sur place");

        assertEq(uint8(_status(id)), uint8(MilestoneTracker.Status.Disputed));
        assertEq(usdc.balanceOf(alice), before - DEPOSIT);
        assertEq(usdc.balanceOf(address(tracker)), DEPOSIT);
        MilestoneTracker.Dispute memory d = tracker.getDispute(id);
        assertEq(d.disputer, alice);
        assertEq(d.deposit, DEPOSIT);
        assertFalse(d.resolved);

        vm.warp(block.timestamp + CHALLENGE);
        vm.expectRevert(
            abi.encodeWithSelector(MilestoneTracker.InvalidStatus.selector, MilestoneTracker.Status.Disputed)
        );
        tracker.executeRelease(id);
    }

    function test_RevertWhen_NonDonorDisputes() public {
        uint256 id = _approvedMilestone(500e6);
        vm.prank(carol);
        vm.expectRevert(MilestoneTracker.NotDonor.selector);
        tracker.openDispute(id, "x");
    }

    function test_RevertWhen_DisputeAfterChallengeWindow() public {
        uint256 id = _approvedMilestone(500e6);
        vm.warp(block.timestamp + CHALLENGE);
        vm.prank(alice);
        vm.expectRevert(MilestoneTracker.ChallengePeriodOver.selector);
        tracker.openDispute(id, "trop tard");
    }

    function test_RevertWhen_DisputeNotApproved() public {
        uint256 id = _submittedAndConfirmed(500e6);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(MilestoneTracker.InvalidStatus.selector, MilestoneTracker.Status.Submitted)
        );
        tracker.openDispute(id, "x");
    }

    function test_RevertWhen_EmptyReason() public {
        uint256 id = _approvedMilestone(500e6);
        vm.prank(alice);
        vm.expectRevert(MilestoneTracker.InvalidParams.selector);
        tracker.openDispute(id, "");
    }

    function test_UpheldDisputeRejectsAndRefundsDeposit() public {
        uint256 id = _approvedMilestone(500e6);
        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        tracker.openDispute(id, "Facture falsifiee");

        vm.prank(arbiter);
        tracker.resolveDispute(id, true, "Preuve insuffisante");

        assertEq(uint8(_status(id)), uint8(MilestoneTracker.Status.Rejected));
        assertEq(usdc.balanceOf(alice), before);
        assertEq(tracker.committed(), 0);
        assertEq(tracker.activeCount(), 0);
        MilestoneTracker.Dispute memory d = tracker.getDispute(id);
        assertTrue(d.resolved);
        assertTrue(d.upheld);
    }

    function test_DismissedDisputeAllowsReleaseAndPaysDepositToSupplier() public {
        uint256 id = _approvedMilestone(500e6);
        vm.prank(alice);
        tracker.openDispute(id, "Doute");

        vm.prank(auditor2);
        tracker.resolveDispute(id, false, "Livraison verifiee");
        assertEq(uint8(_status(id)), uint8(MilestoneTracker.Status.Approved));
        assertEq(usdc.balanceOf(supplier), DEPOSIT);

        // Une seule contestation par jalon
        vm.prank(bob);
        vm.expectRevert(MilestoneTracker.AlreadyDisputed.selector);
        tracker.openDispute(id, "encore");

        vm.warp(block.timestamp + CHALLENGE);
        tracker.executeRelease(id);
        assertEq(usdc.balanceOf(supplier), DEPOSIT + 500e6);
    }

    function test_RevertWhen_ResolverConflicted() public {
        uint256 id = _approvedMilestone(500e6);
        vm.prank(alice);
        tracker.openDispute(id, "x");

        // L'auditeur qui a approuvé ne peut pas trancher
        vm.prank(auditor);
        vm.expectRevert(MilestoneTracker.SeparationOfPowers.selector);
        tracker.resolveDispute(id, false, "");

        // Ni le donateur contestataire, même attesté arbitre
        vm.startPrank(admin);
        registry.grantRole(registry.ARBITER_ROLE(), alice);
        vm.stopPrank();
        vm.prank(alice);
        vm.expectRevert(MilestoneTracker.SeparationOfPowers.selector);
        tracker.resolveDispute(id, true, "");

        // Ni une adresse sans rôle
        vm.prank(carol);
        vm.expectRevert(MilestoneTracker.NotResolver.selector);
        tracker.resolveDispute(id, true, "");
    }

    function test_UnresolvedDisputeExpiresHaltsAndRefundsDeposit() public {
        uint256 id = _approvedMilestone(500e6);
        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        tracker.openDispute(id, "x");

        MilestoneTracker.Milestone memory m = tracker.getMilestone(id);
        vm.warp(uint256(m.deadline) + GRACE + 1);
        tracker.expire(id);

        assertEq(uint8(_status(id)), uint8(MilestoneTracker.Status.Expired));
        assertEq(uint8(vault.state()), uint8(DonationVault.State.Halted));
        assertEq(usdc.balanceOf(alice), before);
        assertEq(usdc.balanceOf(address(tracker)), 0);
    }

    function test_NoDepositWhenZero() public {
        // Fabrique sans caution
        disputeDeposit = 0;
        super.setUp();
        _fundAndClose(1_500e6, 500e6);
        uint256 id = _approvedMilestone(500e6);
        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        tracker.openDispute(id, "x");
        assertEq(usdc.balanceOf(alice), before);
    }
}
