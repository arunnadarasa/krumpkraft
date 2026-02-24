// SPDX-License-Identifier: MIT
/**
 * @title KrumpKraftMod
 * @notice On-chain agent registry and positions for KrumpKraft on EVVM Story.
 * @author Asura aka Angel of Indian Krump
 * @custom:website https://asura.lovable.app/
 * @custom:initiative StreetKode Fam Initiative
 * @custom:credits StreetKode Fam: Asura, Hectik, Kronos, Jo
 */
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IKrumpKraftMod } from "./interfaces/IKrumpKraftMod.sol";

contract KrumpKraftMod is IKrumpKraftMod {
    // AgentRole: VERIFIER=0, TREASURY=1, MINER=2, CHOREOGRAPHER=3
    // AgentState: IDLE=0, PROCESSING=1, WAITING_PAYMENT=2, COMPLETED=3, ERROR=4

    mapping(address => Agent) public agents;
    address[] public registeredList;
    mapping(address => bool) public registeredAgents;
    address public admin;
    IERC20 public usdcKToken;

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    constructor(address _usdcK) {
        admin = msg.sender;
        usdcKToken = IERC20(_usdcK);
    }

    function registerAgent(address _agent, string memory _name, uint8 _role) external onlyAdmin returns (bool) {
        require(_agent != address(0), "Zero address");
        require(!registeredAgents[_agent], "Already registered");
        agents[_agent] = Agent({
            name: _name,
            role: _role,
            state: 0, // IDLE
            balance: 0,
            x: 0,
            y: 64,
            z: 0,
            isActive: true,
            lastUpdate: block.timestamp
        });
        registeredAgents[_agent] = true;
        registeredList.push(_agent);
        emit AgentRegistered(_agent, _role, _name);
        return true;
    }

    function updatePosition(address _agent, uint256 _x, uint256 _y, uint256 _z) external onlyAdmin {
        Agent storage a = agents[_agent];
        require(a.isActive, "Agent not active");
        a.x = _x;
        a.y = _y;
        a.z = _z;
        a.lastUpdate = block.timestamp;
        emit AgentPositionUpdated(_agent, _x, _y, _z);
    }

    function updateState(address _agent, uint8 _state) external onlyAdmin {
        Agent storage a = agents[_agent];
        require(a.isActive, "Agent not active");
        a.state = _state;
        a.lastUpdate = block.timestamp;
        emit AgentStateChanged(_agent, _state);
    }

    function syncBalance(address _agent, uint256 _balance) external onlyAdmin {
        Agent storage a = agents[_agent];
        require(a.isActive, "Agent not active");
        uint256 previous = a.balance;
        a.balance = _balance;
        a.lastUpdate = block.timestamp;
        emit AgentBalanceChanged(_agent, previous, _balance);
    }

    function getAgent(address _agent) external view returns (Agent memory) {
        return agents[_agent];
    }

    function getAllAgents() external view returns (Agent[] memory) {
        Agent[] memory result = new Agent[](registeredList.length);
        for (uint256 i = 0; i < registeredList.length; i++) {
            result[i] = agents[registeredList[i]];
        }
        return result;
    }

    function deactivateAgent(address _agent) external onlyAdmin {
        agents[_agent].isActive = false;
        registeredAgents[_agent] = false;
        // Keep in registeredList for getAllAgents; filter by isActive off-chain if needed
    }

    function transferAdmin(address _newAdmin) external onlyAdmin {
        admin = _newAdmin;
    }
}
