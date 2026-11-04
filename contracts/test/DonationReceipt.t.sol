// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {DonationReceipt} from "../src/DonationReceipt.sol";

contract DonationReceiptTest is Test {
    DonationReceipt receipt;
    address admin = makeAddr("admin");
    address vault = makeAddr("vault");
    address donor = makeAddr("donor");
    address campaign = makeAddr("campaign");

    function setUp() public {
        receipt = new DonationReceipt(admin);
        bytes32 role = receipt.MINTER_ROLE();
        vm.prank(admin);
        receipt.grantRole(role, vault);
    }

    function test_MintStoresReceipt() public {
        vm.prank(vault);
        uint256 id = receipt.mint(donor, campaign, 100e6);

        assertEq(receipt.ownerOf(id), donor);
        assertTrue(receipt.locked(id));

        DonationReceipt.Receipt memory r = receipt.receiptOf(id);
        assertEq(r.campaign, campaign);
        assertEq(r.amount, 100e6);
        assertEq(r.timestamp, block.timestamp);
    }

    function test_RevertWhen_NonMinterMints() public {
        vm.prank(donor);
        vm.expectRevert();
        receipt.mint(donor, campaign, 1);
    }

    function test_RevertWhen_Transfer() public {
        vm.prank(vault);
        uint256 id = receipt.mint(donor, campaign, 1);

        vm.prank(donor);
        vm.expectRevert(DonationReceipt.SoulboundToken.selector);
        receipt.transferFrom(donor, makeAddr("other"), id);
    }

    function test_RevertWhen_Approve() public {
        vm.prank(vault);
        uint256 id = receipt.mint(donor, campaign, 1);

        vm.prank(donor);
        vm.expectRevert(DonationReceipt.SoulboundToken.selector);
        receipt.approve(makeAddr("other"), id);
    }

    function test_SupportsERC5192() public view {
        assertTrue(receipt.supportsInterface(0xb45a3c0e));
    }

    function testFuzz_MintAnyAmount(address to, uint96 amount) public {
        vm.assume(to != address(0));
        vm.prank(vault);
        uint256 id = receipt.mint(to, campaign, amount);
        assertEq(receipt.ownerOf(id), to);
        assertEq(receipt.receiptOf(id).amount, amount);
    }
}