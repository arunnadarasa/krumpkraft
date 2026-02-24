// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IKrumpKraftMod {
    event AgentRegistered(address indexed agent, uint8 role, string name);
    event AgentPositionUpdated(address indexed agent, uint256 x, uint256 y, uint256 z);
    event AgentStateChanged(address indexed agent, uint8 state);
    event AgentBalanceChanged(address indexed agent, uint256 previous, uint256 current);

    struct Agent {
        string name;
        uint8 role;   // 0=Verifier, 1=Treasury, 2=Miner, 3=Choreographer
        uint8 state; // 0=Idle, 1=Processing, 2=WaitingPayment, 3=Completed, 4=Error
        uint256 balance;
        uint256 x;
        uint256 y;
        uint256 z;
        bool isActive;
        uint256 lastUpdate;
    }

    function registerAgent(address _agent, string memory _name, uint8 _role) external returns (bool);
    function updatePosition(address _agent, uint256 _x, uint256 _y, uint256 _z) external;
    function updateState(address _agent, uint8 _state) external;
    function syncBalance(address _agent, uint256 _balance) external;
    function getAgent(address _agent) external view returns (Agent memory);
    function deactivateAgent(address _agent) external;
}
