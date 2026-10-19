// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {SplitPay} from "../legacy/SplitPay.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// ---------------------------------------------------------------------------
// Minimal inline mock ERC-20 with 6 decimals — no OZ, no mcopy risk
// ---------------------------------------------------------------------------
contract MockUSDC {
    string  public name     = "Mock USDC";
    string  public symbol   = "mUSDC";
    uint8   public decimals = 6;

    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function mint(address to, uint256 amount) external {
        totalSupply      += amount;
        balanceOf[to]    += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to]         += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient");
        require(allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from]             -= amount;
        balanceOf[to]               += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

// ---------------------------------------------------------------------------
// Main test suite
// ---------------------------------------------------------------------------
contract SplitPayTest is Test {

    // ---- fixtures ----------------------------------------------------------
    MockUSDC   internal usdc;
    SplitPay   internal splitPay;

    address internal payer  = makeAddr("payer");
    address internal alice  = makeAddr("alice");
    address internal bob    = makeAddr("bob");
    address internal carol  = makeAddr("carol");

    uint256 internal constant INITIAL_BALANCE = 1_000_000e6; // 1 M USDC

    // ========================================================================
    // 1.  DEPLOYMENT & INITIALIZATION
    // ========================================================================

    function test_Constructor_StoresUsdcToken() public view {
        assertEq(splitPay.usdcToken(), address(usdc));
    }

    function test_Constructor_StoresBasisPoints() public view {
        assertEq(splitPay.BASIS_POINTS(), 10_000);
    }

    function test_Constructor_StoresMaxRecipients() public view {
        assertEq(splitPay.MAX_RECIPIENTS(), 10);
    }

    function test_Constructor_RevertsOnZeroAddress() public {
        vm.expectRevert(
            abi.encodeWithSelector(SplitPay.ZeroAddressRecipient.selector, uint256(0))
        );
        new SplitPay(address(0));
    }

    // ========================================================================
    // 2.  HAPPY PATH — splitPay
    // ========================================================================

    // Helper: build a 2-recipient shares array
    function _shares2(address a, uint16 bpA, address b, uint16 bpB)
        internal pure returns (SplitPay.RecipientShare[] memory)
    {
        SplitPay.RecipientShare[] memory s = new SplitPay.RecipientShare[](2);
        s[0] = SplitPay.RecipientShare({recipient: a, basisPoints: bpA});
        s[1] = SplitPay.RecipientShare({recipient: b, basisPoints: bpB});
        return s;
    }

    // Helper: build a 3-recipient shares array
    function _shares3(
        address a, uint16 bpA,
        address b, uint16 bpB,
        address c, uint16 bpC
    ) internal pure returns (SplitPay.RecipientShare[] memory) {
        SplitPay.RecipientShare[] memory s = new SplitPay.RecipientShare[](3);
        s[0] = SplitPay.RecipientShare({recipient: a, basisPoints: bpA});
        s[1] = SplitPay.RecipientShare({recipient: b, basisPoints: bpB});
        s[2] = SplitPay.RecipientShare({recipient: c, basisPoints: bpC});
        return s;
    }

    // 2a. Exact 50/50 split
    function test_SplitPay_TwoRecipients_EvenSplit() public {
        uint256 amount = 100e6; // 100 USDC
        SplitPay.RecipientShare[] memory shares = _shares2(alice, 5000, bob, 5000);

        vm.prank(payer);
        splitPay.splitPay(amount, shares);

        assertEq(usdc.balanceOf(alice), 50e6,  "alice");
        assertEq(usdc.balanceOf(bob),   50e6,  "bob");
        assertEq(usdc.balanceOf(payer),  INITIAL_BALANCE - amount, "payer");
        // SplitPay must not retain any USDC (non-custodial)
        assertEq(usdc.balanceOf(address(splitPay)), 0, "contract balance");
    }

    // 2b. 3 recipients with 50/30/20
    function test_SplitPay_ThreeRecipients_50_30_20() public {
        uint256 amount = 100e6;
        SplitPay.RecipientShare[] memory shares = _shares3(alice, 5000, bob, 3000, carol, 2000);

        vm.prank(payer);
        splitPay.splitPay(amount, shares);

        assertEq(usdc.balanceOf(alice), 50e6, "alice");
        assertEq(usdc.balanceOf(bob),   30e6, "bob");
        assertEq(usdc.balanceOf(carol), 20e6, "carol");
        assertEq(usdc.balanceOf(address(splitPay)), 0, "contract balance");
    }

    // 2c. Uneven total: remainder goes to last recipient
    //     1 USDC = 1_000_000 micro-USDC, split 3333/3333/3334 bp
    //     floor(1e6 * 3333 / 10000) = 333_300 each for first two
    //     last gets 1_000_000 - 666_600 = 333_400
    function test_SplitPay_UnevenRemainder_LastRecipientGetsRemainder() public {
        uint256 amount = 1e6; // 1 USDC
        SplitPay.RecipientShare[] memory shares = _shares3(alice, 3333, bob, 3333, carol, 3334);

        vm.prank(payer);
        splitPay.splitPay(amount, shares);

        uint256 expected0 = (amount * 3333) / 10_000;       // 333_300
        uint256 expected1 = (amount * 3333) / 10_000;       // 333_300
        uint256 expected2 = amount - expected0 - expected1; // 333_400

        assertEq(usdc.balanceOf(alice), expected0, "alice");
        assertEq(usdc.balanceOf(bob),   expected1, "bob");
        assertEq(usdc.balanceOf(carol), expected2, "carol - remainder");
        assertEq(usdc.balanceOf(address(splitPay)), 0, "contract balance");
        assertEq(expected0 + expected1 + expected2, amount, "sum == totalAmount");
    }

    // 2d. Odd amount that produces rounding in every slot
    //     3 USDC split 1/1/8 (1000/1000/8000 bp)
    //     floor(3e6 * 1000 / 10000) = 300_000 each for first two
    //     last = 3e6 - 600_000 = 2_400_000
    function test_SplitPay_RoundingWithOddAmount() public {
        uint256 amount = 3e6;
        SplitPay.RecipientShare[] memory shares = _shares3(alice, 1000, bob, 1000, carol, 8000);

        vm.prank(payer);
        splitPay.splitPay(amount, shares);

        assertEq(usdc.balanceOf(alice), 300_000,   "alice");
        assertEq(usdc.balanceOf(bob),   300_000,   "bob");
        assertEq(usdc.balanceOf(carol), 2_400_000, "carol");
        assertEq(usdc.balanceOf(address(splitPay)), 0, "contract");
    }

    // 2e. Maximum recipients (10)
    function test_SplitPay_TenRecipients() public {
        uint256 amount = 100e6;

        SplitPay.RecipientShare[] memory shares = new SplitPay.RecipientShare[](10);
        uint256 bpEach = 1000; // 10 * 1000 = 10 000
        address[] memory addrs = new address[](10);
        for (uint256 i = 0; i < 10; i++) {
            addrs[i] = makeAddr(string(abi.encodePacked("r", i)));
            shares[i] = SplitPay.RecipientShare({
                recipient: addrs[i],
                basisPoints: uint16(bpEach)
            });
        }

        vm.prank(payer);
        splitPay.splitPay(amount, shares);

        for (uint256 i = 0; i < 10; i++) {
            assertEq(usdc.balanceOf(addrs[i]), amount / 10, string(abi.encodePacked("r", i)));
        }
        assertEq(usdc.balanceOf(address(splitPay)), 0, "contract");
    }

    // ========================================================================
    // 3.  EVENT — PaymentExecuted
    // ========================================================================

    function test_SplitPay_EmitsPaymentExecuted_TwoRecipients() public {
        uint256 amount = 100e6;
        SplitPay.RecipientShare[] memory shares = _shares2(alice, 5000, bob, 5000);

        address[] memory expectedRecipients = new address[](2);
        expectedRecipients[0] = alice;
        expectedRecipients[1] = bob;

        uint256[] memory expectedAmounts = new uint256[](2);
        expectedAmounts[0] = 50e6;
        expectedAmounts[1] = 50e6;

        vm.prank(payer);
        // index 0 = payer (indexed), index 1 = timestamp (indexed), check all data
        vm.expectEmit(true, true, false, true, address(splitPay));
        emit SplitPay.PaymentExecuted(
            payer,
            amount,
            expectedRecipients,
            expectedAmounts,
            block.timestamp
        );
        splitPay.splitPay(amount, shares);
    }

    function test_SplitPay_EmitsPaymentExecuted_ThreeRecipients() public {
        uint256 amount = 100e6;
        SplitPay.RecipientShare[] memory shares = _shares3(alice, 5000, bob, 3000, carol, 2000);

        address[] memory expectedRecipients = new address[](3);
        expectedRecipients[0] = alice;
        expectedRecipients[1] = bob;
        expectedRecipients[2] = carol;

        uint256[] memory expectedAmounts = new uint256[](3);
        expectedAmounts[0] = 50e6;
        expectedAmounts[1] = 30e6;
        expectedAmounts[2] = 20e6;

        vm.prank(payer);
        vm.expectEmit(true, true, false, true, address(splitPay));
        emit SplitPay.PaymentExecuted(
            payer,
            amount,
            expectedRecipients,
            expectedAmounts,
            block.timestamp
        );
        splitPay.splitPay(amount, shares);
    }

    function test_SplitPay_EmitsPaymentExecuted_PayerIsCorrect() public {
        // use a different caller to verify indexed payer is msg.sender, not owner of funds
        address caller = makeAddr("caller");
        usdc.mint(caller, 50e6);
        vm.prank(caller);
        usdc.approve(address(splitPay), type(uint256).max);

        SplitPay.RecipientShare[] memory shares = _shares2(alice, 5000, bob, 5000);

        vm.prank(caller);
        vm.expectEmit(true, false, false, false, address(splitPay));
        emit SplitPay.PaymentExecuted(caller, 0, new address[](0), new uint256[](0), 0);
        splitPay.splitPay(50e6, shares);
    }

    // ========================================================================
    // 4.  REVERT PATHS — splitPay
    // ========================================================================

    function test_SplitPay_RevertZeroAmount() public {
        SplitPay.RecipientShare[] memory shares = _shares2(alice, 5000, bob, 5000);
        vm.prank(payer);
        vm.expectRevert(SplitPay.ZeroAmount.selector);
        splitPay.splitPay(0, shares);
    }

    function test_SplitPay_RevertTooFewRecipients_OneRecipient() public {
        SplitPay.RecipientShare[] memory shares = new SplitPay.RecipientShare[](1);
        shares[0] = SplitPay.RecipientShare({recipient: alice, basisPoints: 10_000});
        vm.prank(payer);
        vm.expectRevert(SplitPay.TooFewRecipients.selector);
        splitPay.splitPay(100e6, shares);
    }

    function test_SplitPay_RevertTooFewRecipients_ZeroRecipients() public {
        SplitPay.RecipientShare[] memory shares = new SplitPay.RecipientShare[](0);
        vm.prank(payer);
        vm.expectRevert(SplitPay.TooFewRecipients.selector);
        splitPay.splitPay(100e6, shares);
    }

    function test_SplitPay_RevertTooManyRecipients_ElevenRecipients() public {
        SplitPay.RecipientShare[] memory shares = new SplitPay.RecipientShare[](11);
        for (uint256 i = 0; i < 11; i++) {
            shares[i] = SplitPay.RecipientShare({
                recipient: makeAddr(string(abi.encodePacked("x", i))),
                basisPoints: uint16(i == 10 ? 1010 : 900)  // just needs to exist; count check fires first
            });
        }
        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(SplitPay.TooManyRecipients.selector, uint256(11), uint256(10))
        );
        splitPay.splitPay(100e6, shares);
    }

    function test_SplitPay_RevertZeroAddressRecipient_FirstSlot() public {
        SplitPay.RecipientShare[] memory shares = _shares2(address(0), 5000, bob, 5000);
        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(SplitPay.ZeroAddressRecipient.selector, uint256(0))
        );
        splitPay.splitPay(100e6, shares);
    }

    function test_SplitPay_RevertZeroAddressRecipient_SecondSlot() public {
        SplitPay.RecipientShare[] memory shares = _shares2(alice, 5000, address(0), 5000);
        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(SplitPay.ZeroAddressRecipient.selector, uint256(1))
        );
        splitPay.splitPay(100e6, shares);
    }

    function test_SplitPay_RevertZeroShareBasisPoints() public {
        SplitPay.RecipientShare[] memory shares = _shares2(alice, 0, bob, 10_000);
        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(SplitPay.ZeroShareBasisPoints.selector, uint256(0))
        );
        splitPay.splitPay(100e6, shares);
    }

    function test_SplitPay_RevertZeroShareBasisPoints_SecondSlot() public {
        SplitPay.RecipientShare[] memory shares = _shares2(alice, 10_000, bob, 0);
        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(SplitPay.ZeroShareBasisPoints.selector, uint256(1))
        );
        splitPay.splitPay(100e6, shares);
    }

    function test_SplitPay_RevertDuplicateRecipient() public {
        SplitPay.RecipientShare[] memory shares = _shares2(alice, 5000, alice, 5000);
        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(SplitPay.DuplicateRecipient.selector, alice)
        );
        splitPay.splitPay(100e6, shares);
    }

    function test_SplitPay_RevertInvalidTotalBasisPoints_Over() public {
        // 5001 + 5001 = 10002 (over)
        SplitPay.RecipientShare[] memory shares = _shares2(alice, 5001, bob, 5001);
        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(SplitPay.InvalidTotalBasisPoints.selector, uint256(10_002), uint256(10_000))
        );
        splitPay.splitPay(100e6, shares);
    }

    function test_SplitPay_RevertInvalidTotalBasisPoints_Under() public {
        // 4999 + 4999 = 9998 (under)
        SplitPay.RecipientShare[] memory shares = _shares2(alice, 4999, bob, 4999);
        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(SplitPay.InvalidTotalBasisPoints.selector, uint256(9_998), uint256(10_000))
        );
        splitPay.splitPay(100e6, shares);
    }

    function test_SplitPay_RevertInsufficientAllowance() public {
        address poorPayer = makeAddr("poorPayer");
        usdc.mint(poorPayer, 100e6);
        // no approval given → transferFrom fails on allowance check in MockUSDC
        SplitPay.RecipientShare[] memory shares = _shares2(alice, 5000, bob, 5000);
        vm.prank(poorPayer);
        vm.expectRevert();  // will revert with "allowance" string from MockUSDC
        splitPay.splitPay(100e6, shares);
    }

    function test_SplitPay_RevertInsufficientBalance() public {
        address brokePayer = makeAddr("brokePayer");
        // mint less than the amount, but give approval
        usdc.mint(brokePayer, 1e6);
        vm.prank(brokePayer);
        usdc.approve(address(splitPay), type(uint256).max);

        SplitPay.RecipientShare[] memory shares = _shares2(alice, 5000, bob, 5000);
        vm.prank(brokePayer);
        vm.expectRevert(); // will revert with "insufficient" from MockUSDC
        splitPay.splitPay(100e6, shares);
    }

    // ========================================================================
    // 5.  previewSplit — happy path
    // ========================================================================

    function test_Preview_TwoRecipients_EvenSplit() public view {
        SplitPay.RecipientShare[] memory shares = _shares2(alice, 5000, bob, 5000);
        (uint256[] memory amounts, bool valid, string memory errorMsg) =
            splitPay.previewSplit(100e6, shares);

        assertTrue(valid, "should be valid");
        assertEq(errorMsg, "", "no error");
        assertEq(amounts.length, 2, "length");
        assertEq(amounts[0], 50e6, "alice");
        assertEq(amounts[1], 50e6, "bob");
    }

    function test_Preview_ThreeRecipients_50_30_20() public view {
        SplitPay.RecipientShare[] memory shares = _shares3(alice, 5000, bob, 3000, carol, 2000);
        (uint256[] memory amounts, bool valid, string memory errorMsg) =
            splitPay.previewSplit(100e6, shares);

        assertTrue(valid, "should be valid");
        assertEq(errorMsg, "", "no error");
        assertEq(amounts[0], 50e6, "alice");
        assertEq(amounts[1], 30e6, "bob");
        assertEq(amounts[2], 20e6, "carol");
    }

    function test_Preview_UnevenRemainder_GoesToLastRecipient() public view {
        SplitPay.RecipientShare[] memory shares = _shares3(alice, 3333, bob, 3333, carol, 3334);
        uint256 amount = 1e6;
        (uint256[] memory amounts, bool valid,) = splitPay.previewSplit(amount, shares);

        assertTrue(valid);
        assertEq(amounts[0] + amounts[1] + amounts[2], amount, "sum == totalAmount");
        // Last recipient absorbs remainder
        assertGe(amounts[2], amounts[0], "carol >= alice");
    }

    function test_Preview_AmountsSumToTotal() public view {
        SplitPay.RecipientShare[] memory shares = _shares3(alice, 3333, bob, 3333, carol, 3334);
        uint256 amount = 7_777_777; // awkward amount
        (uint256[] memory amounts, bool valid,) = splitPay.previewSplit(amount, shares);
        assertTrue(valid);
        assertEq(amounts[0] + amounts[1] + amounts[2], amount, "sum invariant");
    }

    // ========================================================================
    // 6.  previewSplit — invalid paths (returns valid=false, no revert)
    // ========================================================================

    function test_Preview_InvalidZeroAmount() public view {
        SplitPay.RecipientShare[] memory shares = _shares2(alice, 5000, bob, 5000);
        (, bool valid, string memory err) = splitPay.previewSplit(0, shares);
        assertFalse(valid, "invalid");
        assertEq(err, "ZeroAmount");
    }

    function test_Preview_InvalidTooFewRecipients() public view {
        SplitPay.RecipientShare[] memory shares = new SplitPay.RecipientShare[](1);
        shares[0] = SplitPay.RecipientShare({recipient: alice, basisPoints: 10_000});
        (, bool valid, string memory err) = splitPay.previewSplit(100e6, shares);
        assertFalse(valid, "invalid");
        assertEq(err, "TooFewRecipients");
    }

    function test_Preview_InvalidTooManyRecipients() public {
        SplitPay.RecipientShare[] memory shares = new SplitPay.RecipientShare[](11);
        for (uint256 i = 0; i < 11; i++) {
            shares[i] = SplitPay.RecipientShare({
                recipient: makeAddr(string(abi.encodePacked("p", i))),
                basisPoints: uint16(i == 10 ? 1010 : 900)
            });
        }
        (, bool valid, string memory err) = splitPay.previewSplit(100e6, shares);
        assertFalse(valid, "invalid");
        assertEq(err, "TooManyRecipients");
    }

    function test_Preview_InvalidZeroAddressRecipient() public view {
        SplitPay.RecipientShare[] memory shares = _shares2(address(0), 5000, bob, 5000);
        (, bool valid, string memory err) = splitPay.previewSplit(100e6, shares);
        assertFalse(valid, "invalid");
        assertEq(err, "ZeroAddressRecipient");
    }

    function test_Preview_InvalidZeroShareBasisPoints() public view {
        SplitPay.RecipientShare[] memory shares = _shares2(alice, 0, bob, 10_000);
        (, bool valid, string memory err) = splitPay.previewSplit(100e6, shares);
        assertFalse(valid, "invalid");
        assertEq(err, "ZeroShareBasisPoints");
    }

    function test_Preview_InvalidDuplicateRecipient() public view {
        SplitPay.RecipientShare[] memory shares = _shares2(alice, 5000, alice, 5000);
        (, bool valid, string memory err) = splitPay.previewSplit(100e6, shares);
        assertFalse(valid, "invalid");
        assertEq(err, "DuplicateRecipient");
    }

    function test_Preview_InvalidTotalBasisPointsOver() public view {
        SplitPay.RecipientShare[] memory shares = _shares2(alice, 5001, bob, 5001);
        (, bool valid, string memory err) = splitPay.previewSplit(100e6, shares);
        assertFalse(valid, "invalid");
        assertEq(err, "InvalidTotalBasisPoints");
    }

    function test_Preview_InvalidTotalBasisPointsUnder() public view {
        SplitPay.RecipientShare[] memory shares = _shares2(alice, 4999, bob, 4999);
        (, bool valid, string memory err) = splitPay.previewSplit(100e6, shares);
        assertFalse(valid, "invalid");
        assertEq(err, "InvalidTotalBasisPoints");
    }

    // ========================================================================
    // 7.  FUZZ — totalAmount with fixed ratio must always distribute sum == totalAmount
    // ========================================================================

    // Fuzz the total amount: with an exact 50/50 split, sums must always equal totalAmount.
    function testFuzz_SplitPay_SumEqualsTotal_EvenSplit(uint256 amount) public {
        // Bound: at least 2 (≥1 per recipient), at most the payer's balance
        amount = bound(amount, 2, INITIAL_BALANCE);

        SplitPay.RecipientShare[] memory shares = _shares2(alice, 5000, bob, 5000);

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 bobBefore   = usdc.balanceOf(bob);

        vm.prank(payer);
        splitPay.splitPay(amount, shares);

        uint256 aliceGot = usdc.balanceOf(alice) - aliceBefore;
        uint256 bobGot   = usdc.balanceOf(bob)   - bobBefore;

        assertEq(aliceGot + bobGot, amount, "sum == totalAmount");
        assertEq(usdc.balanceOf(address(splitPay)), 0, "contract must be empty");
    }

    // Fuzz the total amount with 3 recipients (uneven basis points): remainder always absorbed.
    function testFuzz_SplitPay_SumEqualsTotal_ThreeWay(uint256 amount) public {
        amount = bound(amount, 3, INITIAL_BALANCE);

        SplitPay.RecipientShare[] memory shares = _shares3(alice, 3333, bob, 3333, carol, 3334);

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 bobBefore   = usdc.balanceOf(bob);
        uint256 carolBefore = usdc.balanceOf(carol);

        vm.prank(payer);
        splitPay.splitPay(amount, shares);

        uint256 total = (usdc.balanceOf(alice) - aliceBefore)
                      + (usdc.balanceOf(bob)   - bobBefore)
                      + (usdc.balanceOf(carol) - carolBefore);

        assertEq(total, amount, "sum == totalAmount");
        assertEq(usdc.balanceOf(address(splitPay)), 0, "contract must be empty");
    }

    // Fuzz the basis points split for 2 recipients (must sum to 10_000).
    function testFuzz_SplitPay_SumEqualsTotal_FuzzedRatio(uint16 bpA, uint256 amount) public {
        // bpA in [1, 9999] so bpB = 10000 - bpA is also in [1, 9999]
        bpA    = uint16(bound(uint256(bpA), 1, 9_999));
        amount = bound(amount, 2, INITIAL_BALANCE);
        uint16 bpB = uint16(10_000 - bpA);

        SplitPay.RecipientShare[] memory shares = _shares2(alice, bpA, bob, bpB);

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 bobBefore   = usdc.balanceOf(bob);

        vm.prank(payer);
        splitPay.splitPay(amount, shares);

        uint256 total = (usdc.balanceOf(alice) - aliceBefore)
                      + (usdc.balanceOf(bob)   - bobBefore);

        assertEq(total, amount, "sum == totalAmount");
        assertEq(usdc.balanceOf(address(splitPay)), 0, "contract must be empty");
    }

    // ========================================================================
    // 8.  INVARIANT — The contract must never retain USDC after splitPay
    // ========================================================================
    //
    // Invariant: SplitPay is non-custodial — after every successful splitPay()
    // call the contract's USDC balance must be zero.
    //
    // Design note: we restrict the invariant fuzzer to call ONLY our handler
    // (via targetSelector) so the fuzzer cannot mint USDC directly into the
    // SplitPay address.  That would be a griefing scenario the contract is
    // deliberately robust against (it uses running-sum accounting), but it is
    // not a meaningful invariant to test here — we test the post-call state.

    uint256 internal _splitCount;

    // Shared setUp — runs before every test and every invariant run.
    function setUp() public {
        usdc     = new MockUSDC();
        splitPay = new SplitPay(address(usdc));
        usdc.mint(payer, INITIAL_BALANCE);
        vm.prank(payer);
        usdc.approve(address(splitPay), type(uint256).max);

        // Restrict the invariant fuzzer:
        //   1. Exclude MockUSDC so the fuzzer cannot mint USDC into SplitPay
        //      (that is intentional griefing-resistance, not an invariant violation).
        //   2. Exclude SplitPay so the fuzzer can only reach it through our handler.
        //   3. Scope the test contract to our single named handler.
        excludeContract(address(usdc));
        excludeContract(address(splitPay));
        bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = this.invariantHandler_splitPay.selector;
        targetSelector(FuzzSelector({addr: address(this), selectors: selectors}));
    }

    /// @dev Invariant handler: execute a valid splitPay so the invariant can fire.
    function invariantHandler_splitPay() external {
        // Use a fresh pair of recipients each call to avoid DuplicateRecipient.
        address r1 = address(uint160(0xBEEF0000 + _splitCount * 2));
        address r2 = address(uint160(0xBEEF0001 + _splitCount * 2));
        _splitCount++;

        SplitPay.RecipientShare[] memory shares = _shares2(r1, 5000, r2, 5000);

        uint256 payerBal = usdc.balanceOf(payer);
        if (payerBal < 2) return; // nothing to split

        vm.prank(payer);
        splitPay.splitPay(2, shares);
    }

    function invariant_ContractNeverHoldsUSDC() external view {
        assertEq(
            usdc.balanceOf(address(splitPay)),
            0,
            "SplitPay should never hold USDC after a completed call"
        );
    }
}
