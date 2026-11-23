// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {AgentRegistry} from "./AgentRegistry.sol";

/// @title RewardReserve
/// @notice Replaces the old PrizePool. Holds real DOGE and pays achievement / first-clear /
///         milestone rewards. The game server verifies a run (re-simulating it from seed + replay),
///         then signs an EIP-712 voucher. The player redeems the voucher here.
///
///         Protections:
///         - each (rewardId, player) pays at most once
///         - per-claim maximum, per-player daily cap, global daily cap
///         - cannot pay more than the reserve actually holds
///         - vouchers expire; only the named player can redeem
///         - pausable by admin
contract RewardReserve is AccessControl, Pausable, ReentrancyGuard, EIP712 {
    bytes32 public constant SIGNER_ROLE = keccak256("SIGNER_ROLE");
    bytes32 public constant CLAIM_TYPEHASH =
        keccak256("RewardClaim(address player,bytes32 rewardId,uint256 amount,uint256 deadline)");

    AgentRegistry public immutable registry;

    uint256 public maxPerClaim;
    uint256 public playerDailyCap;
    uint256 public globalDailyCap;

    uint256 public totalFunded;
    uint256 public totalPaid;

    uint256 public currentDay;
    uint256 public paidToday;
    mapping(address => uint256) public playerDay;
    mapping(address => uint256) public playerPaidToday;

    mapping(bytes32 => mapping(address => bool)) public claimed;

    error Expired();
    error NoAgent();
    error AlreadyClaimed();
    error AmountOutOfRange();
    error BadSignature();
    error PlayerDailyCapReached();
    error GlobalDailyCapReached();
    error InsufficientReserve();
    error TransferFailed();

    event Funded(address indexed from, uint256 amount);
    event RewardClaimed(address indexed player, bytes32 indexed rewardId, uint256 amount);
    event LimitsUpdated(uint256 maxPerClaim, uint256 playerDailyCap, uint256 globalDailyCap);
    event Withdrawn(address indexed to, uint256 amount);

    constructor(
        address admin,
        address signer,
        AgentRegistry registry_,
        uint256 maxPerClaim_,
        uint256 playerDailyCap_,
        uint256 globalDailyCap_
    ) EIP712("AFTERMAZE RewardReserve", "1") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(SIGNER_ROLE, signer);
        registry = registry_;
        _setLimits(maxPerClaim_, playerDailyCap_, globalDailyCap_);
    }

    // ---------------------------------------------------------------- funding

    receive() external payable {
        totalFunded += msg.value;
        emit Funded(msg.sender, msg.value);
    }

    function fund() external payable {
        totalFunded += msg.value;
        emit Funded(msg.sender, msg.value);
    }

    // ----------------------------------------------------------------- claims

    function claim(bytes32 rewardId, uint256 amount, uint256 deadline, bytes calldata signature)
        external
        nonReentrant
        whenNotPaused
    {
        address player = msg.sender;
        if (block.timestamp > deadline) revert Expired();
        if (claimed[rewardId][player]) revert AlreadyClaimed();
        if (amount == 0 || amount > maxPerClaim) revert AmountOutOfRange();
        if (!registry.hasAgent(player)) revert NoAgent();

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(CLAIM_TYPEHASH, player, rewardId, amount, deadline)));
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
        if (err != ECDSA.RecoverError.NoError || !hasRole(SIGNER_ROLE, signer)) revert BadSignature();

        uint256 day = block.timestamp / 1 days;
        if (day != currentDay) {
            currentDay = day;
            paidToday = 0;
        }
        if (playerDay[player] != day) {
            playerDay[player] = day;
            playerPaidToday[player] = 0;
        }
        if (playerPaidToday[player] + amount > playerDailyCap) revert PlayerDailyCapReached();
        if (paidToday + amount > globalDailyCap) revert GlobalDailyCapReached();
        if (address(this).balance < amount) revert InsufficientReserve();

        claimed[rewardId][player] = true;
        playerPaidToday[player] += amount;
        paidToday += amount;
        totalPaid += amount;

        (bool ok,) = payable(player).call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit RewardClaimed(player, rewardId, amount);
    }

    /// @notice Lets the frontend/backend build the exact digest the signer must sign.
    function claimDigest(address player, bytes32 rewardId, uint256 amount, uint256 deadline)
        external
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(keccak256(abi.encode(CLAIM_TYPEHASH, player, rewardId, amount, deadline)));
    }

    // ------------------------------------------------------------------ admin

    function setLimits(uint256 maxPerClaim_, uint256 playerDailyCap_, uint256 globalDailyCap_)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _setLimits(maxPerClaim_, playerDailyCap_, globalDailyCap_);
    }

    /// @notice Move DOGE out (e.g. end of season, migration). Always emits an event.
    function withdraw(address payable to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(to, amount);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    function _setLimits(uint256 maxPerClaim_, uint256 playerDailyCap_, uint256 globalDailyCap_) private {
        maxPerClaim = maxPerClaim_;
        playerDailyCap = playerDailyCap_;
        globalDailyCap = globalDailyCap_;
        emit LimitsUpdated(maxPerClaim_, playerDailyCap_, globalDailyCap_);
    }
}
