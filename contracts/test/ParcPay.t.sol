// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ParcPay} from "../ParcPay.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @dev 6-decimal USDC mock with a faithful-enough EIP-3009 receiveWithAuthorization.
contract MockUSDC {
    string public name = "USDC";
    uint8 public decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => mapping(bytes32 => bool)) public authorizationState;

    bytes32 public constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 public immutable DOMAIN_SEPARATOR;

    event Transfer(address indexed from, address indexed to, uint256 value);

    constructor() {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("USDC"), keccak256("2"), block.chainid, address(this)
            )
        );
    }

    function mint(address to, uint256 a) external { balanceOf[to] += a; }

    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }

    function transfer(address to, uint256 a) external returns (bool) { _move(msg.sender, to, a); return true; }

    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        require(allowance[f][msg.sender] >= a, "allowance");
        allowance[f][msg.sender] -= a;
        _move(f, to, a);
        return true;
    }

    function receiveWithAuthorization(
        address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce,
        uint8 v, bytes32 r, bytes32 s
    ) external {
        require(to == msg.sender, "caller must be payee");
        require(block.timestamp > validAfter && block.timestamp < validBefore, "window");
        require(!authorizationState[from][nonce], "used");
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR,
            keccak256(abi.encode(RECEIVE_TYPEHASH, from, to, value, validAfter, validBefore, nonce))));
        require(ecrecover(digest, v, r, s) == from, "sig");
        authorizationState[from][nonce] = true;
        _move(from, to, value);
    }

    function _move(address f, address t, uint256 a) internal {
        require(balanceOf[f] >= a, "balance");
        balanceOf[f] -= a;
        balanceOf[t] += a;
        emit Transfer(f, t, a);
    }
}

/// @dev Smart-contract wallet (EIP-1271) owned by an EOA.
contract MockWallet {
    address public immutable owner;
    constructor(address o) { owner = o; }
    function isValidSignature(bytes32 h, bytes calldata sig) external view returns (bytes4) {
        (bytes32 r, bytes32 s, uint8 v) = abi.decode(sig, (bytes32, bytes32, uint8));
        return ecrecover(h, v, r, s) == owner ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }
    function approve(MockUSDC t, address s, uint256 a) external { t.approve(s, a); }
}

contract ParcPayTest is Test {
    MockUSDC usdc;
    ParcPay pay;

    address constant TREASURY = 0x9A5f2d1066D2a265EeB82baa7D6038Ca92469858;
    address owner = makeAddr("owner");
    uint256 payerPk = 0xA11CE;
    address payer;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");
    address keeper = makeAddr("keeper");

    uint256 constant FEE = 1_000; // 0.001 USDC

    function setUp() public {
        vm.warp(1_800_000_000);
        payer = vm.addr(payerPk);
        usdc = new MockUSDC();
        pay = new ParcPay(address(usdc), TREASURY, owner, FEE);
        usdc.mint(payer, 1_000_000e6);
        vm.prank(payer);
        usdc.approve(address(pay), type(uint256).max);
    }

    // ── helpers ──────────────────────────────────────────────────────────────
    function _t2() internal view returns (ParcPay.Transfer[] memory t) {
        t = new ParcPay.Transfer[](2);
        t[0] = ParcPay.Transfer(alice, 60e6);
        t[1] = ParcPay.Transfer(bob, 40e6);
    }

    function _order(uint32 runs, uint64 interval) internal view returns (ParcPay.Order memory o) {
        o.payer = payer;
        o.transfers = _t2();
        o.maxFee = FEE;
        o.start = uint64(block.timestamp + 1 days);
        o.interval = interval;
        o.runs = runs;
        o.expiry = uint64(block.timestamp + 365 days);
        o.nonce = 7;
        o.memo = keccak256("payroll-2026-11");
    }

    function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    // ── constructor / config ─────────────────────────────────────────────────
    function test_Constructor() public view {
        assertEq(address(pay.usdc()), address(usdc));
        assertEq(pay.treasury(), TREASURY);
        assertEq(pay.fee(), FEE);
        assertEq(pay.owner(), owner);
    }

    function test_Constructor_RevertsOnBadArgs() public {
        vm.expectRevert(ParcPay.ZeroAddress.selector);
        new ParcPay(address(0), TREASURY, owner, FEE);
        vm.expectRevert(ParcPay.ZeroAddress.selector);
        new ParcPay(address(usdc), address(0), owner, FEE);
        vm.expectRevert(abi.encodeWithSelector(ParcPay.FeeAboveCap.selector, 100_001, 100_000));
        new ParcPay(address(usdc), TREASURY, owner, 100_001);
    }

    // ── splitPay ─────────────────────────────────────────────────────────────
    function test_SplitPay_PaysExactAmountsAndFee() public {
        uint256 before = usdc.balanceOf(payer);
        vm.prank(payer);
        uint256 total = pay.splitPay(_t2(), FEE, bytes32("INV-42"));
        assertEq(total, 100e6);
        assertEq(usdc.balanceOf(alice), 60e6);
        assertEq(usdc.balanceOf(bob), 40e6);
        assertEq(usdc.balanceOf(TREASURY), FEE);
        assertEq(before - usdc.balanceOf(payer), 100e6 + FEE);
        assertEq(usdc.balanceOf(address(pay)), 0, "never custodial");
    }

    function test_SplitPay_SingleRecipientAllowed() public {
        ParcPay.Transfer[] memory t = new ParcPay.Transfer[](1);
        t[0] = ParcPay.Transfer(alice, 1);
        vm.prank(payer);
        pay.splitPay(t, FEE, 0);
        assertEq(usdc.balanceOf(alice), 1);
    }

    function test_SplitPay_EmitsPaid() public {
        ParcPay.Transfer[] memory t = _t2();
        vm.expectEmit(true, true, true, true);
        emit ParcPay.Paid(payer, bytes32(0), bytes32("m"), 100e6, FEE, t);
        vm.prank(payer);
        pay.splitPay(t, FEE, bytes32("m"));
    }

    function test_SplitPay_FiftyRecipients() public {
        ParcPay.Transfer[] memory t = new ParcPay.Transfer[](50);
        for (uint256 i; i < 50; ++i) t[i] = ParcPay.Transfer(address(uint160(0x1000 + i)), 1e6);
        vm.prank(payer);
        assertEq(pay.splitPay(t, FEE, 0), 50e6);
    }

    function test_SplitPay_RevertsTooMany() public {
        ParcPay.Transfer[] memory t = new ParcPay.Transfer[](51);
        for (uint256 i; i < 51; ++i) t[i] = ParcPay.Transfer(address(uint160(0x1000 + i)), 1);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ParcPay.TooManyRecipients.selector, 51, 50));
        pay.splitPay(t, FEE, 0);
    }

    function test_SplitPay_RevertsEmpty() public {
        vm.prank(payer);
        vm.expectRevert(ParcPay.NoRecipients.selector);
        pay.splitPay(new ParcPay.Transfer[](0), FEE, 0);
    }

    function test_SplitPay_RevertsInvalidRecipients() public {
        ParcPay.Transfer[] memory t = _t2();
        address[3] memory bad = [address(0), address(pay), address(usdc)];
        for (uint256 i; i < 3; ++i) {
            t[1].to = bad[i];
            vm.prank(payer);
            vm.expectRevert(abi.encodeWithSelector(ParcPay.InvalidRecipient.selector, 1));
            pay.splitPay(t, FEE, 0);
        }
    }

    function test_SplitPay_RevertsZeroAmount() public {
        ParcPay.Transfer[] memory t = _t2();
        t[0].amount = 0;
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ParcPay.ZeroAmount.selector, 0));
        pay.splitPay(t, FEE, 0);
    }

    function test_SplitPay_RevertsDuplicate() public {
        ParcPay.Transfer[] memory t = _t2();
        t[1].to = alice;
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ParcPay.DuplicateRecipient.selector, alice));
        pay.splitPay(t, FEE, 0);
    }

    function test_SplitPay_MaxFeeProtectsPayer() public {
        vm.prank(owner);
        pay.setFee(50_000);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ParcPay.FeeTooHigh.selector, 50_000, FEE));
        pay.splitPay(_t2(), FEE, 0);
    }

    function test_SplitPay_ZeroFeeSkipsTreasury() public {
        vm.prank(owner);
        pay.setFee(0);
        vm.prank(payer);
        pay.splitPay(_t2(), 0, 0);
        assertEq(usdc.balanceOf(TREASURY), 0);
    }

    function test_SplitPay_ExactAllowanceMustCoverFee() public {
        address p = makeAddr("p");
        usdc.mint(p, 200e6);
        vm.startPrank(p);
        usdc.approve(address(pay), 100e6); // forgot the fee
        vm.expectRevert(bytes("allowance"));
        pay.splitPay(_t2(), FEE, 0);
        usdc.approve(address(pay), 100e6 + FEE);
        pay.splitPay(_t2(), FEE, 0);
        vm.stopPrank();
        assertEq(usdc.allowance(p, address(pay)), 0);
    }

    function test_SplitPay_CannotSpendOthersAllowance() public {
        // attacker calls splitPay: funds come only from msg.sender, never from `payer`
        vm.prank(keeper);
        vm.expectRevert(bytes("allowance"));
        pay.splitPay(_t2(), FEE, 0);
        assertEq(usdc.balanceOf(payer), 1_000_000e6);
    }

    function test_SplitPay_WhenPausedReverts() public {
        vm.prank(owner);
        pay.pause();
        vm.prank(payer);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        pay.splitPay(_t2(), FEE, 0);
        vm.prank(owner);
        pay.unpause();
        vm.prank(payer);
        pay.splitPay(_t2(), FEE, 0);
    }

    function testFuzz_SplitPay_Conservation(uint64 a, uint64 b, uint64 c) public {
        a = uint64(bound(a, 1, 100_000e6));
        b = uint64(bound(b, 1, 100_000e6));
        c = uint64(bound(c, 1, 100_000e6));
        ParcPay.Transfer[] memory t = new ParcPay.Transfer[](3);
        t[0] = ParcPay.Transfer(alice, a);
        t[1] = ParcPay.Transfer(bob, b);
        t[2] = ParcPay.Transfer(carol, c);
        uint256 before = usdc.balanceOf(payer);
        vm.prank(payer);
        pay.splitPay(t, FEE, 0);
        assertEq(before - usdc.balanceOf(payer), uint256(a) + b + c + FEE);
        assertEq(usdc.balanceOf(alice) + usdc.balanceOf(bob) + usdc.balanceOf(carol), uint256(a) + b + c);
        assertEq(usdc.balanceOf(address(pay)), 0);
    }

    // ── EIP-3009 path ────────────────────────────────────────────────────────
    function _auth(uint256 value, bytes32 nonce) internal view returns (ParcPay.Authorization memory a) {
        a.validAfter = 0;
        a.validBefore = block.timestamp + 1 hours;
        a.nonce = nonce;
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(),
            keccak256(abi.encode(usdc.RECEIVE_TYPEHASH(), payer, address(pay), value, a.validAfter, a.validBefore, nonce))));
        (a.v, a.r, a.s) = vm.sign(payerPk, digest);
    }

    function test_Authorization_OneSignatureNoApproval() public {
        vm.prank(payer);
        usdc.approve(address(pay), 0);
        ParcPay.Authorization memory a = _auth(100e6 + FEE, bytes32(uint256(1)));
        vm.prank(payer);
        pay.splitPayWithAuthorization(_t2(), FEE, 0, a);
        assertEq(usdc.balanceOf(alice), 60e6);
        assertEq(usdc.balanceOf(bob), 40e6);
        assertEq(usdc.balanceOf(TREASURY), FEE);
        assertEq(usdc.balanceOf(address(pay)), 0);
    }

    function test_Authorization_WrongValueReverts() public {
        ParcPay.Authorization memory a = _auth(100e6, bytes32(uint256(1))); // fee missing
        vm.prank(payer);
        vm.expectRevert(bytes("sig"));
        pay.splitPayWithAuthorization(_t2(), FEE, 0, a);
    }

    function test_Authorization_CannotBeUsedByOtherCaller() public {
        ParcPay.Authorization memory a = _auth(100e6 + FEE, bytes32(uint256(1)));
        vm.prank(keeper);
        vm.expectRevert(bytes("sig"));
        pay.splitPayWithAuthorization(_t2(), FEE, 0, a);
    }

    function test_Authorization_ReplayReverts() public {
        ParcPay.Authorization memory a = _auth(100e6 + FEE, bytes32(uint256(1)));
        vm.startPrank(payer);
        pay.splitPayWithAuthorization(_t2(), FEE, 0, a);
        vm.expectRevert(bytes("used"));
        pay.splitPayWithAuthorization(_t2(), FEE, 0, a);
        vm.stopPrank();
    }

    // ── Signed orders ────────────────────────────────────────────────────────
    function test_Order_OneOffExecutedByAnyoneWhenDue() public {
        ParcPay.Order memory o = _order(1, 0);
        bytes memory sig = _sign(payerPk, pay.hashOrder(o));

        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(ParcPay.OrderNotDue.selector, o.start));
        pay.executeOrder(o, sig);

        vm.warp(o.start);
        vm.prank(alice); // recipient claims it herself
        bytes32 h = pay.executeOrder(o, sig);
        assertEq(usdc.balanceOf(alice), 60e6);
        assertEq(usdc.balanceOf(bob), 40e6);
        assertEq(usdc.balanceOf(TREASURY), FEE);
        assertEq(pay.runsExecuted(h), 1);

        vm.expectRevert(ParcPay.OrderCompleted.selector);
        pay.executeOrder(o, sig);
    }

    function test_Order_RecurringPayrollWithCatchUp() public {
        ParcPay.Order memory o = _order(3, 30 days);
        bytes memory sig = _sign(payerPk, pay.hashOrder(o));
        vm.warp(o.start);
        pay.executeOrder(o, sig);
        vm.expectRevert(abi.encodeWithSelector(ParcPay.OrderNotDue.selector, uint256(o.start) + 30 days));
        pay.executeOrder(o, sig);
        assertEq(pay.nextRunAt(o), uint256(o.start) + 30 days);

        vm.warp(uint256(o.start) + 61 days); // two periods missed → both executable
        pay.executeOrder(o, sig);
        pay.executeOrder(o, sig);
        assertEq(usdc.balanceOf(alice), 180e6);
        assertEq(usdc.balanceOf(TREASURY), 3 * FEE);
        assertEq(pay.nextRunAt(o), 0);
        vm.expectRevert(ParcPay.OrderCompleted.selector);
        pay.executeOrder(o, sig);
    }

    function test_Order_Expired() public {
        ParcPay.Order memory o = _order(1, 0);
        bytes memory sig = _sign(payerPk, pay.hashOrder(o));
        vm.warp(uint256(o.expiry) + 1);
        vm.expectRevert(ParcPay.OrderExpired.selector);
        pay.executeOrder(o, sig);
    }

    function test_Order_TamperedTransfersRejected() public {
        ParcPay.Order memory o = _order(1, 0);
        bytes memory sig = _sign(payerPk, pay.hashOrder(o));
        o.transfers[1].to = keeper; // attacker redirects bob's share
        vm.warp(o.start);
        vm.expectRevert(ParcPay.InvalidSignature.selector);
        pay.executeOrder(o, sig);
    }

    function test_Order_WrongSignerRejected() public {
        ParcPay.Order memory o = _order(1, 0);
        bytes memory sig = _sign(0xBEEF, pay.hashOrder(o));
        vm.warp(o.start);
        vm.expectRevert(ParcPay.InvalidSignature.selector);
        pay.executeOrder(o, sig);
    }

    function test_Order_CancelStopsRemainingRuns() public {
        ParcPay.Order memory o = _order(2, 1 days);
        bytes32 h = pay.hashOrder(o);
        bytes memory sig = _sign(payerPk, h);
        vm.warp(o.start);
        pay.executeOrder(o, sig);
        vm.prank(keeper); // someone else "cancelling" has no effect on payer's order
        pay.cancelOrder(h);
        vm.prank(payer);
        pay.cancelOrder(h);
        vm.warp(uint256(o.start) + 1 days);
        vm.expectRevert(ParcPay.OrderIsCancelled.selector);
        pay.executeOrder(o, sig);
    }

    function test_Order_RevokeAllByNonce() public {
        ParcPay.Order memory o = _order(1, 0);
        bytes memory sig = _sign(payerPk, pay.hashOrder(o));
        vm.startPrank(payer);
        pay.revokeNoncesBelow(8);
        vm.expectRevert(ParcPay.NonceTooLow.selector);
        pay.revokeNoncesBelow(8);
        vm.stopPrank();
        vm.warp(o.start);
        vm.expectRevert(ParcPay.OrderIsRevoked.selector);
        pay.executeOrder(o, sig);
    }

    function test_Order_InvalidScheduleRejected() public {
        ParcPay.Order memory o = _order(3, 0);
        bytes memory sig = _sign(payerPk, pay.hashOrder(o));
        vm.warp(o.start);
        vm.expectRevert(ParcPay.InvalidSchedule.selector);
        pay.executeOrder(o, sig);
        o = _order(0, 0);
        sig = _sign(payerPk, pay.hashOrder(o));
        vm.expectRevert(ParcPay.InvalidSchedule.selector);
        pay.executeOrder(o, sig);
    }

    function test_Order_MaxFeeBindsOwner() public {
        ParcPay.Order memory o = _order(1, 0);
        bytes memory sig = _sign(payerPk, pay.hashOrder(o));
        vm.prank(owner);
        pay.setFee(2_000);
        vm.warp(o.start);
        vm.expectRevert(abi.encodeWithSelector(ParcPay.FeeTooHigh.selector, 2_000, FEE));
        pay.executeOrder(o, sig);
    }

    function test_Order_SmartWalletPayer_EIP1271() public {
        uint256 ownerPk = 0xC0FFEE;
        MockWallet w = new MockWallet(vm.addr(ownerPk));
        usdc.mint(address(w), 1_000e6);
        w.approve(usdc, address(pay), type(uint256).max);
        ParcPay.Order memory o = _order(1, 0);
        o.payer = address(w);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPk, pay.hashOrder(o));
        vm.warp(o.start);
        pay.executeOrder(o, abi.encode(r, s, v));
        assertEq(usdc.balanceOf(alice), 60e6);
    }

    function test_Order_PausedReverts() public {
        ParcPay.Order memory o = _order(1, 0);
        bytes memory sig = _sign(payerPk, pay.hashOrder(o));
        vm.prank(owner);
        pay.pause();
        vm.warp(o.start);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        pay.executeOrder(o, sig);
    }

    /// @dev Digest must match what viem's signTypedData produces (see scripts/eip712-vector.mjs).
    function test_Order_DigestMatchesViemVector() public {
        vm.chainId(5042);
        MockUSDC u = MockUSDC(0x3600000000000000000000000000000000000000);
        vm.etch(address(u), address(usdc).code);
        ParcPay p = new ParcPay(address(u), TREASURY, owner, FEE);
        vm.etch(0x00000000000000000000000000000000000aBCdE, address(p).code);
        ParcPay at = ParcPay(0x00000000000000000000000000000000000aBCdE);

        ParcPay.Order memory o;
        o.payer = 0x1111111111111111111111111111111111111111;
        o.transfers = new ParcPay.Transfer[](2);
        o.transfers[0] = ParcPay.Transfer(0x2222222222222222222222222222222222222222, 1_500_000);
        o.transfers[1] = ParcPay.Transfer(0x3333333333333333333333333333333333333333, 2_500_000);
        o.maxFee = 1000;
        o.start = 1_800_000_000;
        o.interval = 2_592_000;
        o.runs = 12;
        o.expiry = 1_900_000_000;
        o.nonce = 42;
        o.memo = 0x7061790000000000000000000000000000000000000000000000000000000000;
        emit log_bytes32(at.hashOrder(o));
        assertEq(at.hashOrder(o), 0xc74038aa0ad2f71db3621097aea3ab406dbdd84090f36edd4fe9629ba032fd5e);
    }

    // ── Admin ────────────────────────────────────────────────────────────────
    function test_Admin_OnlyOwner() public {
        vm.startPrank(keeper);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, keeper));
        pay.setFee(0);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, keeper));
        pay.setTreasury(keeper);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, keeper));
        pay.pause();
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, keeper));
        pay.rescue(address(usdc), keeper, 1);
        vm.stopPrank();
    }

    function test_Admin_FeeCapAndTreasury() public {
        vm.startPrank(owner);
        vm.expectRevert(abi.encodeWithSelector(ParcPay.FeeAboveCap.selector, 100_001, 100_000));
        pay.setFee(100_001);
        pay.setFee(100_000);
        vm.expectRevert(ParcPay.ZeroAddress.selector);
        pay.setTreasury(address(0));
        pay.setTreasury(carol);
        vm.stopPrank();
        vm.prank(payer);
        pay.splitPay(_t2(), 100_000, 0);
        assertEq(usdc.balanceOf(carol), 100_000);
    }

    function test_Admin_RenounceDisabled_TwoStepTransfer() public {
        vm.prank(owner);
        vm.expectRevert();
        pay.renounceOwnership();
        vm.prank(owner);
        pay.transferOwnership(TREASURY);
        assertEq(pay.owner(), owner);
        vm.prank(TREASURY);
        pay.acceptOwnership();
        assertEq(pay.owner(), TREASURY);
    }

    function test_Admin_RescueStrayTokens() public {
        usdc.mint(address(pay), 5e6);
        vm.prank(owner);
        pay.rescue(address(usdc), TREASURY, 5e6);
        assertEq(usdc.balanceOf(TREASURY), 5e6);
    }
}
