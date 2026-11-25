// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title MatchTickets
/// @notice DOGE FC charges a fixed fee to kick off a match. The fee goes straight to the
///         RewardReserve, which pays season and leaderboard prizes. A single match never pays out,
///         so the fee is an entry ticket, not a bet.
///
///         Each kick-off also fixes the match seed on-chain. The game is deterministic from its
///         seed, so a match started here can be re-simulated and checked later.
contract MatchTickets is Ownable, Pausable, ReentrancyGuard {
    address payable public reserve;
    uint256 public fee;
    uint256 public matchCount;
    mapping(address => uint256) public matchesPlayed;

    error WrongPayment();
    error ZeroAddress();
    error TransferFailed();

    event MatchStarted(uint256 indexed matchId, address indexed player, bytes32 indexed rival, bytes32 seed, uint256 fee);
    event FeeUpdated(uint256 fee);
    event ReserveUpdated(address reserve);

    constructor(address owner_, address payable reserve_, uint256 fee_) Ownable(owner_) {
        if (reserve_ == address(0)) revert ZeroAddress();
        reserve = reserve_;
        fee = fee_;
    }

    /// @param rival Identifier of the AI club being played (e.g. keccak256("iron-wolves")).
    function kickOff(bytes32 rival) external payable whenNotPaused nonReentrant returns (uint256 matchId, bytes32 seed) {
        if (msg.value != fee) revert WrongPayment();
        matchId = ++matchCount;
        matchesPlayed[msg.sender] += 1;
        // PREVRANDAO is 0 on DogeOS, so the seed mixes the previous block hash with the player
        // and the match number. Every match has a distinct seed.
        seed = keccak256(abi.encode(blockhash(block.number - 1), msg.sender, matchId, address(this)));
        (bool ok, ) = reserve.call{value: msg.value}("");
        if (!ok) revert TransferFailed();
        emit MatchStarted(matchId, msg.sender, rival, seed, msg.value);
    }

    function setFee(uint256 fee_) external onlyOwner {
        fee = fee_;
        emit FeeUpdated(fee_);
    }

    function setReserve(address payable reserve_) external onlyOwner {
        if (reserve_ == address(0)) revert ZeroAddress();
        reserve = reserve_;
        emit ReserveUpdated(reserve_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
