// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title MatchResults
/// @notice Optional on-chain "seal" for verified solo runs. Full match history and replays stay in
///         the database; this stores only a hash of the replay plus the score, so a player can prove
///         NOVA's run #1 vs run #20 and personal bests can't be edited after the fact.
///         The game server signs each verified run; the player submits it (and pays the gas).
contract MatchResults is AccessControl, EIP712 {
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant RUN_TYPEHASH =
        keccak256("RunResult(bytes32 runId,address player,uint8 mode,bytes32 mazeId,uint32 score,bytes32 replayHash)");

    /// @dev 0 Daily, 1 Survival, 2 Special, 3 Endless. Training runs are never sealed.
    uint8 public constant MODE_COUNT = 4;

    mapping(bytes32 => bool) public recorded;
    mapping(address => mapping(uint8 => uint32)) public personalBest;
    mapping(address => uint32) public sealedRuns;

    error InvalidMode();
    error AlreadyRecorded();
    error BadSignature();

    event RunRecorded(
        bytes32 indexed runId,
        address indexed player,
        uint8 indexed mode,
        bytes32 mazeId,
        uint32 score,
        bytes32 replayHash,
        bool newPersonalBest
    );

    constructor(address admin, address verifier) EIP712("AFTERMAZE MatchResults", "1") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(VERIFIER_ROLE, verifier);
    }

    function submit(
        bytes32 runId,
        uint8 mode,
        bytes32 mazeId,
        uint32 score,
        bytes32 replayHash,
        bytes calldata signature
    ) external {
        if (mode >= MODE_COUNT) revert InvalidMode();
        if (recorded[runId]) revert AlreadyRecorded();

        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(RUN_TYPEHASH, runId, msg.sender, mode, mazeId, score, replayHash))
        );
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
        if (err != ECDSA.RecoverError.NoError || !hasRole(VERIFIER_ROLE, signer)) revert BadSignature();

        recorded[runId] = true;
        unchecked { sealedRuns[msg.sender]++; }

        bool isBest = score > personalBest[msg.sender][mode];
        if (isBest) personalBest[msg.sender][mode] = score;

        emit RunRecorded(runId, msg.sender, mode, mazeId, score, replayHash, isBest);
    }
}
