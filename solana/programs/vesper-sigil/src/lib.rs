//! Vesper sigil registry.
//!
//! One sigil per vigil: a PDA holding the sealed record, an `Art` PDA holding
//! the SVG bytes, a Token-2022 soulbound NFT, and a `Ledger` PDA anchoring the
//! head of the keeper-signed revocation ledger. No admin instruction exists.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    ed25519_program, hash,
    instruction::{AccountMeta, Instruction},
    program::invoke,
    rent::Rent,
    system_instruction,
    sysvar::instructions::{load_current_index_checked, load_instruction_at_checked},
};
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::spl_token_2022::{
        extension::{metadata_pointer, ExtensionType},
        instruction::{initialize_mint2, initialize_non_transferable_mint, mint_to, set_authority, AuthorityType},
        state::Mint as PodMint,
        ID as TOKEN_2022_ID,
    },
    token_interface::{Token2022, TokenAccount},
};
use spl_token_metadata_interface::instruction::initialize as initialize_token_metadata;

declare_id!("94gY7rp5wE4mDEEKs5sKY7oKeiVa5nHoRTDbL1Gu5erX");

pub const SIGIL_SEED: &[u8] = b"sigil";
pub const ART_SEED: &[u8] = b"art";
pub const LEDGER_SEED: &[u8] = b"ledger";

pub const MIN_DURATION_MIN: u16 = 1;
pub const MAX_DURATION_MIN: u16 = 600;
pub const MAX_FOCUSED_SEC: u32 = 86_400 * 7;
pub const MAX_ART_LEN: usize = 16 * 1024;

pub const OUTCOME_COMPLETED: u8 = 0;
pub const OUTCOME_RELEASED: u8 = 1;

pub const SIGIL_NAME: &str = "Vesper Sigil";
pub const SIGIL_SYMBOL: &str = "VSPR";
pub const APP_BASE_URI: &str = "https://ibalofa.github.io/vesper/#/sigil/";

/// Token-2022 grows the mint account to fit the metadata it is given; fund
/// the rent for a generous reserve up front so the realloc never fails.
const METADATA_RESERVE: usize = 4 + 512;

#[program]
pub mod vesper_sigil {
    use super::*;

    #[allow(clippy::too_many_arguments)]
    #[allow(clippy::too_many_arguments)]
    pub fn mint(
        ctx: Context<MintSigil>,
        sigil_id: [u8; 32],
        seal: [u8; 32],
        message_hash: [u8; 32],
        duration_min: u16,
        focused_sec: u32,
        outcome: u8,
        art_hash: [u8; 32],
        art_len: u32,
    ) -> Result<()> {
        require!(
            (MIN_DURATION_MIN..=MAX_DURATION_MIN).contains(&duration_min),
            SigilError::DurationBounds
        );
        require!(outcome <= OUTCOME_RELEASED, SigilError::BadOutcome);
        require!(focused_sec <= MAX_FOCUSED_SEC, SigilError::FocusedBounds);
        require!(
            art_len > 0 && (art_len as usize) <= MAX_ART_LEN,
            SigilError::BadArt
        );

        let instructions = ctx.accounts.instructions.to_account_info();
        let index = load_current_index_checked(&instructions)?;
        require!(index > 0, SigilError::SignatureMissing);
        let preceding = load_instruction_at_checked(index as usize - 1, &instructions)?;
        check_signed_by(&preceding, &ctx.accounts.keeper.key(), &message_hash)?;

        mint_sigil_token(&ctx, &sigil_id)?;

        let now = Clock::get()?.unix_timestamp;
        let sigil = &mut ctx.accounts.sigil;
        sigil.sigil_id = sigil_id;
        sigil.keeper = ctx.accounts.keeper.key();
        sigil.seal = seal;
        sigil.message_hash = message_hash;
        sigil.art_hash = art_hash;
        sigil.art_len = art_len;
        sigil.duration_min = duration_min;
        sigil.focused_sec = focused_sec;
        sigil.outcome = outcome;
        sigil.minted_at = now;
        sigil.revoked = false;
        sigil.mint = ctx.accounts.mint.key();
        sigil.bump = ctx.bumps.sigil;

        emit!(SigilMinted {
            sigil_id,
            keeper: sigil.keeper,
            seal,
            mint: sigil.mint,
            duration_min,
            focused_sec,
            outcome,
            minted_at: now,
        });
        Ok(())
    }

    /// A transaction is capped at 1232 bytes, so the SVG arrives in chunks
    /// after `mint` has reserved the `Art` account. The hash is checked once
    /// the last chunk lands.
    pub fn write_art(
        ctx: Context<WriteArt>,
        _sigil_id: [u8; 32],
        offset: u32,
        chunk: Vec<u8>,
    ) -> Result<()> {
        let sigil = &ctx.accounts.sigil;
        let art = &mut ctx.accounts.art;

        require!(!chunk.is_empty(), SigilError::ArtChunk);
        require!(offset as usize == art.bytes.len(), SigilError::ArtChunk);
        let end = offset as usize + chunk.len();
        require!(end <= sigil.art_len as usize, SigilError::BadArt);

        art.bytes.extend_from_slice(&chunk);

        if end == sigil.art_len as usize {
            require!(
                hash::hashv(&[art.bytes.as_slice()]).to_bytes() == sigil.art_hash,
                SigilError::BadArt
            );
            emit!(ArtSealed {
                sigil_id: sigil.sigil_id,
                art_len: end as u32,
                art_hash: sigil.art_hash,
            });
        }
        Ok(())
    }

    pub fn revoke(
        ctx: Context<RevokeSigil>,
        _sigil_id: [u8; 32],
        ledger_seq: u64,
        ledger_prev: [u8; 32],
        ledger_head: [u8; 32],
    ) -> Result<()> {
        let sigil = &mut ctx.accounts.sigil;
        let ledger = &mut ctx.accounts.ledger;

        require!(!sigil.revoked, SigilError::AlreadyReleased);
        require!(
            ledger.seq.checked_add(1) == Some(ledger_seq),
            SigilError::LedgerSequence
        );
        require!(ledger.head == ledger_prev, SigilError::LedgerSequence);

        sigil.revoked = true;
        ledger.seq = ledger_seq;
        ledger.head = ledger_head;
        ledger.bump = ctx.bumps.ledger;

        emit!(SigilReleased {
            sigil_id: sigil.sigil_id,
            seq: ledger_seq,
            head: ledger_head,
        });
        Ok(())
    }
}

#[account]
#[derive(InitSpace)]
pub struct Sigil {
    pub sigil_id: [u8; 32],
    pub keeper: Pubkey,
    pub seal: [u8; 32],
    pub message_hash: [u8; 32],
    pub art_hash: [u8; 32],
    pub art_len: u32,
    pub duration_min: u16,
    pub focused_sec: u32,
    pub outcome: u8,
    pub minted_at: i64,
    pub revoked: bool,
    pub mint: Pubkey,
    pub bump: u8,
}

#[account]
pub struct Art {
    pub bytes: Vec<u8>,
}

impl Art {
    pub const HEADER: usize = 8 + 4;
}

#[account]
#[derive(InitSpace)]
pub struct Ledger {
    pub seq: u64,
    pub head: [u8; 32],
    pub bump: u8,
}

#[derive(Accounts)]
#[instruction(
    sigil_id: [u8; 32],
    seal: [u8; 32],
    message_hash: [u8; 32],
    duration_min: u16,
    focused_sec: u32,
    outcome: u8,
    art_hash: [u8; 32],
    art_len: u32
)]
pub struct MintSigil<'info> {
    #[account(mut, constraint = (art_len as usize) <= MAX_ART_LEN @ SigilError::BadArt)]
    pub keeper: Signer<'info>,

    #[account(
        init,
        payer = keeper,
        space = 8 + Sigil::INIT_SPACE,
        seeds = [SIGIL_SEED, sigil_id.as_ref()],
        bump,
    )]
    pub sigil: Box<Account<'info, Sigil>>,

    #[account(
        init,
        payer = keeper,
        space = Art::HEADER + art_len as usize,
        seeds = [ART_SEED, sigil_id.as_ref()],
        bump,
    )]
    pub art: Box<Account<'info, Art>>,

    #[account(mut)]
    pub mint: Signer<'info>,

    /// CHECK: address-pinned to the keeper's Token-2022 associated account,
    /// which this instruction creates once the mint exists.
    #[account(
        mut,
        constraint = token_account.key()
            == anchor_spl::associated_token::get_associated_token_address_with_program_id(
                &keeper.key(),
                &mint.key(),
                &TOKEN_2022_ID,
            ) @ SigilError::BadTokenAccount,
    )]
    pub token_account: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,

    /// CHECK: the instructions sysvar, address-pinned.
    #[account(address = anchor_lang::solana_program::sysvar::instructions::id())]
    pub instructions: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(sigil_id: [u8; 32])]
pub struct WriteArt<'info> {
    #[account(mut)]
    pub keeper: Signer<'info>,

    #[account(
        seeds = [SIGIL_SEED, sigil_id.as_ref()],
        bump = sigil.bump,
        constraint = sigil.keeper == keeper.key() @ SigilError::WrongKeeper,
    )]
    pub sigil: Box<Account<'info, Sigil>>,

    #[account(
        mut,
        seeds = [ART_SEED, sigil_id.as_ref()],
        bump,
    )]
    pub art: Box<Account<'info, Art>>,
}

#[derive(Accounts)]
#[instruction(sigil_id: [u8; 32], ledger_seq: u64, ledger_prev: [u8; 32], ledger_head: [u8; 32])]
pub struct RevokeSigil<'info> {
    #[account(mut)]
    pub keeper: Signer<'info>,

    #[account(
        mut,
        seeds = [SIGIL_SEED, sigil_id.as_ref()],
        bump = sigil.bump,
        constraint = sigil.keeper == keeper.key() @ SigilError::WrongKeeper,
    )]
    pub sigil: Box<Account<'info, Sigil>>,

    #[account(
        init_if_needed,
        payer = keeper,
        space = 8 + Ledger::INIT_SPACE,
        seeds = [LEDGER_SEED],
        bump,
    )]
    pub ledger: Box<Account<'info, Ledger>>,

    pub system_program: Program<'info, System>,
}

#[event]
pub struct SigilMinted {
    pub sigil_id: [u8; 32],
    pub keeper: Pubkey,
    pub seal: [u8; 32],
    pub mint: Pubkey,
    pub duration_min: u16,
    pub focused_sec: u32,
    pub outcome: u8,
    pub minted_at: i64,
}

#[event]
pub struct SigilReleased {
    pub sigil_id: [u8; 32],
    pub seq: u64,
    pub head: [u8; 32],
}

#[event]
pub struct ArtSealed {
    pub sigil_id: [u8; 32],
    pub art_len: u32,
    pub art_hash: [u8; 32],
}

#[error_code]
pub enum SigilError {
    #[msg("The duration must be between 1 and 600 minutes.")]
    DurationBounds,
    #[msg("The focused time is out of range.")]
    FocusedBounds,
    #[msg("Only completed or released is a valid outcome.")]
    BadOutcome,
    #[msg("The art does not match its hash, or is larger than 16 KiB.")]
    BadArt,
    #[msg("No Ed25519 verification instruction precedes this mint.")]
    SignatureMissing,
    #[msg("The Ed25519 verification instruction is malformed.")]
    SignatureMalformed,
    #[msg("The Ed25519 verification instruction does not name this keeper.")]
    SignatureKeeper,
    #[msg("The signed message does not match the recorded message hash.")]
    SignatureMessage,
    #[msg("This sigil has already been released.")]
    AlreadyReleased,
    #[msg("The ledger sequence or head does not follow the current head.")]
    LedgerSequence,
    #[msg("Only the keeper of this sigil may act on it.")]
    WrongKeeper,
    #[msg("The art chunk does not continue the art already written.")]
    ArtChunk,
    #[msg("That is not the keeper's associated token account for this mint.")]
    BadTokenAccount,
}

fn check_signed_by(
    preceding: &Instruction,
    keeper: &Pubkey,
    message_hash: &[u8; 32],
) -> Result<()> {
    require_keys_eq!(
        preceding.program_id,
        ed25519_program::id(),
        SigilError::SignatureMissing
    );
    check_ed25519_data(&preceding.data, keeper, message_hash)
}

/// Validates the shape of an Ed25519 verify instruction and that it names
/// `keeper` over a message hashing to `message_hash`. The precompile itself
/// proves the signature; this function proves the proof is about us.
fn check_ed25519_data(data: &[u8], keeper: &Pubkey, message_hash: &[u8; 32]) -> Result<()> {
    require!(data.len() >= 16, SigilError::SignatureMalformed);
    require!(data[0] == 1 && data[1] == 0, SigilError::SignatureMalformed);

    let word = |at: usize| u16::from_le_bytes([data[at], data[at + 1]]);
    let sig_off = word(2) as usize;
    let sig_ix = word(4);
    let pk_off = word(6) as usize;
    let pk_ix = word(8);
    let msg_off = word(10) as usize;
    let msg_len = word(12) as usize;
    let msg_ix = word(14);

    require!(
        sig_ix == u16::MAX && pk_ix == u16::MAX && msg_ix == u16::MAX,
        SigilError::SignatureMalformed
    );
    require!(sig_off >= 16 && sig_off + 64 <= data.len(), SigilError::SignatureMalformed);
    require!(pk_off >= 16 && pk_off + 32 <= data.len(), SigilError::SignatureMalformed);
    require!(msg_off >= 16 && msg_off + msg_len <= data.len(), SigilError::SignatureMalformed);

    require!(
        data[pk_off..pk_off + 32] == keeper.to_bytes(),
        SigilError::SignatureKeeper
    );
    let digest = hash::hashv(&[&data[msg_off..msg_off + msg_len]]);
    require!(digest.to_bytes() == *message_hash, SigilError::SignatureMessage);
    Ok(())
}

fn mint_sigil_token(ctx: &Context<MintSigil>, sigil_id: &[u8; 32]) -> Result<()> {
    let keeper = ctx.accounts.keeper.to_account_info();
    let mint = ctx.accounts.mint.to_account_info();
    let token_program = ctx.accounts.token_program.to_account_info();
    let system_program = ctx.accounts.system_program.to_account_info();

    let extensions = [ExtensionType::NonTransferable, ExtensionType::MetadataPointer];
    let mint_len = ExtensionType::try_calculate_account_len::<PodMint>(&extensions)
        .map_err(|_| error!(SigilError::SignatureMalformed))?;
    // `InitializeMint2` insists the account is exactly `mint_len` bytes, and
    // the token program reallocs the mint to fit its metadata afterwards, so
    // fund the rent for that growth up front.
    let lamports = Rent::get()?.minimum_balance(mint_len + METADATA_RESERVE);

    invoke(
        &system_instruction::create_account(
            &keeper.key,
            &mint.key,
            lamports,
            mint_len as u64,
            &TOKEN_2022_ID,
        ),
        &[keeper.clone(), mint.clone(), system_program.clone()],
    )?;

    invoke(
        &metadata_pointer::instruction::initialize(
            &TOKEN_2022_ID,
            &mint.key,
            Some(*keeper.key),
            Some(*mint.key),
        )?,
        &[mint.clone()],
    )?;

    invoke(
        &initialize_non_transferable_mint(&TOKEN_2022_ID, &mint.key)?,
        &[mint.clone()],
    )?;

    invoke(
        &initialize_mint2(&TOKEN_2022_ID, &mint.key, &keeper.key, None, 0)?,
        &[mint.clone()],
    )?;

    let uri = format!("{APP_BASE_URI}{}", hex32(sigil_id));
    invoke(
        &initialize_token_metadata(
            &TOKEN_2022_ID,
            &mint.key,
            &keeper.key,
            &mint.key,
            &keeper.key,
            SIGIL_NAME.to_string(),
            SIGIL_SYMBOL.to_string(),
            uri,
        ),
        &[
            mint.clone(),
            keeper.clone(),
            mint.clone(),
            keeper.clone(),
        ],
    )?;

    // The ATA program reads the mint's extensions to size the account, so the
    // token account can only be created once the mint exists.
    let token_account = ctx.accounts.token_account.to_account_info();
    let ata_program = ctx.accounts.associated_token_program.to_account_info();
    invoke(
        &create_ata_idempotent(
            &keeper.key,
            &keeper.key,
            &mint.key,
            &token_account.key,
            &system_program.key,
            &TOKEN_2022_ID,
            &ata_program.key,
        ),
        &[
            keeper.clone(),
            token_account.clone(),
            mint.clone(),
            system_program.clone(),
            token_program.clone(),
            ata_program,
        ],
    )?;

    invoke(
        &mint_to(
            &TOKEN_2022_ID,
            &mint.key,
            &token_account.key,
            &keeper.key,
            &[],
            1,
        )?,
        &[mint.clone(), token_account, keeper.clone()],
    )?;

    invoke(
        &set_authority(
            &TOKEN_2022_ID,
            &mint.key,
            None,
            AuthorityType::MintTokens,
            &keeper.key,
            &[],
        )?,
        &[mint, keeper, token_program],
    )?;
    Ok(())
}

/// `CreateIdempotent` for an associated token account, built by hand so the
/// program does not carry the ATA crate as a dependency.
fn create_ata_idempotent(
    payer: &Pubkey,
    owner: &Pubkey,
    mint: &Pubkey,
    token_account: &Pubkey,
    system_program: &Pubkey,
    token_program: &Pubkey,
    ata_program: &Pubkey,
) -> Instruction {
    Instruction {
        program_id: *ata_program,
        accounts: vec![
            AccountMeta::new(*payer, true),
            AccountMeta::new(*token_account, false),
            AccountMeta::new_readonly(*owner, false),
            AccountMeta::new_readonly(*mint, false),
            AccountMeta::new_readonly(*system_program, false),
            AccountMeta::new_readonly(*token_program, false),
        ],
        data: vec![1],
    }
}

fn hex32(bytes: &[u8; 32]) -> String {    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(64);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn keeper() -> Pubkey {
        Pubkey::new_from_array([7u8; 32])
    }

    fn verify_instruction(message: &[u8], signer: &Pubkey) -> Vec<u8> {
        let offsets_len = 16usize;
        let sig_off = offsets_len;
        let pk_off = sig_off + 64;
        let msg_off = pk_off + 32;
        let mut data = Vec::with_capacity(msg_off + message.len());
        data.push(1);
        data.push(0);
        for value in [
            sig_off as u16,
            u16::MAX,
            pk_off as u16,
            u16::MAX,
            msg_off as u16,
            message.len() as u16,
            u16::MAX,
        ] {
            data.extend_from_slice(&value.to_le_bytes());
        }
        data.extend_from_slice(&[9u8; 64]);
        data.extend_from_slice(&signer.to_bytes());
        data.extend_from_slice(message);
        data
    }

    fn hash_of(message: &[u8]) -> [u8; 32] {
        hash::hashv(&[message]).to_bytes()
    }

    #[test]
    fn account_layouts_match_the_design() {
        assert_eq!(Sigil::INIT_SPACE, 213);
        assert_eq!(Ledger::INIT_SPACE, 41);
        assert_eq!(Art::HEADER, 12);
        assert_eq!(8 + Sigil::INIT_SPACE, 221);
        assert_eq!(8 + Ledger::INIT_SPACE, 49);
    }

    #[test]
    fn accepts_a_well_formed_instruction() {
        let message = b"vesper.vigil.v2\ntest";
        let data = verify_instruction(message, &keeper());
        check_ed25519_data(&data, &keeper(), &hash_of(message)).unwrap();
    }

    #[test]
    fn rejects_another_keeper() {
        let message = b"vesper.vigil.v2\ntest";
        let data = verify_instruction(message, &keeper());
        let err = check_ed25519_data(&data, &Pubkey::new_from_array([8u8; 32]), &hash_of(message))
            .unwrap_err();
        assert!(format!("{err}").contains("does not name this keeper"), "{err}");
    }

    #[test]
    fn rejects_another_message() {
        let data = verify_instruction(b"vesper.vigil.v2\none", &keeper());
        let err = check_ed25519_data(&data, &keeper(), &hash_of(b"vesper.vigil.v2\ntwo"))
            .unwrap_err();
        assert!(format!("{err}").contains("does not match the recorded message hash"), "{err}");
    }

    #[test]
    fn rejects_two_signatures() {
        let message = b"vesper.vigil.v2\ntest";
        let mut data = verify_instruction(message, &keeper());
        data[0] = 2;
        let err = check_ed25519_data(&data, &keeper(), &hash_of(message)).unwrap_err();
        assert!(format!("{err}").contains("malformed"), "{err}");
    }

    #[test]
    fn rejects_out_of_range_offsets() {
        let message = b"vesper.vigil.v2\ntest";
        let mut data = verify_instruction(message, &keeper());
        let bogus = (data.len() as u16) + 1;
        data[6..8].copy_from_slice(&bogus.to_le_bytes());
        let err = check_ed25519_data(&data, &keeper(), &hash_of(message)).unwrap_err();
        assert!(format!("{err}").contains("malformed"), "{err}");
    }

    #[test]
    fn rejects_cross_instruction_references() {
        let message = b"vesper.vigil.v2\ntest";
        let mut data = verify_instruction(message, &keeper());
        data[14..16].copy_from_slice(&0u16.to_le_bytes());
        let err = check_ed25519_data(&data, &keeper(), &hash_of(message)).unwrap_err();
        assert!(format!("{err}").contains("malformed"), "{err}");
    }

    #[test]
    fn rejects_truncated_instructions() {
        let err = check_ed25519_data(&[1, 0, 0, 0], &keeper(), &[0u8; 32]).unwrap_err();
        assert!(format!("{err}").contains("malformed"), "{err}");
    }

    #[test]
    fn hex32_is_lowercase_and_fixed_width() {
        assert_eq!(hex32(&[0u8; 32]), "0".repeat(64));
        assert_eq!(
            hex32(&[0xab; 32]),
            "abababababababababababababababababababababababababababababababab"
        );
    }
}
