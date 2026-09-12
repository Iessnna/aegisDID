// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract AegisCredentialRegistry {
    address public immutable owner;

    struct CredentialAnchor {
        address issuer;
        string holder;
        uint256 timestamp;
    }

    mapping(bytes32 => CredentialAnchor) public credentials;
    mapping(bytes32 => string) public didKeys;
    mapping(bytes32 => bool) public auditRecords;

    event CredentialAnchored(bytes32 indexed credentialHash, address indexed issuer, string holder);
    event DIDRegistered(bytes32 indexed didHash, string did);
    event AuditRecorded(bytes32 indexed recordHash, string decision, uint256 humanityScore);

    modifier onlyOwner() {
        require(msg.sender == owner, "not registry owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function anchorCredential(bytes32 credentialHash, string calldata holder) external onlyOwner returns (bytes32) {
    require(
        credentials[credentialHash].timestamp == 0,
        "credential already anchored"
    );

    credentials[credentialHash] = CredentialAnchor(
        msg.sender,
        holder,
        block.timestamp
    );

    emit CredentialAnchored(
        credentialHash,
        msg.sender,
        holder
    );

    return credentialHash;
}

    function registerDID(string calldata did, bytes calldata publicKey) external onlyOwner returns (bytes32) {
        bytes32 didHash = keccak256(bytes(did));
        didKeys[didHash] = string(publicKey);
        emit DIDRegistered(didHash, did);
        return didHash;
    }

    function logAuditRecord(bytes32 recordHash, string calldata decision, uint256 humanityScore) external onlyOwner returns (bytes32) {
        auditRecords[recordHash] = true;
        emit AuditRecorded(recordHash, decision, humanityScore);
        return recordHash;
    }
}
