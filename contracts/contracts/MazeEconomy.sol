// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AgentRegistry} from "./AgentRegistry.sol";

/// @title MazeEconomy
/// @notice DOGE-only shop. Players pay native DOGE for Special Maze entries and cosmetics.
///         A configurable share of every purchase is forwarded to the RewardReserve so the
///         reward pool is funded by real revenue, never by minted tokens.
contract MazeEconomy is Ownable, Pausable, ReentrancyGuard {
    enum ItemKind { SpecialMaze, Skin, Trail, VictoryAnimation, Nameplate }

    struct Item {
        uint128 price; // in wei of native DOGE (18 decimals)
        ItemKind kind;
        bool active;
        bool exists;
    }

    uint16 public constant MAX_BPS = 10_000;

    AgentRegistry public immutable registry;
    address payable public treasury;
    address payable public rewardReserve;
    uint16 public reserveBps;

    mapping(uint256 => Item) public items;
    /// @notice Cosmetics: owned once, forever.
    mapping(address => mapping(uint256 => bool)) public owns;
    /// @notice Special mazes: count of entries bought. The game backend tracks how many were used.
    mapping(address => mapping(uint256 => uint256)) public entriesPurchased;

    error UnknownItem();
    error ItemInactive();
    error WrongPayment();
    error NoAgent();
    error AlreadyOwned();
    error InvalidConfig();
    error TransferFailed();

    event ItemSet(uint256 indexed itemId, ItemKind kind, uint128 price, bool active);
    event Purchased(address indexed player, uint256 indexed itemId, ItemKind kind, uint256 price, uint256 toReserve);
    event PayoutConfigUpdated(address treasury, address rewardReserve, uint16 reserveBps);

    constructor(
        address owner_,
        AgentRegistry registry_,
        address payable treasury_,
        address payable rewardReserve_,
        uint16 reserveBps_
    ) Ownable(owner_) {
        registry = registry_;
        _setPayoutConfig(treasury_, rewardReserve_, reserveBps_);
    }

    // ----------------------------------------------------------------- player

    function buy(uint256 itemId) external payable nonReentrant whenNotPaused {
        Item memory it = items[itemId];
        if (!it.exists) revert UnknownItem();
        if (!it.active) revert ItemInactive();
        if (msg.value != it.price) revert WrongPayment();
        if (!registry.hasAgent(msg.sender)) revert NoAgent();

        if (it.kind == ItemKind.SpecialMaze) {
            entriesPurchased[msg.sender][itemId] += 1;
        } else {
            if (owns[msg.sender][itemId]) revert AlreadyOwned();
            owns[msg.sender][itemId] = true;
        }

        uint256 toReserve = rewardReserve == address(0) ? 0 : (msg.value * reserveBps) / MAX_BPS;
        uint256 toTreasury = msg.value - toReserve;

        if (toReserve > 0) _send(rewardReserve, toReserve);
        if (toTreasury > 0) _send(treasury, toTreasury);

        emit Purchased(msg.sender, itemId, it.kind, msg.value, toReserve);
    }

    // ------------------------------------------------------------------ admin

    function setItem(uint256 itemId, ItemKind kind, uint128 price, bool active) external onlyOwner {
        Item storage it = items[itemId];
        // An item's kind is fixed once created, so ownership/entry records stay meaningful.
        if (it.exists && it.kind != kind) revert InvalidConfig();
        items[itemId] = Item(price, kind, active, true);
        emit ItemSet(itemId, kind, price, active);
    }

    function setPayoutConfig(address payable treasury_, address payable rewardReserve_, uint16 reserveBps_)
        external
        onlyOwner
    {
        _setPayoutConfig(treasury_, rewardReserve_, reserveBps_);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // --------------------------------------------------------------- internal

    function _setPayoutConfig(address payable treasury_, address payable rewardReserve_, uint16 reserveBps_)
        private
    {
        if (treasury_ == address(0) || reserveBps_ > MAX_BPS) revert InvalidConfig();
        treasury = treasury_;
        rewardReserve = rewardReserve_;
        reserveBps = reserveBps_;
        emit PayoutConfigUpdated(treasury_, rewardReserve_, reserveBps_);
    }

    function _send(address payable to, uint256 amount) private {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
