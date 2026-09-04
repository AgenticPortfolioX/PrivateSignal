// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IPrivateSignalReceiver
 * @notice Interface for on-chain contracts receiving attested private signals from CRE DON
 */
interface IPrivateSignalReceiver {
    event SignalReceived(
        bytes32 indexed signalId,
        uint256 indexed timestamp,
        int256 signalValue,
        uint256 confidenceBps,
        bytes metadata
    );

    /**
     * @notice Updates the verified private signal on-chain
     * @param signalId Unique identifier of the signal stream
     * @param timestamp DON timestamp of generation
     * @param signalValue Scaled value (1e8 or 1e18) of the evaluated signal
     * @param confidenceBps Confidence in basis points (0 - 10000)
     * @param metadata Encrypted or hashed payload metadata
     */
    function onSignalUpdate(
        bytes32 signalId,
        uint256 timestamp,
        int256 signalValue,
        uint256 confidenceBps,
        bytes calldata metadata
    ) external;
}
