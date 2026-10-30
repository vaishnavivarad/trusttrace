// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract TrustTraceCloudDB {
    string public latestStateCID;
    uint256 public updatedAt;

    event StateUpdated(string cid, uint256 timestamp);

    function setLatestStateCID(string memory _cid) public {
        latestStateCID = _cid;
        updatedAt = block.timestamp;
        emit StateUpdated(_cid, block.timestamp);
    }
}
