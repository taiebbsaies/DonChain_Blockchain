// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @dev Interface ERC-5192 (Minimal Soulbound NFT)
interface IERC5192 {
    event Locked(uint256 tokenId);
    event Unlocked(uint256 tokenId);

    function locked(uint256 tokenId) external view returns (bool);
}

/// @title Reçu de don non transférable (Soulbound Token)
/// @notice Seul le Vault (MINTER_ROLE) peut émettre un reçu. Aucune donnée personnelle.
contract DonationReceipt is ERC721, AccessControl, IERC5192 {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    struct Receipt {
        address campaign;
        uint256 amount;
        uint64 timestamp;
    }

    uint256 private _nextId = 1;
    mapping(uint256 => Receipt) private _receipts;

    error SoulboundToken();

    constructor(address admin) ERC721("DonChain Receipt", "DCR") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function mint(address donor, address campaign, uint256 amount)
        external
        onlyRole(MINTER_ROLE)
        returns (uint256 id)
    {
        id = _nextId++;
        _receipts[id] = Receipt(campaign, amount, uint64(block.timestamp));
        // _mint (et non _safeMint) : évite un callback vers le donateur (réentrance)
        _mint(donor, id);
        emit Locked(id);
    }

    function receiptOf(uint256 id) external view returns (Receipt memory) {
        _requireOwned(id);
        return _receipts[id];
    }

    /// @inheritdoc IERC5192
    function locked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    /// @dev Bloque tout transfert et toute destruction : seul le mint est autorisé
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        if (_ownerOf(tokenId) != address(0)) revert SoulboundToken();
        return super._update(to, tokenId, auth);
    }

    function approve(address, uint256) public pure override {
        revert SoulboundToken();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert SoulboundToken();
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl)
        returns (bool)
    {
        return interfaceId == 0xb45a3c0e // ERC-5192
            || super.supportsInterface(interfaceId);
    }
}