// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/// @dev Minimal EIP-3009 surface of Circle's FiatToken (USDC).
interface IERC3009 {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

/// @title ParcPay
/// @notice USDC payment router for Arc: one payment, many recipients, exact amounts,
///         a flat protocol fee, and signed (EIP-712) scheduled / recurring orders.
/// @dev Security model
///   - Non-custodial: `splitPay` and `executeOrder` move USDC straight from the payer to each
///     recipient with `transferFrom`; the contract never holds user funds between transactions.
///     `splitPayWithAuthorization` holds funds only inside the same transaction.
///   - Every pull is bounded by the payer's own allowance or signature. Nobody can redirect funds:
///     direct payments only pull from `msg.sender`; orders only pay the recipients the payer signed.
///   - The fee is flat, capped by `MAX_FEE` and by a per-call `maxFee` the payer chooses, so an
///     owner fee change can never take more than the payer agreed to.
///   - The owner can pause new payments, change fee/treasury within limits and rescue stray tokens.
///     The owner can never move user funds.
contract ParcPay is Ownable2Step, Pausable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    // ─── Types ─────────────────────────────────────────────────────────────────

    /// @notice One leg of a payment.
    struct Transfer {
        address to;
        uint256 amount;
    }

    /// @notice A payer-signed payment order. Anyone may execute it once it is due.
    /// @param payer    Address whose USDC is pulled (must have approved this contract).
    /// @param transfers Recipients and exact amounts for each run.
    /// @param maxFee   Highest flat fee the payer accepts per run.
    /// @param start    Unix time the first run becomes executable.
    /// @param interval Seconds between runs (ignored when runs == 1).
    /// @param runs     Total number of runs (1 = one-off scheduled payment).
    /// @param expiry   Unix time after which no run can execute.
    /// @param nonce    Payer-chosen salt; also used for bulk revocation via `revokeNoncesBelow`.
    /// @param memo     Free reference (invoice id, payroll period, game/NFT order id...).
    struct Order {
        address payer;
        Transfer[] transfers;
        uint256 maxFee;
        uint64 start;
        uint64 interval;
        uint32 runs;
        uint64 expiry;
        uint256 nonce;
        bytes32 memo;
    }

    /// @notice EIP-3009 authorization fields (packed to keep the stack shallow).
    struct Authorization {
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    // ─── Constants ─────────────────────────────────────────────────────────────

    string public constant VERSION = "2";

    /// @notice Hard cap for the flat fee: 0.10 USDC (6 decimals).
    uint256 public constant MAX_FEE = 100_000;

    /// @notice Maximum recipients per payment.
    uint256 public constant MAX_RECIPIENTS = 50;

    bytes32 public constant TRANSFER_TYPEHASH = keccak256("Transfer(address to,uint256 amount)");

    bytes32 public constant ORDER_TYPEHASH = keccak256(
        "Order(address payer,Transfer[] transfers,uint256 maxFee,uint64 start,uint64 interval,uint32 runs,uint64 expiry,uint256 nonce,bytes32 memo)Transfer(address to,uint256 amount)"
    );

    // ─── State ─────────────────────────────────────────────────────────────────

    /// @notice USDC token (Arc: 0x3600000000000000000000000000000000000000).
    IERC20 public immutable usdc;

    /// @notice Receives the protocol fee.
    address public treasury;

    /// @notice Flat fee per payment in USDC base units (1_000 = 0.001 USDC).
    uint256 public fee;

    /// @notice Runs already executed per order hash.
    mapping(bytes32 orderHash => uint256) public runsExecuted;

    /// @notice Orders cancelled by their payer.
    mapping(address payer => mapping(bytes32 orderHash => bool)) public cancelled;

    /// @notice Orders with nonce below this value are revoked for that payer.
    mapping(address payer => uint256) public minNonce;

    // ─── Events ────────────────────────────────────────────────────────────────

    event Paid(
        address indexed payer,
        bytes32 indexed orderHash,
        bytes32 indexed memo,
        uint256 total,
        uint256 fee,
        Transfer[] transfers
    );
    event OrderExecuted(bytes32 indexed orderHash, address indexed payer, address indexed executor, uint256 run);
    event OrderCancelled(address indexed payer, bytes32 indexed orderHash);
    event NoncesRevoked(address indexed payer, uint256 minNonce);
    event FeeUpdated(uint256 oldFee, uint256 newFee);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event Rescued(address indexed token, address indexed to, uint256 amount);

    // ─── Errors ────────────────────────────────────────────────────────────────

    error ZeroAddress();
    error NoRecipients();
    error TooManyRecipients(uint256 got, uint256 max);
    error InvalidRecipient(uint256 index);
    error ZeroAmount(uint256 index);
    error DuplicateRecipient(address recipient);
    error FeeTooHigh(uint256 fee, uint256 maxFee);
    error FeeAboveCap(uint256 fee, uint256 cap);
    error InvalidSignature();
    error OrderIsCancelled();
    error OrderIsRevoked();
    error OrderNotDue(uint256 dueAt);
    error OrderExpired();
    error OrderCompleted();
    error InvalidSchedule();
    error NonceTooLow();

    // ─── Constructor ───────────────────────────────────────────────────────────

    constructor(address usdc_, address treasury_, address owner_, uint256 fee_)
        Ownable(owner_)
        EIP712("ParcPay", VERSION)
    {
        if (usdc_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        if (fee_ > MAX_FEE) revert FeeAboveCap(fee_, MAX_FEE);
        usdc = IERC20(usdc_);
        treasury = treasury_;
        fee = fee_;
        emit TreasuryUpdated(address(0), treasury_);
        emit FeeUpdated(0, fee_);
    }

    // ─── Payments ──────────────────────────────────────────────────────────────

    /// @notice Pay several recipients exact USDC amounts in one atomic transaction.
    /// @dev Requires allowance >= total + fee. After a one-time approval every payment is a single signature.
    /// @param transfers Recipients and amounts (1..MAX_RECIPIENTS, unique, non-zero).
    /// @param maxFee Highest fee the caller accepts (protects against fee changes).
    /// @param memo Optional reference stored in the event.
    /// @return total Sum paid to recipients (excluding fee).
    function splitPay(Transfer[] calldata transfers, uint256 maxFee, bytes32 memo)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 total)
    {
        uint256 f = _checkFee(maxFee);
        total = _validate(transfers);
        _pull(msg.sender, transfers, f);
        emit Paid(msg.sender, bytes32(0), memo, total, f, transfers);
    }

    /// @notice Same as `splitPay` but funded by an EIP-3009 `receiveWithAuthorization` signature:
    ///         no approval transaction, one signature + one transaction.
    /// @dev `receiveWithAuthorization` requires `to == msg.sender` of the USDC call (this contract),
    ///      so the authorization cannot be front-run. `from` is forced to `msg.sender`.
    ///      The signed value must equal total + fee exactly.
    function splitPayWithAuthorization(
        Transfer[] calldata transfers,
        uint256 maxFee,
        bytes32 memo,
        Authorization calldata auth
    ) external nonReentrant whenNotPaused returns (uint256 total) {
        uint256 f = _checkFee(maxFee);
        total = _validate(transfers);

        IERC3009(address(usdc)).receiveWithAuthorization(
            msg.sender, address(this), total + f, auth.validAfter, auth.validBefore, auth.nonce, auth.v, auth.r, auth.s
        );

        uint256 len = transfers.length;
        for (uint256 i; i < len; ++i) {
            usdc.safeTransfer(transfers[i].to, transfers[i].amount);
        }
        if (f != 0) usdc.safeTransfer(treasury, f);

        emit Paid(msg.sender, bytes32(0), memo, total, f, transfers);
    }

    // ─── Signed orders (scheduled / recurring) ─────────────────────────────────

    /// @notice Execute the next due run of a payer-signed order. Callable by anyone
    ///         (the payer, a recipient claiming their salary, or a keeper).
    /// @dev Each call executes exactly one run. Missed runs can be executed back-to-back.
    function executeOrder(Order calldata order, bytes calldata signature)
        external
        nonReentrant
        whenNotPaused
        returns (bytes32 orderHash)
    {
        orderHash = hashOrder(order);
        address payer = order.payer;

        if (cancelled[payer][orderHash]) revert OrderIsCancelled();
        if (order.nonce < minNonce[payer]) revert OrderIsRevoked();
        if (order.runs == 0 || (order.runs > 1 && order.interval == 0)) revert InvalidSchedule();

        uint256 done = runsExecuted[orderHash];
        if (done >= order.runs) revert OrderCompleted();

        uint256 dueAt = uint256(order.start) + done * uint256(order.interval);
        if (block.timestamp < dueAt) revert OrderNotDue(dueAt);
        if (block.timestamp > order.expiry) revert OrderExpired();

        if (!SignatureChecker.isValidSignatureNow(payer, orderHash, signature)) revert InvalidSignature();

        uint256 f = _checkFee(order.maxFee);
        uint256 total = _validate(order.transfers);

        // Effects before interactions.
        runsExecuted[orderHash] = done + 1;

        _pull(payer, order.transfers, f);

        emit OrderExecuted(orderHash, payer, msg.sender, done + 1);
        emit Paid(payer, orderHash, order.memo, total, f, order.transfers);
    }

    /// @notice Cancel one of your signed orders (remaining runs can no longer execute).
    function cancelOrder(bytes32 orderHash) external {
        cancelled[msg.sender][orderHash] = true;
        emit OrderCancelled(msg.sender, orderHash);
    }

    /// @notice Revoke every order you signed with a nonce lower than `newMinNonce` ("revoke all keys").
    function revokeNoncesBelow(uint256 newMinNonce) external {
        if (newMinNonce <= minNonce[msg.sender]) revert NonceTooLow();
        minNonce[msg.sender] = newMinNonce;
        emit NoncesRevoked(msg.sender, newMinNonce);
    }

    // ─── Views ─────────────────────────────────────────────────────────────────

    /// @notice EIP-712 digest the payer signs for `order`.
    function hashOrder(Order calldata order) public view returns (bytes32) {
        uint256 len = order.transfers.length;
        bytes32[] memory legs = new bytes32[](len);
        for (uint256 i; i < len; ++i) {
            legs[i] = keccak256(abi.encode(TRANSFER_TYPEHASH, order.transfers[i].to, order.transfers[i].amount));
        }
        bytes32 structHash = keccak256(
            abi.encode(
                ORDER_TYPEHASH,
                order.payer,
                keccak256(abi.encodePacked(legs)),
                order.maxFee,
                order.start,
                order.interval,
                order.runs,
                order.expiry,
                order.nonce,
                order.memo
            )
        );
        return _hashTypedDataV4(structHash);
    }

    /// @notice Total USDC the payer needs for one payment (recipients + fee).
    function quote(Transfer[] calldata transfers) external view returns (uint256 total, uint256 currentFee) {
        total = _validate(transfers);
        currentFee = fee;
    }

    /// @notice Timestamp at which the next run of `orderHash` becomes due (0 if finished).
    function nextRunAt(Order calldata order) external view returns (uint256) {
        bytes32 h = hashOrder(order);
        uint256 done = runsExecuted[h];
        if (done >= order.runs) return 0;
        return uint256(order.start) + done * uint256(order.interval);
    }

    // ─── Admin ─────────────────────────────────────────────────────────────────

    function setFee(uint256 newFee) external onlyOwner {
        if (newFee > MAX_FEE) revert FeeAboveCap(newFee, MAX_FEE);
        emit FeeUpdated(fee, newFee);
        fee = newFee;
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Recover tokens sent to this contract by mistake. The contract never holds
    ///         user funds between transactions, so this cannot touch pending payments.
    function rescue(address token, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
        emit Rescued(token, to, amount);
    }

    /// @dev Renouncing would freeze fee/treasury forever and remove the pause switch.
    function renounceOwnership() public pure override {
        revert();
    }

    // ─── Internal ──────────────────────────────────────────────────────────────

    function _checkFee(uint256 maxFee) internal view returns (uint256 f) {
        f = fee;
        if (f > maxFee) revert FeeTooHigh(f, maxFee);
    }

    function _validate(Transfer[] calldata transfers) internal view returns (uint256 total) {
        uint256 len = transfers.length;
        if (len == 0) revert NoRecipients();
        if (len > MAX_RECIPIENTS) revert TooManyRecipients(len, MAX_RECIPIENTS);
        for (uint256 i; i < len; ++i) {
            address to = transfers[i].to;
            if (to == address(0) || to == address(this) || to == address(usdc)) revert InvalidRecipient(i);
            if (transfers[i].amount == 0) revert ZeroAmount(i);
            for (uint256 j; j < i; ++j) {
                if (transfers[j].to == to) revert DuplicateRecipient(to);
            }
            total += transfers[i].amount;
        }
    }

    function _pull(address payer, Transfer[] calldata transfers, uint256 f) internal {
        uint256 len = transfers.length;
        for (uint256 i; i < len; ++i) {
            usdc.safeTransferFrom(payer, transfers[i].to, transfers[i].amount);
        }
        if (f != 0) usdc.safeTransferFrom(payer, treasury, f);
    }
}
