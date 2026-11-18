// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title Vesper Sigils
/// @notice Soulbound record of kept vigils. A keeper signs the vigil as EIP-712 typed data;
///         the registry verifies that signature, then mints a token that can never be moved.
contract VesperSigils is ERC721, EIP712 {
    using Strings for uint256;

    struct Vigil {
        bytes32 id;
        address keeper;
        string startedAt;
        uint32 durationMin;
        bytes32 seal;
    }

    bytes32 private constant VIGIL_TYPEHASH =
        keccak256("Vigil(bytes32 id,address keeper,string startedAt,uint32 durationMin,bytes32 seal)");

    mapping(bytes32 sigilId => uint256 tokenId) private _tokenOfSigil;
    mapping(uint256 tokenId => bytes32 seal) public sealOf;
    mapping(uint256 tokenId => uint32 durationMin) public durationOf;
    mapping(uint256 tokenId => string startedAt) public startedAtOf;

    uint256 public totalSupply;

    event SigilSealed(
        uint256 indexed tokenId,
        bytes32 indexed sigilId,
        address indexed keeper,
        bytes32 seal
    );

    error AlreadySealed(bytes32 sigilId);
    error KeeperMismatch();
    error InvalidSeal();
    error InvalidDuration();
    error InvalidStartedAt();
    error Soulbound();
    error UnknownToken(uint256 tokenId);

    constructor() ERC721("Vesper Sigils", "VESPER") EIP712("Vesper", "1") {}

    /// @notice Mint the sigil for a kept vigil. The caller must be the keeper who signed it.
    /// @param vigil The vigil exactly as signed off-chain.
    /// @param signature EIP-712 signature over the vigil from `vigil.keeper`.
    function mint(Vigil calldata vigil, bytes calldata signature) external returns (uint256 tokenId) {
        if (_tokenOfSigil[vigil.id] != 0) revert AlreadySealed(vigil.id);
        if (vigil.keeper != msg.sender) revert KeeperMismatch();
        if (vigil.seal == bytes32(0)) revert InvalidSeal();
        if (vigil.durationMin < 1 || vigil.durationMin > 600) revert InvalidDuration();
        if (!_isTimestamp(vigil.startedAt)) revert InvalidStartedAt();

        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    VIGIL_TYPEHASH,
                    vigil.id,
                    vigil.keeper,
                    keccak256(bytes(vigil.startedAt)),
                    vigil.durationMin,
                    vigil.seal
                )
            )
        );
        if (ECDSA.recover(digest, signature) != vigil.keeper) revert KeeperMismatch();

        tokenId = ++totalSupply;
        _tokenOfSigil[vigil.id] = tokenId;
        sealOf[tokenId] = vigil.seal;
        durationOf[tokenId] = vigil.durationMin;
        startedAtOf[tokenId] = vigil.startedAt;

        _safeMint(vigil.keeper, tokenId);
        emit SigilSealed(tokenId, vigil.id, vigil.keeper, vigil.seal);
    }

    function tokenOfSigil(bytes32 sigilId) external view returns (uint256) {
        return _tokenOfSigil[sigilId];
    }

    /// @notice ERC-5192: every existing Vesper sigil is locked forever.
    function locked(uint256 tokenId) external view returns (bool) {
        if (_ownerOf(tokenId) == address(0)) revert UnknownToken(tokenId);
        return true;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        string memory sealHex = _toHexString(sealOf[tokenId]);

        string memory json = string.concat(
            '{"name":"Vesper Sigil #',
            tokenId.toString(),
            '","description":"A kept vigil, sealed by its keeper. The sigil is bound to this wallet and can never be moved.",',
            '"attributes":[',
            '{"trait_type":"Seal","value":"',
            sealHex,
            '"},{"trait_type":"Duration","value":',
            uint256(durationOf[tokenId]).toString(),
            '},{"trait_type":"Started","value":"',
            startedAtOf[tokenId],
            '"},',
            '{"trait_type":"Soulbound","value":"true"}],',
            '"image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(_svg(tokenId, sealHex))),
            '"}'
        );

        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function approve(address, uint256) public pure override {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert Soulbound();
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    function _svg(uint256 tokenId, string memory sealHex) private pure returns (string memory) {
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">',
            '<rect width="400" height="400" fill="#07060b"/>',
            '<circle cx="200" cy="200" r="152" fill="none" stroke="#e08a4b" stroke-opacity=".5"/>',
            '<circle cx="200" cy="200" r="120" fill="none" stroke="#e9e2d0" stroke-opacity=".22" stroke-dasharray="4 10"/>',
            '<circle cx="200" cy="200" r="86" fill="none" stroke="#8a7fbd" stroke-opacity=".28" stroke-dasharray="2 8"/>',
            '<path d="M200 122c14 16 21 28 21 38a21 21 0 1 1-42 0c0-10 7-22 21-38z" fill="#e08a4b"/>',
            '<path d="M200 138c6 7 9 13 9 18a9 9 0 0 1-18 0c0-5 3-11 9-18z" fill="#ffe2b5"/>',
            '<text x="200" y="330" fill="#a09aab" font-family="monospace" font-size="10" text-anchor="middle">',
            sealHex,
            "</text>",
            '<text x="200" y="352" fill="#7c7687" font-family="monospace" font-size="9" letter-spacing="2" text-anchor="middle">VESPER SIGIL #',
            tokenId.toString(),
            "</text>",
            "</svg>"
        );
    }

    function _toHexString(bytes32 value) private pure returns (string memory) {
        bytes16 alphabet = "0123456789abcdef";
        bytes memory out = new bytes(66);
        out[0] = "0";
        out[1] = "x";
        for (uint256 i = 0; i < 32; i++) {
            uint8 b = uint8(value[i]);
            out[2 + i * 2] = alphabet[b >> 4];
            out[3 + i * 2] = alphabet[b & 0x0f];
        }
        return string(out);
    }

    function _isTimestamp(string calldata value) private pure returns (bool) {
        bytes calldata raw = bytes(value);
        if (raw.length == 0 || raw.length > 20) return false;
        for (uint256 i = 0; i < raw.length; i++) {
            if (raw[i] < 0x30 || raw[i] > 0x39) return false;
        }
        return true;
    }
}
