// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title Registre des acteurs attestés (KYC)
/// @notice Whitelist des organisations, prestataires, auditeurs et pauseurs (§7.3, §9.1).
/// @dev MVP : rôles AccessControl gérés par l'admin (multisig Safe + timelock en production).
///      Phase 2 : remplacer par une intégration EAS en gardant la même interface `hasRole`.
contract AttestationRegistry is AccessControl {
    bytes32 public constant ORG_ROLE = keccak256("ORG_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");
    bytes32 public constant SUPPLIER_ROLE = keccak256("SUPPLIER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    error ZeroAddress();

    /// @param admin Adresse du multisig (jamais une EOA en production)
    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }
}
