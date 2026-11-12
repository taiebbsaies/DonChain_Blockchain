// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseTest} from "./Base.t.sol";
import {CampaignFactory} from "../src/CampaignFactory.sol";
import {DonationVault} from "../src/DonationVault.sol";
import {MilestoneTracker} from "../src/MilestoneTracker.sol";
import {DonationReceipt} from "../src/DonationReceipt.sol";

contract CampaignFactoryTest is BaseTest {
    function _params(uint256 soft, uint256 hard, uint256 min, uint64 deadline)
        internal
        pure
        returns (CampaignFactory.CampaignParams memory)
    {
        return CampaignFactory.CampaignParams({
            softCap: soft,
            hardCap: hard,
            minDonation: min,
            fundingDeadline: deadline,
            sequential: true,
            metadataURI: "ipfs://c"
        });
    }

    function test_CreatesIsolatedClones() public {
        (DonationVault v2, MilestoneTracker t2) = _createCampaign(false);

        assertTrue(address(v2) != address(vault));
        assertTrue(address(t2) != address(tracker));
        assertEq(factory.campaignCount(), 2);
        assertTrue(factory.isVault(address(v2)));

        CampaignFactory.Campaign memory c = factory.getCampaign(1);
        assertEq(c.org, org);
        assertEq(address(c.vault), address(v2));
        assertEq(address(c.tracker), address(t2));
        assertEq(c.metadataURI, "ipfs://campaign");

        assertEq(v2.tracker(), address(t2));
        assertEq(address(t2.vault()), address(v2));
        assertEq(v2.org(), org);
        assertFalse(t2.sequential());
        assertEq(t2.gracePeriod(), GRACE);
        assertEq(t2.challengePeriod(), CHALLENGE);
        assertTrue(receipt.hasRole(receipt.MINTER_ROLE(), address(v2)));
    }

    function test_RevertWhen_OrgNotAttested() public {
        vm.prank(alice);
        vm.expectRevert(CampaignFactory.NotAttestedOrg.selector);
        factory.createCampaign(_params(1, 2, 1, uint64(block.timestamp + 1 days)));
    }

    function test_RevertWhen_InvalidParams() public {
        uint64 dl = uint64(block.timestamp + 1 days);
        vm.startPrank(org);
        vm.expectRevert(CampaignFactory.InvalidParams.selector);
        factory.createCampaign(_params(0, 2, 0, dl)); // softCap nul
        vm.expectRevert(CampaignFactory.InvalidParams.selector);
        factory.createCampaign(_params(3, 2, 1, dl)); // softCap > hardCap
        vm.expectRevert(CampaignFactory.InvalidParams.selector);
        factory.createCampaign(_params(2, 3, 5, dl)); // min > softCap
        vm.expectRevert(CampaignFactory.InvalidParams.selector);
        factory.createCampaign(_params(1, 2, 1, uint64(block.timestamp))); // deadline passée
        vm.expectRevert(CampaignFactory.InvalidParams.selector);
        factory.createCampaign(_params(1, 2, 1, uint64(block.timestamp + 366 days))); // trop longue
        CampaignFactory.CampaignParams memory p = _params(1, 2, 1, dl);
        p.metadataURI = "";
        vm.expectRevert(CampaignFactory.InvalidParams.selector);
        factory.createCampaign(p); // métadonnées manquantes
        vm.stopPrank();
    }

    function test_RevertWhen_ConstructorZeroAddress() public {
        vm.expectRevert(CampaignFactory.InvalidParams.selector);
        new CampaignFactory(usdc, registry, DonationReceipt(address(0)), GRACE, CHALLENGE, 0, 0);
    }
}
