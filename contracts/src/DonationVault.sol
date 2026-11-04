// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AttestationRegistry} from "./AttestationRegistry.sol";
import {DonationReceipt} from "./DonationReceipt.sol";

/// @title Coffre de séquestre d'une campagne (un clone EIP-1167 par campagne)
/// @notice Encaisse les USDC, applique softCap/hardCap, émet les SBT, exécute les paiements
///         ordonnés par le MilestoneTracker et les remboursements (pattern pull).
/// @dev Aucune fonction ne permet à l'organisation ou à l'admin de déplacer les fonds.
///      Seul le tracker peut appeler `release`, et la pause ne bloque jamais `refund` (§9.3).
contract DonationVault is Initializable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    enum State {
        Funding, // collecte en cours
        Active, // softCap atteint : les jalons peuvent être exécutés
        Failed, // softCap non atteint à la deadline : remboursement intégral
        Halted, // jalon expiré : fonds non libérés remboursables au prorata
        Completed // campagne clôturée : reliquat remboursable au prorata
    }

    IERC20 public usdc;
    DonationReceipt public receipt;
    AttestationRegistry public registry;
    address public tracker;
    address public org;

    uint256 public softCap;
    uint256 public hardCap;
    uint256 public minDonation;
    uint64 public fundingDeadline;

    uint256 public totalRaised;
    uint256 public totalReleased;
    uint256 public totalRefunded;

    bool public halted;
    bool public completed;

    mapping(address donor => uint256) public donations;
    mapping(address donor => bool) public refunded;
    mapping(uint256 milestoneId => bool) public milestoneReleased;

    event DonationReceived(address indexed donor, uint256 amount, uint256 receiptId);
    event RefundIssued(address indexed donor, uint256 amount);
    event FundsReleased(uint256 indexed milestoneId, address indexed supplier, uint256 amount);
    event CampaignHalted();
    event CampaignCompleted();

    error NotTracker();
    error NotPauser();
    error InvalidState(State current);
    error BelowMinimum();
    error HardCapExceeded();
    error NothingToRefund();
    error AlreadyReleased();
    error InsufficientFunds();
    error ZeroAddress();

    modifier onlyTracker() {
        if (msg.sender != tracker) revert NotTracker();
        _;
    }

    modifier onlyPauser() {
        if (!registry.hasRole(registry.PAUSER_ROLE(), msg.sender)) revert NotPauser();
        _;
    }

    /// @dev L'implémentation ne doit jamais être initialisée : seuls les clones le sont.
    constructor() {
        _disableInitializers();
    }

    struct InitParams {
        IERC20 usdc;
        DonationReceipt receipt;
        AttestationRegistry registry;
        address tracker;
        address org;
        uint256 softCap;
        uint256 hardCap;
        uint256 minDonation;
        uint64 fundingDeadline;
    }

    /// @notice Appelé une seule fois par la CampaignFactory dans la transaction de création.
    function initialize(InitParams calldata p) external initializer {
        if (
            address(p.usdc) == address(0) || address(p.receipt) == address(0)
                || address(p.registry) == address(0) || p.tracker == address(0) || p.org == address(0)
        ) revert ZeroAddress();
        usdc = p.usdc;
        receipt = p.receipt;
        registry = p.registry;
        tracker = p.tracker;
        org = p.org;
        softCap = p.softCap;
        hardCap = p.hardCap;
        minDonation = p.minDonation;
        fundingDeadline = p.fundingDeadline;
    }

    // ------------------------------------------------------------------
    // Lecture
    // ------------------------------------------------------------------

    function state() public view returns (State) {
        if (halted) return State.Halted;
        if (completed) return State.Completed;
        if (block.timestamp < fundingDeadline && totalRaised < hardCap) return State.Funding;
        if (totalRaised < softCap) return State.Failed;
        return State.Active;
    }

    /// @notice Montant que `donor` peut retirer dans l'état actuel (0 si aucun).
    /// @dev Prorata sur les fonds non libérés. En `Failed`, totalReleased = 0 donc remboursement intégral.
    function refundableOf(address donor) public view returns (uint256) {
        State s = state();
        if (s != State.Failed && s != State.Halted && s != State.Completed) return 0;
        if (refunded[donor] || totalRaised == 0) return 0;
        return (donations[donor] * (totalRaised - totalReleased)) / totalRaised;
    }

    // ------------------------------------------------------------------
    // Donateurs
    // ------------------------------------------------------------------

    function donate(uint256 amount) external nonReentrant whenNotPaused returns (uint256 receiptId) {
        State s = state();
        if (s != State.Funding) revert InvalidState(s);
        if (amount < minDonation || amount == 0) revert BelowMinimum();
        if (totalRaised + amount > hardCap) revert HardCapExceeded();

        // Effects
        donations[msg.sender] += amount;
        totalRaised += amount;

        // Interactions (USDC et reçu sont des contrats de confiance ; _mint sans callback)
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        receiptId = receipt.mint(msg.sender, address(this), amount);

        emit DonationReceived(msg.sender, amount, receiptId);
    }

    /// @notice Remboursement en mode pull. Jamais bloqué par la pause ni par l'organisation.
    /// @dev Traitement individuel : une adresse blacklistée par Circle ne bloque que son propre retrait.
    function refund() external nonReentrant returns (uint256 amount) {
        amount = refundableOf(msg.sender);
        if (amount == 0) revert NothingToRefund();

        refunded[msg.sender] = true;
        totalRefunded += amount;

        usdc.safeTransfer(msg.sender, amount);
        emit RefundIssued(msg.sender, amount);
    }

    // ------------------------------------------------------------------
    // Tracker uniquement
    // ------------------------------------------------------------------

    /// @notice Paie le prestataire figé d'un jalon approuvé. Une seule fois par jalon.
    function release(uint256 milestoneId, address supplier, uint256 amount)
        external
        onlyTracker
        nonReentrant
        whenNotPaused
    {
        State s = state();
        if (s != State.Active) revert InvalidState(s);
        if (milestoneReleased[milestoneId]) revert AlreadyReleased();
        if (supplier == address(0)) revert ZeroAddress();
        if (totalReleased + amount > totalRaised) revert InsufficientFunds();

        milestoneReleased[milestoneId] = true;
        totalReleased += amount;

        usdc.safeTransfer(supplier, amount);
        emit FundsReleased(milestoneId, supplier, amount);
    }

    /// @notice Bascule la campagne en `Halted` (jalon expiré). Irréversible.
    function halt() external onlyTracker {
        State s = state();
        if (s != State.Active) revert InvalidState(s);
        halted = true;
        emit CampaignHalted();
    }

    /// @notice Clôture la campagne ; le reliquat devient remboursable au prorata. Irréversible.
    function complete() external onlyTracker {
        State s = state();
        if (s != State.Active) revert InvalidState(s);
        completed = true;
        emit CampaignCompleted();
    }

    // ------------------------------------------------------------------
    // Urgence
    // ------------------------------------------------------------------

    /// @notice Suspend dons et libérations (jamais les remboursements).
    function pause() external onlyPauser {
        _pause();
    }

    function unpause() external onlyPauser {
        _unpause();
    }
}
