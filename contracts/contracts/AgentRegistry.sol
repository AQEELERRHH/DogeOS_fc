// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title AgentRegistry
/// @notice One NOVA agent per wallet. The record is bound to the wallet (not transferable).
///         Training data, coaching and learned behaviour live off-chain; this contract only
///         proves "this wallet owns this agent" so the economy and rewards can gate on it.
contract AgentRegistry is Ownable {
    struct Agent {
        string name;
        uint8 personality; // index into the off-chain personality list
        uint64 createdAt;
    }

    uint8 public personalityCount;
    uint256 public totalAgents;
    mapping(address => Agent) private _agents;

    error AlreadyRegistered();
    error NotRegistered();
    error InvalidName();
    error InvalidPersonality();

    event AgentCreated(address indexed owner, string name, uint8 personality);
    event AgentUpdated(address indexed owner, string name, uint8 personality);
    event PersonalityCountUpdated(uint8 count);

    constructor(address owner_, uint8 personalityCount_) Ownable(owner_) {
        _setPersonalityCount(personalityCount_);
    }

    function createAgent(string calldata name, uint8 personality) external {
        if (hasAgent(msg.sender)) revert AlreadyRegistered();
        _validate(name, personality);
        _agents[msg.sender] = Agent(name, personality, uint64(block.timestamp));
        unchecked { totalAgents++; }
        emit AgentCreated(msg.sender, name, personality);
    }

    function updateAgent(string calldata name, uint8 personality) external {
        if (!hasAgent(msg.sender)) revert NotRegistered();
        _validate(name, personality);
        Agent storage a = _agents[msg.sender];
        a.name = name;
        a.personality = personality;
        emit AgentUpdated(msg.sender, name, personality);
    }

    function hasAgent(address owner_) public view returns (bool) {
        return _agents[owner_].createdAt != 0;
    }

    function getAgent(address owner_) external view returns (Agent memory) {
        if (!hasAgent(owner_)) revert NotRegistered();
        return _agents[owner_];
    }

    function setPersonalityCount(uint8 count) external onlyOwner {
        _setPersonalityCount(count);
    }

    function _setPersonalityCount(uint8 count) private {
        if (count == 0) revert InvalidPersonality();
        personalityCount = count;
        emit PersonalityCountUpdated(count);
    }

    function _validate(string calldata name, uint8 personality) private view {
        uint256 len = bytes(name).length;
        if (len == 0 || len > 24) revert InvalidName();
        if (personality >= personalityCount) revert InvalidPersonality();
    }
}
