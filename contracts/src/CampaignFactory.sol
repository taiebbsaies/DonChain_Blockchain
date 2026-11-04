// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {AttestationRegistry} from "./AttestationRegistry.sol";
import {DonationReceipt} from "./DonationReceipt.sol";
import {DonationVault} from "./DonationVault.sol";
import {MilestoneTracker} from "./MilestoneTracker.sol";

/// @title Fabrique de campagnes
/// @notice Déploie un coffre et un tracker isolés par campagne (clones EIP-1167, §4.1)
///         et vérifie que l'organisation est attestée (ORG_ROLE).
/// @dev Doit détenir DEFAULT_ADMIN_ROLE sur le DonationReceipt pour autoriser chaque coffre à émettre.
///      Les paramètres globaux (délais) sont immuables : un changement passe par une nouvelle fabrique.
contract CampaignFactory {
    uint256 public constant MAX_FUNDING_DURATION = 365 days;

    IERC20 public immutable usdc;
    AttestationRegistry public immutable registry;
    DonationReceipt public immutable receipt;
    address public immutable vaultImplementation;
    address public immutable trackerImplementation;
    uint64 public immutable gracePeriod;
    uint64 public immutable challengePeriod;

    struct Campaign {
        address org;
        DonationVault vault;
        MilestoneTracker tracker;
    }

    Campaign[] private _campaigns;
    mapping(address vault => bool) public isVault;

    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed org,
        address vault,
        address tracker,
        uint256 softCap,
        uint256 hardCap,
        uint64 fundingDeadline
    );

    error NotAttestedOrg();
    error InvalidParams();

    constructor(
        IERC20 usdc_,
        AttestationRegistry registry_,
        DonationReceipt receipt_,
        uint64 gracePeriod_,
        uint64 challengePeriod_
    ) {
        if (address(usdc_) == address(0) || address(registry_) == address(0) || address(receipt_) == address(0)) {
            revert InvalidParams();
        }
        usdc = usdc_;
        registry = registry_;
        receipt = receipt_;
        gracePeriod = gracePeriod_;
        challengePeriod = challengePeriod_;
        vaultImplementation = address(new DonationVault());
        trackerImplementation = address(new MilestoneTracker());
    }

    struct CampaignParams {
        uint256 softCap;
        uint256 hardCap;
        uint256 minDonation;
        uint64 fundingDeadline;
        bool sequential;
    }

    function createCampaign(CampaignParams calldata p)
        external
        returns (uint256 campaignId, DonationVault vault, MilestoneTracker tracker)
    {
        if (!registry.hasRole(registry.ORG_ROLE(), msg.sender)) revert NotAttestedOrg();
        if (
            p.softCap == 0 || p.softCap > p.hardCap || p.minDonation > p.softCap
                || p.fundingDeadline <= block.timestamp
                || p.fundingDeadline > block.timestamp + MAX_FUNDING_DURATION
        ) revert InvalidParams();

        vault = DonationVault(Clones.clone(vaultImplementation));
        tracker = MilestoneTracker(Clones.clone(trackerImplementation));

        vault.initialize(
            DonationVault.InitParams({
                usdc: usdc,
                receipt: receipt,
                registry: registry,
                tracker: address(tracker),
                org: msg.sender,
                softCap: p.softCap,
                hardCap: p.hardCap,
                minDonation: p.minDonation,
                fundingDeadline: p.fundingDeadline
            })
        );
        tracker.initialize(
            MilestoneTracker.InitParams({
                vault: vault,
                registry: registry,
                org: msg.sender,
                sequential: p.sequential,
                gracePeriod: gracePeriod,
                challengePeriod: challengePeriod
            })
        );

        receipt.grantRole(receipt.MINTER_ROLE(), address(vault));

        campaignId = _campaigns.length;
        _campaigns.push(Campaign({org: msg.sender, vault: vault, tracker: tracker}));
        isVault[address(vault)] = true;

        emit CampaignCreated(
            campaignId, msg.sender, address(vault), address(tracker), p.softCap, p.hardCap, p.fundingDeadline
        );
    }

    function campaignCount() external view returns (uint256) {
        return _campaigns.length;
    }

    function getCampaign(uint256 campaignId) external view returns (Campaign memory) {
        return _campaigns[campaignId];
    }
}
