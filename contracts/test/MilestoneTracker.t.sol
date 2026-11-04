// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseTest} from "./Base.t.sol";
import {DonationVault} from "../src/DonationVault.sol";
import {MilestoneTracker} from "../src/MilestoneTracker.sol";

contract MilestoneTrackerTest is BaseTest {
    function setUp() public override {
        super.setUp();
        _fundAndClose(1_500e6, 500e6); // 2000 levés, campagne Active
    }

    // ---------------- Cycle complet ----------------

    function test_HappyPathReleasesToFrozenSupplier() public {
        uint256 id = _approvedMilestone(800e6);

        vm.expectRevert(MilestoneTracker.ChallengePeriodActive.selector);
        tracker.executeRelease(id);

        vm.warp(block.timestamp + CHALLENGE);
        tracker.executeRelease(id);

        assertEq(usdc.balanceOf(supplier), 800e6);
        assertEq(vault.totalReleased(), 800e6);
        assertEq(uint8(tracker.getMilestone(id).status), uint8(MilestoneTracker.Status.Released));
        assertEq(tracker.activeCount(), 0);
        assertEq(tracker.committed(), 800e6);
    }

    function test_RevertWhen_DoubleRelease() public {
        uint256 id = _approvedMilestone(800e6);
        vm.warp(block.timestamp + CHALLENGE);
        tracker.executeRelease(id);

        vm.expectRevert(
            abi.encodeWithSelector(MilestoneTracker.InvalidStatus.selector, MilestoneTracker.Status.Released)
        );
        tracker.executeRelease(id);
    }

    // ---------------- Création / verrouillage ----------------

    function test_RevertWhen_NonOrgCreates() public {
        vm.prank(alice);
        vm.expectRevert(MilestoneTracker.NotOrg.selector);
        tracker.createMilestone(supplier, 1e6, uint64(block.timestamp + 1 days), keccak256("d"));
    }

    function test_RevertWhen_OrgAttestationRevoked() public {
        vm.startPrank(admin);
        registry.revokeRole(registry.ORG_ROLE(), org);
        vm.stopPrank();

        vm.prank(org);
        vm.expectRevert(MilestoneTracker.NotOrg.selector);
        tracker.createMilestone(supplier, 1e6, uint64(block.timestamp + 1 days), keccak256("d"));
    }

    function test_RevertWhen_SupplierNotAttested() public {
        vm.prank(org);
        vm.expectRevert(MilestoneTracker.NotAttestedSupplier.selector);
        tracker.createMilestone(alice, 1e6, uint64(block.timestamp + 1 days), keccak256("d"));
    }

    function test_RevertWhen_SupplierIsOrg() public {
        vm.startPrank(admin);
        registry.grantRole(registry.SUPPLIER_ROLE(), org);
        vm.stopPrank();

        vm.prank(org);
        vm.expectRevert(MilestoneTracker.SeparationOfPowers.selector);
        tracker.createMilestone(org, 1e6, uint64(block.timestamp + 1 days), keccak256("d"));
    }

    function test_RevertWhen_InvalidMilestoneParams() public {
        vm.startPrank(org);
        vm.expectRevert(MilestoneTracker.InvalidParams.selector);
        tracker.createMilestone(supplier, 0, uint64(block.timestamp + 1 days), keccak256("d"));
        vm.expectRevert(MilestoneTracker.InvalidParams.selector);
        tracker.createMilestone(supplier, 1e6, uint64(block.timestamp), keccak256("d"));
        vm.expectRevert(MilestoneTracker.InvalidParams.selector);
        tracker.createMilestone(supplier, 1e6, uint64(block.timestamp + 1 days), bytes32(0));
        vm.stopPrank();
    }

    function test_FrozenFieldsStored() public {
        uint64 deadline = uint64(block.timestamp + 10 days);
        vm.prank(org);
        uint256 id = tracker.createMilestone(supplier, 123e6, deadline, keccak256("desc"));

        MilestoneTracker.Milestone memory m = tracker.getMilestone(id);
        assertEq(m.supplier, supplier);
        assertEq(m.amount, 123e6);
        assertEq(m.deadline, deadline);
        assertEq(m.descriptionHash, keccak256("desc"));
        assertEq(uint8(m.status), uint8(MilestoneTracker.Status.Draft));
    }

    function test_RevertWhen_LockExceedsRaised() public {
        vm.startPrank(org);
        uint256 id = tracker.createMilestone(supplier, 2_001e6, uint64(block.timestamp + 1 days), keccak256("d"));
        vm.expectRevert(MilestoneTracker.ExceedsRaised.selector);
        tracker.lockMilestone(id);
        vm.stopPrank();
    }

    function test_RevertWhen_LockBeforeActive() public {
        (DonationVault v2, MilestoneTracker t2) = _createCampaign(true);
        v2; // campagne en collecte
        vm.startPrank(org);
        uint256 id = t2.createMilestone(supplier, 1e6, uint64(block.timestamp + 40 days), keccak256("d"));
        vm.expectRevert(MilestoneTracker.CampaignNotActive.selector);
        t2.lockMilestone(id);
        vm.stopPrank();
    }

    function test_SequentialBlocksSecondLock() public {
        _createAndLock(500e6);
        vm.startPrank(org);
        uint256 id2 = tracker.createMilestone(supplier, 500e6, uint64(block.timestamp + 30 days), keccak256("d2"));
        vm.expectRevert(MilestoneTracker.MilestoneInProgress.selector);
        tracker.lockMilestone(id2);
        vm.stopPrank();
    }

    function test_SequentialAllowsNextAfterRelease() public {
        uint256 id = _approvedMilestone(500e6);
        vm.warp(block.timestamp + CHALLENGE);
        tracker.executeRelease(id);
        _createAndLock(500e6);
        assertEq(tracker.activeCount(), 1);
    }

    // ---------------- Preuves ----------------

    function test_ProofHistoryIsAppendOnly() public {
        uint256 id = _createAndLock(500e6);
        vm.startPrank(org);
        tracker.submitProof(id, "bafyv1");
        tracker.submitProof(id, "bafyv2");
        vm.stopPrank();

        assertEq(tracker.proofCount(id), 2);
        assertEq(tracker.getProof(id, 0).cid, "bafyv1");
        assertEq(tracker.getProof(id, 1).cid, "bafyv2");
        assertEq(tracker.getProof(id, 1).submitter, org);
        assertEq(tracker.latestProofHash(id), keccak256("bafyv2"));
    }

    function test_RevertWhen_EmptyCid() public {
        uint256 id = _createAndLock(500e6);
        vm.prank(org);
        vm.expectRevert(MilestoneTracker.InvalidParams.selector);
        tracker.submitProof(id, "");
    }

    // ---------------- Signature prestataire (EIP-712) ----------------

    function test_RevertWhen_WrongSigner() public {
        uint256 id = _createAndLock(500e6);
        vm.prank(org);
        tracker.submitProof(id, "bafy");

        (, uint256 otherPk) = makeAddrAndKey("other");
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sign(otherPk, id, dl);
        vm.expectRevert(MilestoneTracker.InvalidSignature.selector);
        tracker.confirmDelivery(id, dl, sig);
    }

    function test_RevertWhen_SignatureExpired() public {
        uint256 id = _createAndLock(500e6);
        vm.prank(org);
        tracker.submitProof(id, "bafy");

        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sign(supplierPk, id, dl);
        vm.warp(dl + 1);
        vm.expectRevert(MilestoneTracker.SignatureExpired.selector);
        tracker.confirmDelivery(id, dl, sig);
    }

    /// @dev Une révision de preuve invalide la confirmation ; l'ancienne signature ne peut être rejouée.
    function test_RevisionRequiresNewSignature() public {
        uint256 id = _createAndLock(500e6);
        vm.prank(org);
        tracker.submitProof(id, "bafyv1");

        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sign(supplierPk, id, dl);
        tracker.confirmDelivery(id, dl, sig);
        assertTrue(tracker.getMilestone(id).supplierConfirmed);

        vm.prank(org);
        tracker.submitProof(id, "bafyv2");
        assertFalse(tracker.getMilestone(id).supplierConfirmed);

        vm.expectRevert(MilestoneTracker.InvalidSignature.selector);
        tracker.confirmDelivery(id, dl, sig);

        vm.prank(auditor);
        vm.expectRevert(
            abi.encodeWithSelector(MilestoneTracker.InvalidStatus.selector, MilestoneTracker.Status.Submitted)
        );
        tracker.approve(id);
    }

    function test_RevertWhen_SignatureReplayedOnOtherCampaign() public {
        uint256 id = _createAndLock(500e6);
        vm.prank(org);
        tracker.submitProof(id, "bafy");
        uint256 dl = block.timestamp + 90 days;
        bytes memory sig = _sign(supplierPk, id, dl);

        // Même jalon id, même CID dans une autre campagne : domaine EIP-712 différent
        (DonationVault v2, MilestoneTracker t2) = _createCampaign(true);
        vm.startPrank(alice);
        usdc.approve(address(v2), SOFT_CAP);
        v2.donate(SOFT_CAP);
        vm.stopPrank();
        vm.warp(v2.fundingDeadline());
        vm.startPrank(org);
        uint256 id2 = t2.createMilestone(supplier, 500e6, uint64(block.timestamp + 30 days), keccak256("desc"));
        t2.lockMilestone(id2);
        t2.submitProof(id2, "bafy");
        vm.stopPrank();
        assertEq(id2, id);

        vm.expectRevert(MilestoneTracker.InvalidSignature.selector);
        t2.confirmDelivery(id2, dl, sig);
    }

    // ---------------- Auditeur ----------------

    function test_RevertWhen_ApproveWithoutSupplierConfirmation() public {
        uint256 id = _createAndLock(500e6);
        vm.prank(org);
        tracker.submitProof(id, "bafy");

        vm.prank(auditor);
        vm.expectRevert(
            abi.encodeWithSelector(MilestoneTracker.InvalidStatus.selector, MilestoneTracker.Status.Submitted)
        );
        tracker.approve(id);
    }

    function test_RevertWhen_NonAuditorApproves() public {
        uint256 id = _createAndLock(500e6);
        vm.prank(admin);
        vm.expectRevert(MilestoneTracker.NotAuditor.selector);
        tracker.approve(id);
    }

    function test_RevertWhen_OrgActsAsAuditor() public {
        vm.startPrank(admin);
        registry.grantRole(registry.AUDITOR_ROLE(), org);
        vm.stopPrank();
        uint256 id = _createAndLock(500e6);

        vm.prank(org);
        vm.expectRevert(MilestoneTracker.SeparationOfPowers.selector);
        tracker.approve(id);
    }

    function test_RevertWhen_SupplierActsAsAuditor() public {
        vm.startPrank(admin);
        registry.grantRole(registry.AUDITOR_ROLE(), supplier);
        vm.stopPrank();
        uint256 id = _createAndLock(500e6);

        vm.prank(supplier);
        vm.expectRevert(MilestoneTracker.SeparationOfPowers.selector);
        tracker.reject(id, "self");
    }

    function test_RejectFreesCommittedFunds() public {
        uint256 id = _createAndLock(500e6);
        vm.prank(org);
        tracker.submitProof(id, "bafy");

        vm.prank(auditor);
        tracker.reject(id, "facture illisible");

        assertEq(uint8(tracker.getMilestone(id).status), uint8(MilestoneTracker.Status.Rejected));
        assertEq(tracker.committed(), 0);
        assertEq(tracker.activeCount(), 0);
    }

    // ---------------- Annulation ----------------

    function test_CancelPendingFreesFunds() public {
        uint256 id = _createAndLock(500e6);
        vm.prank(org);
        tracker.cancel(id);
        assertEq(tracker.committed(), 0);
        assertEq(tracker.activeCount(), 0);
    }

    function test_RevertWhen_CancelAfterSubmission() public {
        uint256 id = _createAndLock(500e6);
        vm.startPrank(org);
        tracker.submitProof(id, "bafy");
        vm.expectRevert(
            abi.encodeWithSelector(MilestoneTracker.InvalidStatus.selector, MilestoneTracker.Status.Submitted)
        );
        tracker.cancel(id);
        vm.stopPrank();
    }

    // ---------------- Expiration / remboursement au prorata ----------------

    function test_ExpiryHaltsCampaignAndRefundsProRata() public {
        uint256 id = _approvedMilestone(1_000e6);
        vm.warp(block.timestamp + CHALLENGE);
        tracker.executeRelease(id);

        uint256 id2 = _createAndLock(500e6);
        uint64 deadline = tracker.getMilestone(id2).deadline;

        vm.warp(uint256(deadline) + GRACE);
        vm.expectRevert(MilestoneTracker.NotExpired.selector);
        tracker.expire(id2);

        vm.warp(uint256(deadline) + GRACE + 1);
        tracker.expire(id2);
        assertEq(uint8(vault.state()), uint8(DonationVault.State.Halted));

        // 2000 levés, 1000 libérés : alice (1500) récupère 750, bob (500) récupère 250
        assertEq(vault.refundableOf(alice), 750e6);
        assertEq(vault.refundableOf(bob), 250e6);
        vm.prank(alice);
        vault.refund();
        vm.prank(bob);
        vault.refund();
        assertEq(usdc.balanceOf(address(vault)), 0);
    }

    function test_HaltBlocksFurtherActions() public {
        uint256 id = _createAndLock(500e6);
        vm.warp(block.timestamp + 30 days + GRACE + 1);
        tracker.expire(id);

        vm.prank(org);
        vm.expectRevert(MilestoneTracker.CampaignNotActive.selector);
        tracker.createMilestone(supplier, 1e6, uint64(block.timestamp + 1 days), keccak256("d"));

        vm.prank(org);
        vm.expectRevert(abi.encodeWithSelector(DonationVault.InvalidState.selector, DonationVault.State.Halted));
        tracker.closeCampaign();
    }

    // ---------------- Clôture / reliquat ----------------

    function test_CloseCampaignMakesRemainderRefundable() public {
        uint256 id = _approvedMilestone(1_200e6);
        vm.warp(block.timestamp + CHALLENGE);
        tracker.executeRelease(id);

        vm.prank(org);
        tracker.closeCampaign();
        assertEq(uint8(vault.state()), uint8(DonationVault.State.Completed));

        // reliquat 800 : alice 600, bob 200
        assertEq(vault.refundableOf(alice), 600e6);
        assertEq(vault.refundableOf(bob), 200e6);
    }

    function test_RevertWhen_CloseWithMilestoneInProgress() public {
        _createAndLock(500e6);
        vm.prank(org);
        vm.expectRevert(MilestoneTracker.MilestoneInProgress.selector);
        tracker.closeCampaign();
    }

    // ---------------- Attestation révoquée ----------------

    function test_RevertWhen_SupplierRevokedBeforeRelease() public {
        uint256 id = _approvedMilestone(500e6);
        vm.startPrank(admin);
        registry.revokeRole(registry.SUPPLIER_ROLE(), supplier);
        vm.stopPrank();

        vm.warp(block.timestamp + CHALLENGE);
        vm.expectRevert(MilestoneTracker.NotAttestedSupplier.selector);
        tracker.executeRelease(id);
    }

    function test_RevertWhen_UnknownMilestone() public {
        vm.expectRevert(MilestoneTracker.UnknownMilestone.selector);
        tracker.getMilestone(42);
    }

    // ---------------- Fuzz ----------------

    function testFuzz_ReleaseNeverExceedsRaised(uint256 a, uint256 b) public {
        a = bound(a, 1, 2_000e6);
        b = bound(b, 1, 2_000e6);

        uint256 id = _approvedMilestone(a);
        vm.warp(block.timestamp + CHALLENGE);
        tracker.executeRelease(id);

        vm.startPrank(org);
        uint256 id2 = tracker.createMilestone(supplier, b, uint64(block.timestamp + 30 days), keccak256("d2"));
        if (a + b > 2_000e6) vm.expectRevert(MilestoneTracker.ExceedsRaised.selector);
        tracker.lockMilestone(id2);
        vm.stopPrank();

        assertLe(tracker.committed(), vault.totalRaised());
    }
}
