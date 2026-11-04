// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {AttestationRegistry} from "./AttestationRegistry.sol";
import {DonationVault} from "./DonationVault.sol";

/// @title Suivi des jalons d'une campagne (un clone EIP-1167 par campagne)
/// @notice Jalons figés, preuves IPFS, machine à états, validation prestataire (EIP-712) + auditeur.
///         Seul ce contrat peut ordonner une libération au coffre, vers le prestataire et le montant figés.
/// @dev MVP (Phase 1). La contestation par les donateurs (`openDispute`) arrive en Phase 2 :
///      `approvedAt` et `challengePeriod` sont déjà en place pour l'accueillir.
contract MilestoneTracker is Initializable, EIP712 {
    enum Status {
        Draft, // créé, pas encore engagé
        Pending, // verrouillé, fonds réservés
        Submitted, // preuve soumise par l'organisation
        Approved, // prestataire a confirmé + auditeur a approuvé
        Released, // payé (final)
        Rejected, // rejeté par un auditeur (final)
        Cancelled, // annulé par l'organisation avant soumission (final)
        Expired // date limite + délai de grâce dépassés (final, campagne Halted)
    }

    struct Milestone {
        // Figés à la création (§4.3)
        address supplier;
        uint256 amount;
        uint64 deadline;
        bytes32 descriptionHash;
        // État
        Status status;
        bool supplierConfirmed;
        uint64 approvedAt;
        address approvedBy;
    }

    struct Proof {
        string cid;
        address submitter;
        uint64 timestamp;
    }

    bytes32 public constant CONFIRM_TYPEHASH = keccak256(
        "ConfirmDelivery(address tracker,uint256 milestoneId,address supplier,uint256 amount,bytes32 proofHash,uint256 nonce,uint256 deadline)"
    );

    DonationVault public vault;
    AttestationRegistry public registry;
    address public org;
    bool public sequential;
    uint64 public gracePeriod;
    uint64 public challengePeriod;

    Milestone[] private _milestones;
    mapping(uint256 id => Proof[]) private _proofs;
    mapping(address supplier => uint256) public nonces;

    /// @notice Somme des montants des jalons engagés (Pending, Submitted, Approved, Released).
    uint256 public committed;
    /// @notice Nombre de jalons en cours (Pending, Submitted, Approved).
    uint256 public activeCount;

    event MilestoneCreated(
        uint256 indexed id, address indexed supplier, uint256 amount, uint64 deadline, bytes32 descriptionHash
    );
    event MilestoneLocked(uint256 indexed id);
    event MilestoneSubmitted(uint256 indexed id, string cid, uint256 proofIndex);
    event DeliveryConfirmed(uint256 indexed id, address indexed supplier, bytes32 proofHash);
    event MilestoneApproved(uint256 indexed id, address indexed auditor);
    event MilestoneRejected(uint256 indexed id, address indexed auditor, string reason);
    event MilestoneCancelled(uint256 indexed id);
    event MilestoneExpired(uint256 indexed id);
    event MilestoneReleased(uint256 indexed id, address indexed supplier, uint256 amount);
    event CampaignClosed();

    error NotOrg();
    error NotAuditor();
    error NotAttestedSupplier();
    error SeparationOfPowers();
    error InvalidStatus(Status current);
    error InvalidParams();
    error ExceedsRaised();
    error MilestoneInProgress();
    error ChallengePeriodActive();
    error NotExpired();
    error SignatureExpired();
    error InvalidSignature();
    error UnknownMilestone();
    error CampaignNotActive();

    modifier onlyOrg() {
        if (msg.sender != org || !registry.hasRole(registry.ORG_ROLE(), msg.sender)) revert NotOrg();
        _;
    }

    constructor() EIP712("DonChain MilestoneTracker", "1") {
        _disableInitializers();
    }

    struct InitParams {
        DonationVault vault;
        AttestationRegistry registry;
        address org;
        bool sequential;
        uint64 gracePeriod;
        uint64 challengePeriod;
    }

    function initialize(InitParams calldata p) external initializer {
        if (address(p.vault) == address(0) || address(p.registry) == address(0) || p.org == address(0)) {
            revert InvalidParams();
        }
        vault = p.vault;
        registry = p.registry;
        org = p.org;
        sequential = p.sequential;
        gracePeriod = p.gracePeriod;
        challengePeriod = p.challengePeriod;
    }

    // ------------------------------------------------------------------
    // Lecture
    // ------------------------------------------------------------------

    function milestoneCount() external view returns (uint256) {
        return _milestones.length;
    }

    function getMilestone(uint256 id) external view returns (Milestone memory) {
        return _get(id);
    }

    function proofCount(uint256 id) external view returns (uint256) {
        return _proofs[id].length;
    }

    function getProof(uint256 id, uint256 index) external view returns (Proof memory) {
        return _proofs[id][index];
    }

    /// @notice Hash de la dernière preuve soumise (couvert par la signature du prestataire).
    function latestProofHash(uint256 id) public view returns (bytes32) {
        Proof[] storage proofs = _proofs[id];
        if (proofs.length == 0) return bytes32(0);
        return keccak256(bytes(proofs[proofs.length - 1].cid));
    }

    /// @notice Digest EIP-712 que le prestataire doit signer pour confirmer la livraison.
    function confirmDigest(uint256 id, uint256 sigDeadline) public view returns (bytes32) {
        Milestone storage m = _get(id);
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    CONFIRM_TYPEHASH,
                    address(this),
                    id,
                    m.supplier,
                    m.amount,
                    latestProofHash(id),
                    nonces[m.supplier],
                    sigDeadline
                )
            )
        );
    }

    // ------------------------------------------------------------------
    // Organisation
    // ------------------------------------------------------------------

    /// @notice Crée un jalon. Prestataire, montant, date limite et description sont figés à vie.
    function createMilestone(address supplier, uint256 amount, uint64 deadline, bytes32 descriptionHash)
        external
        onlyOrg
        returns (uint256 id)
    {
        DonationVault.State s = vault.state();
        if (s != DonationVault.State.Funding && s != DonationVault.State.Active) revert CampaignNotActive();
        if (amount == 0 || deadline <= block.timestamp || descriptionHash == bytes32(0)) revert InvalidParams();
        if (supplier == org) revert SeparationOfPowers();
        if (!registry.hasRole(registry.SUPPLIER_ROLE(), supplier)) revert NotAttestedSupplier();

        id = _milestones.length;
        _milestones.push(
            Milestone({
                supplier: supplier,
                amount: amount,
                deadline: deadline,
                descriptionHash: descriptionHash,
                status: Status.Draft,
                supplierConfirmed: false,
                approvedAt: 0,
                approvedBy: address(0)
            })
        );
        emit MilestoneCreated(id, supplier, amount, deadline, descriptionHash);
    }

    /// @notice Draft -> Pending : engage les fonds. Exige une campagne Active.
    function lockMilestone(uint256 id) external onlyOrg {
        Milestone storage m = _get(id);
        _requireStatus(m, Status.Draft);
        _requireActive();
        if (m.deadline <= block.timestamp) revert InvalidParams();
        if (sequential && activeCount != 0) revert MilestoneInProgress();
        if (committed + m.amount > vault.totalRaised()) revert ExceedsRaised();

        m.status = Status.Pending;
        committed += m.amount;
        activeCount++;
        emit MilestoneLocked(id);
    }

    /// @notice Soumet (ou révise) une preuve IPFS. L'historique n'est jamais écrasé (§7.5).
    /// @dev Une révision invalide la confirmation du prestataire, qui doit re-signer.
    function submitProof(uint256 id, string calldata cid) external onlyOrg {
        Milestone storage m = _get(id);
        if (m.status != Status.Pending && m.status != Status.Submitted) revert InvalidStatus(m.status);
        if (bytes(cid).length == 0) revert InvalidParams();
        _requireActive();

        _proofs[id].push(Proof({cid: cid, submitter: msg.sender, timestamp: uint64(block.timestamp)}));
        m.status = Status.Submitted;
        m.supplierConfirmed = false;
        emit MilestoneSubmitted(id, cid, _proofs[id].length - 1);
    }

    /// @notice Pending -> Cancelled (ou Draft -> Cancelled). Impossible une fois la preuve soumise.
    function cancel(uint256 id) external onlyOrg {
        Milestone storage m = _get(id);
        if (m.status == Status.Pending) {
            committed -= m.amount;
            activeCount--;
        } else if (m.status != Status.Draft) {
            revert InvalidStatus(m.status);
        }
        m.status = Status.Cancelled;
        emit MilestoneCancelled(id);
    }

    /// @notice Clôture la campagne : le reliquat non libéré devient remboursable au prorata.
    function closeCampaign() external onlyOrg {
        if (activeCount != 0) revert MilestoneInProgress();
        vault.complete();
        emit CampaignClosed();
    }

    // ------------------------------------------------------------------
    // Prestataire
    // ------------------------------------------------------------------

    /// @notice Accusé de réception signé par le prestataire figé (EIP-712, relayable par n'importe qui).
    /// @dev Protégé contre le rejeu : nonce, chainId et verifyingContract (domaine), date d'expiration.
    ///      Supporte les smart wallets (ERC-1271) via SignatureChecker.
    function confirmDelivery(uint256 id, uint256 sigDeadline, bytes calldata signature) external {
        Milestone storage m = _get(id);
        _requireStatus(m, Status.Submitted);
        if (block.timestamp > sigDeadline) revert SignatureExpired();

        bytes32 digest = confirmDigest(id, sigDeadline);
        if (!SignatureChecker.isValidSignatureNow(m.supplier, digest, signature)) revert InvalidSignature();

        nonces[m.supplier]++;
        m.supplierConfirmed = true;
        emit DeliveryConfirmed(id, m.supplier, latestProofHash(id));
    }

    // ------------------------------------------------------------------
    // Auditeur
    // ------------------------------------------------------------------

    /// @notice Submitted -> Approved. Exige la confirmation préalable du prestataire (§5.2).
    function approve(uint256 id) external {
        Milestone storage m = _get(id);
        _requireAuditor(m);
        _requireStatus(m, Status.Submitted);
        if (!m.supplierConfirmed) revert InvalidStatus(m.status);
        _requireActive();

        m.status = Status.Approved;
        m.approvedAt = uint64(block.timestamp);
        m.approvedBy = msg.sender;
        emit MilestoneApproved(id, msg.sender);
    }

    /// @notice Submitted -> Rejected (définitif). Les fonds réservés redeviennent disponibles.
    function reject(uint256 id, string calldata reason) external {
        Milestone storage m = _get(id);
        _requireAuditor(m);
        _requireStatus(m, Status.Submitted);

        m.status = Status.Rejected;
        committed -= m.amount;
        activeCount--;
        emit MilestoneRejected(id, msg.sender, reason);
    }

    // ------------------------------------------------------------------
    // Public (sans permission)
    // ------------------------------------------------------------------

    /// @notice Approved -> Released après la fenêtre de contestation. Appelable par tous.
    function executeRelease(uint256 id) external {
        Milestone storage m = _get(id);
        _requireStatus(m, Status.Approved);
        if (block.timestamp < m.approvedAt + challengePeriod) revert ChallengePeriodActive();
        // Une adresse dont l'attestation a été révoquée ne peut pas recevoir de fonds (§7.3)
        if (!registry.hasRole(registry.SUPPLIER_ROLE(), m.supplier)) revert NotAttestedSupplier();

        m.status = Status.Released;
        activeCount--;
        // `committed` conserve le montant : il a été dépensé.
        emit MilestoneReleased(id, m.supplier, m.amount);

        vault.release(id, m.supplier, m.amount);
    }

    /// @notice Pending/Submitted -> Expired après deadline + délai de grâce : la campagne passe Halted.
    function expire(uint256 id) external {
        Milestone storage m = _get(id);
        if (m.status != Status.Pending && m.status != Status.Submitted) revert InvalidStatus(m.status);
        if (block.timestamp <= uint256(m.deadline) + gracePeriod) revert NotExpired();

        m.status = Status.Expired;
        committed -= m.amount;
        activeCount--;
        emit MilestoneExpired(id);

        if (vault.state() == DonationVault.State.Active) vault.halt();
    }

    // ------------------------------------------------------------------
    // Internes
    // ------------------------------------------------------------------

    function _get(uint256 id) private view returns (Milestone storage) {
        if (id >= _milestones.length) revert UnknownMilestone();
        return _milestones[id];
    }

    function _requireStatus(Milestone storage m, Status expected) private view {
        if (m.status != expected) revert InvalidStatus(m.status);
    }

    function _requireActive() private view {
        if (vault.state() != DonationVault.State.Active) revert CampaignNotActive();
    }

    /// @dev Séparation des pouvoirs : l'auditeur est attesté et distinct de l'org et du prestataire.
    function _requireAuditor(Milestone storage m) private view {
        if (!registry.hasRole(registry.AUDITOR_ROLE(), msg.sender)) revert NotAuditor();
        if (msg.sender == org || msg.sender == m.supplier) revert SeparationOfPowers();
    }
}
