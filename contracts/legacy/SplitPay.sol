// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title SplitPay
/// @notice Atomically splits a USDC payment across multiple recipients by basis-point shares.
/// @dev The contract is intentionally non-custodial and holds USDC only transiently during splitPay execution.
/// @dev Non-custodial: the contract holds USDC only transiently within splitPay. Unsolicited ERC-20 tokens sent directly to this address cannot be recovered via splitPay and will remain stuck unless rescued via rescueToken.
contract SplitPay {
    using SafeERC20 for IERC20;

    /// @notice 100% in basis points.
    uint16 public constant BASIS_POINTS = 10_000;

    /// @notice Maximum number of recipients allowed in one split.
    uint8 public constant MAX_RECIPIENTS = 10;

    /// @notice Maximum totalAmount to prevent overflow in basis-point multiplication.
    /// @dev type(uint256).max / BASIS_POINTS. Unreachable for USDC (6 dec) in practice.
    uint256 public constant MAX_TOTAL_AMOUNT = type(uint256).max / 10_000;

    /// @notice USDC token address used for all split payments.
    address public immutable usdcToken;

    /// @dev Manual non-reentrancy lock.
    bool private _locked;

    /// @notice Recipient and share definition.
    /// @param recipient Address that receives a split amount.
    /// @param basisPoints Share for this recipient out of 10,000.
    struct RecipientShare {
        address recipient;
        uint16 basisPoints;
    }

    /// @notice Emitted after a successful split payment execution.
    /// @param payer Address that initiated and funded the split.
    /// @param totalAmount Total USDC amount split.
    /// @param recipients Recipient addresses in execution order.
    /// @param amounts Final distributed amount for each recipient.
    /// @param timestamp Block timestamp when payment was executed.
    event PaymentExecuted(
        address indexed payer,
        uint256 totalAmount,
        address[] recipients,
        uint256[] amounts,
        uint256 indexed timestamp
    );

    /// @notice Thrown when total amount is zero.
    error ZeroAmount();

    /// @notice Thrown when totalAmount exceeds safe multiplication bound.
    error AmountTooLarge();

    /// @notice Thrown when fewer than 2 recipients are provided.
    error TooFewRecipients();

    /// @notice Thrown when recipient count exceeds MAX_RECIPIENTS.
    /// @param got Number of recipients provided.
    /// @param max Maximum allowed recipients.
    error TooManyRecipients(uint256 got, uint256 max);

    /// @notice Thrown when a recipient address is zero.
    /// @param index Recipient index with zero address.
    error ZeroAddressRecipient(uint256 index);

    /// @notice Thrown when a recipient share is zero.
    /// @param index Recipient index with zero basis points.
    error ZeroShareBasisPoints(uint256 index);

    /// @notice Thrown when duplicate recipients are present.
    /// @param recipient Duplicate recipient address.
    error DuplicateRecipient(address recipient);

    /// @notice Thrown when total basis points does not equal BASIS_POINTS.
    /// @param got Sum of basis points provided.
    /// @param expected Expected total basis points (10,000).
    error InvalidTotalBasisPoints(uint256 got, uint256 expected);

    /// @notice Thrown when post-distribution invariant checks fail.
    error DistributionError();

    /// @notice Thrown when attempting to rescue USDC via rescueToken.
    error CannotRescueUSDC();

    /// @notice Thrown when rescueToken caller tries to send to a different address.
    error RescueToMustBeCaller();

    /// @notice Thrown when rescue amount is zero.
    error RescueZeroAmount();

    /// @notice Prevents reentrant calls to protected functions.
    modifier nonReentrant() {
        if (_locked) revert DistributionError();
        _locked = true;
        _;
        _locked = false;
    }

    /// @notice Creates the SplitPay contract for a specific USDC token.
    /// @param _usdcToken ERC-20 token address to use (Arc Testnet USDC).
    constructor(address _usdcToken) {
        if (_usdcToken == address(0)) revert ZeroAddressRecipient(0);
        usdcToken = _usdcToken;
    }

    /// @notice Splits a USDC payment across recipients in one atomic transaction.
    /// @dev Rounding policy: each recipient gets floor(totalAmount * basisPoints / 10,000),
    ///      and any remainder from integer division is assigned to the last recipient.
    ///      This guarantees the distributed total equals totalAmount exactly.
    /// @dev If any recipient address is blocked by the USDC token issuer, safeTransfer will revert and the entire payment is rolled back. Screen recipients before inclusion.
    /// @param totalAmount Total USDC amount to split.
    /// @param shares Recipient share definitions in basis points.
    function splitPay(uint256 totalAmount, RecipientShare[] calldata shares) external nonReentrant {
        _validateShares(totalAmount, shares);

        IERC20 token = IERC20(usdcToken);

        token.safeTransferFrom(msg.sender, address(this), totalAmount);

        uint256 len = shares.length;
        uint256[] memory distributedAmounts = new uint256[](len);
        address[] memory recipientAddresses = new address[](len);

        uint256 distributed;
        for (uint256 i = 0; i < len; i++) {
            recipientAddresses[i] = shares[i].recipient;

            uint256 amount = (totalAmount * shares[i].basisPoints) / BASIS_POINTS;
            if (i == len - 1) {
                // Assign any rounding remainder to the last recipient so that
                // the total distributed equals totalAmount exactly.
                amount = totalAmount - distributed;
            } else {
                distributed += amount;
            }

            distributedAmounts[i] = amount;
            token.safeTransfer(shares[i].recipient, amount);
        }

        emit PaymentExecuted(msg.sender, totalAmount, recipientAddresses, distributedAmounts, block.timestamp);
    }

    /// @notice Recovers non-USDC ERC-20 tokens accidentally sent to this contract.
    /// @dev Permissionless but self-directed: tokens are always sent to msg.sender,
    ///      eliminating front-running theft. USDC rescue is intentionally blocked
    ///      (CannotRescueUSDC) to avoid requiring an admin role.
    ///      Anyone may call this function; they can only recover tokens to themselves.
    /// @param token  ERC-20 token address (must not be usdcToken).
    /// @param to     Must equal msg.sender. Tokens are transferred to this address.
    /// @param amount Amount to transfer (must be > 0).
    function rescueToken(address token, address to, uint256 amount) external {
        if (token == usdcToken) revert CannotRescueUSDC();
        if (to == address(0)) revert ZeroAddressRecipient(0);
        if (to != msg.sender) revert RescueToMustBeCaller();
        if (amount == 0) revert RescueZeroAmount();
        IERC20(token).safeTransfer(to, amount);
    }

    /// @notice Previews split amounts and validates configuration without token transfers.
    /// @dev Returns valid=false with errorMsg instead of reverting for invalid inputs.
    /// @param totalAmount Total USDC amount to split.
    /// @param shares Recipient share definitions in basis points.
    /// @return amounts Per-recipient distribution amounts if valid; empty if invalid.
    /// @return valid True when input configuration is valid.
    /// @return errorMsg Human-readable validation error when invalid.
    function previewSplit(
        uint256 totalAmount,
        RecipientShare[] calldata shares
    ) external pure returns (uint256[] memory amounts, bool valid, string memory errorMsg) {
        if (totalAmount == 0) {
            return (new uint256[](0), false, "ZeroAmount");
        }
        if (totalAmount > MAX_TOTAL_AMOUNT) {
            return (new uint256[](0), false, "AmountTooLarge");
        }

        uint256 len = shares.length;
        if (len < 2) {
            return (new uint256[](0), false, "TooFewRecipients");
        }

        if (len > MAX_RECIPIENTS) {
            return (new uint256[](0), false, "TooManyRecipients");
        }

        uint256 totalBasisPoints;
        amounts = new uint256[](len);

        for (uint256 i = 0; i < len; i++) {
            if (shares[i].recipient == address(0)) {
                return (new uint256[](0), false, "ZeroAddressRecipient");
            }
            if (shares[i].basisPoints == 0) {
                return (new uint256[](0), false, "ZeroShareBasisPoints");
            }

            for (uint256 j = 0; j < i; j++) {
                if (shares[j].recipient == shares[i].recipient) {
                    return (new uint256[](0), false, "DuplicateRecipient");
                }
            }

            totalBasisPoints += shares[i].basisPoints;
        }

        if (totalBasisPoints != BASIS_POINTS) {
            return (new uint256[](0), false, "InvalidTotalBasisPoints");
        }

        uint256 distributed;
        for (uint256 i = 0; i < len; i++) {
            uint256 amount = (totalAmount * shares[i].basisPoints) / BASIS_POINTS;
            if (i == len - 1) {
                amount = totalAmount - distributed;
            } else {
                distributed += amount;
            }
            amounts[i] = amount;
        }

        return (amounts, true, "");
    }

    /// @dev Shared validation logic for splitPay.
    function _validateShares(uint256 totalAmount, RecipientShare[] calldata shares) internal pure {
        if (totalAmount == 0) revert ZeroAmount();
        if (totalAmount > MAX_TOTAL_AMOUNT) revert AmountTooLarge();

        uint256 len = shares.length;
        if (len < 2) revert TooFewRecipients();
        if (len > MAX_RECIPIENTS) revert TooManyRecipients(len, MAX_RECIPIENTS);

        uint256 totalBasisPoints;
        for (uint256 i = 0; i < len; i++) {
            RecipientShare calldata share = shares[i];

            if (share.recipient == address(0)) revert ZeroAddressRecipient(i);
            if (share.basisPoints == 0) revert ZeroShareBasisPoints(i);

            for (uint256 j = 0; j < i; j++) {
                if (shares[j].recipient == share.recipient) {
                    revert DuplicateRecipient(share.recipient);
                }
            }

            totalBasisPoints += share.basisPoints;
        }

        if (totalBasisPoints != BASIS_POINTS) {
            revert InvalidTotalBasisPoints(totalBasisPoints, BASIS_POINTS);
        }
    }
}
