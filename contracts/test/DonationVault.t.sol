// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {BaseTest} from "./Base.t.sol";
import {DonationVault} from "../src/DonationVault.sol";
import {DonationReceipt} from "../src/DonationReceipt.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract DonationVaultTest is BaseTest {
    // ---------------- Dons ----------------

    function test_DonateRecordsAndMintsReceipt() public {
        _donate(alice, 100e6);

        assertEq(vault.donations(alice), 100e6);
        assertEq(vault.totalRaised(), 100e6);
        assertEq(usdc.balanceOf(address(vault)), 100e6);
        assertEq(receipt.balanceOf(alice), 1);

        DonationReceipt.Receipt memory r = receipt.receiptOf(1);
        assertEq(r.campaign, address(vault));
        assertEq(r.amount, 100e6);
    }

    function test_RevertWhen_BelowMinimum() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 1);
        vm.expectRevert(DonationVault.BelowMinimum.selector);
        vault.donate(MIN_DONATION - 1);
        vm.stopPrank();
    }

    function test_RevertWhen_HardCapExceeded() public {
        _donate(alice, HARD_CAP - 10e6);
        vm.startPrank(bob);
        usdc.approve(address(vault), 20e6);
        vm.expectRevert(DonationVault.HardCapExceeded.selector);
        vault.donate(20e6);
        vm.stopPrank();
    }

    function test_HardCapReachedActivatesEarly() public {
        _donate(alice, HARD_CAP);
        assertEq(uint8(vault.state()), uint8(DonationVault.State.Active));

        vm.startPrank(bob);
        usdc.approve(address(vault), MIN_DONATION);
        vm.expectRevert(abi.encodeWithSelector(DonationVault.InvalidState.selector, DonationVault.State.Active));
        vault.donate(MIN_DONATION);
        vm.stopPrank();
    }

    function test_RevertWhen_DonateAfterDeadline() public {
        vm.warp(vault.fundingDeadline());
        vm.startPrank(alice);
        usdc.approve(address(vault), 10e6);
        vm.expectRevert(abi.encodeWithSelector(DonationVault.InvalidState.selector, DonationVault.State.Failed));
        vault.donate(10e6);
        vm.stopPrank();
    }

    // ---------------- États ----------------

    function test_StateTransitions() public {
        assertEq(uint8(vault.state()), uint8(DonationVault.State.Funding));
        _donate(alice, SOFT_CAP);
        assertEq(uint8(vault.state()), uint8(DonationVault.State.Funding));
        vm.warp(vault.fundingDeadline());
        assertEq(uint8(vault.state()), uint8(DonationVault.State.Active));
    }

    // ---------------- Remboursements ----------------

    function test_FailedCampaignRefundsInFull() public {
        _fundAndClose(300e6, 200e6); // < softCap
        assertEq(uint8(vault.state()), uint8(DonationVault.State.Failed));

        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        vault.refund();
        assertEq(usdc.balanceOf(alice) - before, 300e6);

        vm.prank(bob);
        vault.refund();
        assertEq(usdc.balanceOf(address(vault)), 0);
        assertEq(vault.totalRefunded(), 500e6);
    }

    function test_RevertWhen_DoubleRefund() public {
        _fundAndClose(300e6, 0);
        vm.startPrank(alice);
        vault.refund();
        vm.expectRevert(DonationVault.NothingToRefund.selector);
        vault.refund();
        vm.stopPrank();
    }

    function test_RevertWhen_RefundDuringFundingOrActive() public {
        _donate(alice, SOFT_CAP);
        vm.prank(alice);
        vm.expectRevert(DonationVault.NothingToRefund.selector);
        vault.refund();

        vm.warp(vault.fundingDeadline());
        vm.prank(alice);
        vm.expectRevert(DonationVault.NothingToRefund.selector);
        vault.refund();
    }

    function test_RefundWorksWhilePaused() public {
        _fundAndClose(300e6, 0);
        vm.prank(pauser);
        vault.pause();

        vm.prank(alice);
        vault.refund();
        assertTrue(vault.refunded(alice));
    }

    function test_BlacklistedDonorDoesNotBlockOthers() public {
        _fundAndClose(300e6, 200e6);
        usdc.setBlacklisted(alice, true);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MockUSDC.Blacklisted.selector, alice));
        vault.refund();

        vm.prank(bob);
        vault.refund();
        assertEq(usdc.balanceOf(address(vault)), 300e6);
        assertFalse(vault.refunded(alice)); // l'échec est annulé : alice pourra réessayer
    }

    // ---------------- Pause ----------------

    function test_PauseBlocksDonations() public {
        vm.prank(pauser);
        vault.pause();
        vm.startPrank(alice);
        usdc.approve(address(vault), 10e6);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.donate(10e6);
        vm.stopPrank();

        vm.prank(pauser);
        vault.unpause();
        _donate(alice, 10e6);
    }

    function test_RevertWhen_NonPauserPauses() public {
        vm.prank(admin);
        vm.expectRevert(DonationVault.NotPauser.selector);
        vault.pause();
    }

    // ---------------- Accès tracker ----------------

    function test_RevertWhen_NonTrackerReleases() public {
        _fundAndClose(SOFT_CAP, 0);
        address[3] memory callers = [org, admin, supplier];
        for (uint256 i; i < callers.length; i++) {
            vm.prank(callers[i]);
            vm.expectRevert(DonationVault.NotTracker.selector);
            vault.release(0, callers[i], 1);
        }
    }

    function test_RevertWhen_NonTrackerHaltsOrCompletes() public {
        vm.startPrank(org);
        vm.expectRevert(DonationVault.NotTracker.selector);
        vault.halt();
        vm.expectRevert(DonationVault.NotTracker.selector);
        vault.complete();
        vm.stopPrank();
    }

    function test_TrackerReleaseGuards() public {
        _fundAndClose(SOFT_CAP, 0);
        vm.startPrank(address(tracker));
        vm.expectRevert(DonationVault.InsufficientFunds.selector);
        vault.release(0, supplier, SOFT_CAP + 1);

        vm.expectRevert(DonationVault.ZeroAddress.selector);
        vault.release(0, address(0), 1);

        vault.release(0, supplier, 1);
        vm.expectRevert(DonationVault.AlreadyReleased.selector);
        vault.release(0, supplier, 1);
        vm.stopPrank();
    }

    function test_RevertWhen_ReleaseWhilePaused() public {
        _fundAndClose(SOFT_CAP, 0);
        vm.prank(pauser);
        vault.pause();
        vm.prank(address(tracker));
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.release(0, supplier, 1);
    }

    // ---------------- Initialisation ----------------

    function test_RevertWhen_Reinitialize() public {
        DonationVault.InitParams memory p;
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        vault.initialize(p);
    }

    function test_RevertWhen_InitializeImplementation() public {
        DonationVault impl = DonationVault(factory.vaultImplementation());
        DonationVault.InitParams memory p;
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        impl.initialize(p);
    }

    // ---------------- Fuzz ----------------

    /// @dev Campagne échouée : chaque donateur récupère exactement son don.
    function testFuzz_FailedRefundExact(uint256 a, uint256 b) public {
        a = bound(a, MIN_DONATION, SOFT_CAP / 2 - 1);
        b = bound(b, MIN_DONATION, SOFT_CAP / 2 - 1);
        _fundAndClose(a, b);

        uint256 aBefore = usdc.balanceOf(alice);
        uint256 bBefore = usdc.balanceOf(bob);
        vm.prank(alice);
        vault.refund();
        vm.prank(bob);
        vault.refund();

        assertEq(usdc.balanceOf(alice) - aBefore, a);
        assertEq(usdc.balanceOf(bob) - bBefore, b);
        assertEq(usdc.balanceOf(address(vault)), 0);
    }

    function testFuzz_DonateNeverExceedsHardCap(uint256 a, uint256 b) public {
        a = bound(a, MIN_DONATION, HARD_CAP);
        b = bound(b, MIN_DONATION, HARD_CAP);
        _donate(alice, a);

        vm.startPrank(bob);
        usdc.approve(address(vault), b);
        try vault.donate(b) {} catch {}
        vm.stopPrank();

        assertLe(vault.totalRaised(), HARD_CAP);
    }
}
