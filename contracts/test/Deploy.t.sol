// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {DonationReceipt} from "../src/DonationReceipt.sol";
import {CampaignFactory} from "../src/CampaignFactory.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// @dev Vérifie le script de déploiement testnet/mainnet : rôles transférés, déployeur sans droits.
contract DeployTest is Test {
    address safe = makeAddr("safe");
    MockUSDC usdc;

    function setUp() public {
        usdc = new MockUSDC();
    }

    /// @dev Configuration passée directement : les variables d'environnement sont partagées entre
    ///      tests exécutés en parallèle et donneraient des résultats aléatoires.
    function _config(uint256 timelockDelay) internal view returns (Deploy.Config memory) {
        return Deploy.Config({
            usdc: usdc,
            safe: safe,
            grace: 7 days,
            challenge: 3 days,
            secondApprovalThreshold: 5_000e6,
            disputeDeposit: 0,
            timelockDelay: timelockDelay
        });
    }

    function _checkCommon(AttestationRegistry registry, DonationReceipt receipt, CampaignFactory factory, address admin)
        internal
        view
    {
        bytes32 adminRole = registry.DEFAULT_ADMIN_ROLE();
        assertTrue(registry.hasRole(adminRole, admin));
        assertTrue(receipt.hasRole(adminRole, admin));
        assertTrue(receipt.hasRole(adminRole, address(factory)));
        assertTrue(registry.hasRole(registry.PAUSER_ROLE(), safe));
        // Le déployeur (expéditeur par défaut de forge en test) n'a plus aucun droit
        assertFalse(registry.hasRole(adminRole, DEFAULT_SENDER));
        assertFalse(receipt.hasRole(adminRole, DEFAULT_SENDER));
        assertEq(factory.secondApprovalThreshold(), 5_000e6);
        assertEq(factory.disputeDeposit(), 0);
        assertEq(factory.challengePeriod(), 3 days);
        assertEq(address(factory.usdc()), address(usdc));
    }

    function test_DeployWithSafeAsAdmin() public {
        (AttestationRegistry registry, DonationReceipt receipt, CampaignFactory factory, address admin) =
            new Deploy().deploy(_config(0), false);
        assertEq(admin, safe);
        _checkCommon(registry, receipt, factory, admin);
    }

    function test_DeployWithTimelock() public {
        (AttestationRegistry registry, DonationReceipt receipt, CampaignFactory factory, address admin) =
            new Deploy().deploy(_config(172800), false);
        assertTrue(admin != safe);
        _checkCommon(registry, receipt, factory, admin);
        assertFalse(registry.hasRole(registry.DEFAULT_ADMIN_ROLE(), safe));

        TimelockController tl = TimelockController(payable(admin));
        assertEq(tl.getMinDelay(), 172800);
        assertTrue(tl.hasRole(tl.PROPOSER_ROLE(), safe));
        assertTrue(tl.hasRole(tl.EXECUTOR_ROLE(), safe));

        // Le Safe ne peut attester une organisation qu'en passant par le délai de 48 h
        address newOrg = makeAddr("newOrg");
        bytes memory call = abi.encodeCall(registry.grantRole, (registry.ORG_ROLE(), newOrg));
        vm.prank(safe);
        tl.schedule(address(registry), 0, call, bytes32(0), bytes32(0), 172800);
        vm.prank(safe);
        vm.expectRevert();
        tl.execute(address(registry), 0, call, bytes32(0), bytes32(0));

        vm.warp(block.timestamp + 172800);
        vm.prank(safe);
        tl.execute(address(registry), 0, call, bytes32(0), bytes32(0));
        assertTrue(registry.hasRole(registry.ORG_ROLE(), newOrg));
    }
}
