//! shh bridge — the L1 (Solana) side of the shh SVM L2.
//!
//! Deposits: anyone locks SOL in the program's vault PDA together with an L2 recipient; the
//! relayer (client/relayer.mjs) watches the deposit log and credits the same amount on the L2.
//! Withdrawals: phase 1 is operator-signed release from the vault. Phase 2 replaces the
//! operator with a state-proof check (Groth16 over the L2 state commitments — the same BN254
//! core as packages/circuits, verifiable on Solana via the alt_bn128 syscalls).
//!
//! Accounts:
//!   config PDA ["config"]  42 bytes: operator(32) | deposit nonce(8) | bumps(2)
//!   vault  PDA ["vault"]   0 bytes, program-owned — holds the locked lamports
//!
//! Instructions (1-byte tag + little-endian fields):
//!   0 Initialize             accounts: payer(s,w) config(w) vault(w) operator system
//!   1 Deposit  {amount u64, l2_recipient [u8;32]}
//!                            accounts: depositor(s,w) config(w) vault(w) system
//!   2 Withdraw {amount u64}  accounts: operator(s) config vault(w) recipient(w)

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    instruction::{AccountMeta, Instruction},
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    sysvar::Sysvar,
};

#[cfg(not(feature = "no-entrypoint"))]
solana_program::entrypoint!(process_instruction);

const SYSTEM_PROGRAM_ID: Pubkey = Pubkey::new_from_array([0u8; 32]);
const CONFIG_SEED: &[u8] = b"config";
const VAULT_SEED: &[u8] = b"vault";
const CONFIG_LEN: usize = 42;

pub fn process_instruction(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let (tag, rest) = data.split_first().ok_or(ProgramError::InvalidInstructionData)?;
    match tag {
        0 => initialize(program_id, accounts),
        1 => deposit(program_id, accounts, rest),
        2 => withdraw(program_id, accounts, rest),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

fn expected_pdas(program_id: &Pubkey) -> ((Pubkey, u8), (Pubkey, u8)) {
    (
        Pubkey::find_program_address(&[CONFIG_SEED], program_id),
        Pubkey::find_program_address(&[VAULT_SEED], program_id),
    )
}

// The system program's wire format is frozen; building the two instructions we need by hand
// keeps this crate to a single dependency.
fn system_create_account(from: &Pubkey, to: &Pubkey, lamports: u64, space: u64, owner: &Pubkey) -> Instruction {
    let mut data = Vec::with_capacity(52);
    data.extend_from_slice(&0u32.to_le_bytes());
    data.extend_from_slice(&lamports.to_le_bytes());
    data.extend_from_slice(&space.to_le_bytes());
    data.extend_from_slice(owner.as_ref());
    Instruction {
        program_id: SYSTEM_PROGRAM_ID,
        accounts: vec![AccountMeta::new(*from, true), AccountMeta::new(*to, true)],
        data,
    }
}

fn system_transfer(from: &Pubkey, to: &Pubkey, lamports: u64) -> Instruction {
    let mut data = Vec::with_capacity(12);
    data.extend_from_slice(&2u32.to_le_bytes());
    data.extend_from_slice(&lamports.to_le_bytes());
    Instruction {
        program_id: SYSTEM_PROGRAM_ID,
        accounts: vec![AccountMeta::new(*from, true), AccountMeta::new(*to, false)],
        data,
    }
}

fn initialize(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let it = &mut accounts.iter();
    let payer = next_account_info(it)?;
    let config = next_account_info(it)?;
    let vault = next_account_info(it)?;
    let operator = next_account_info(it)?;
    let system = next_account_info(it)?;

    if !payer.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    let ((config_key, config_bump), (vault_key, vault_bump)) = expected_pdas(program_id);
    if *config.key != config_key || *vault.key != vault_key || *system.key != SYSTEM_PROGRAM_ID {
        return Err(ProgramError::InvalidSeeds);
    }
    if config.lamports() > 0 || !config.data_is_empty() {
        return Err(ProgramError::AccountAlreadyInitialized);
    }

    let rent = Rent::get()?;
    invoke_signed(
        &system_create_account(payer.key, config.key, rent.minimum_balance(CONFIG_LEN), CONFIG_LEN as u64, program_id),
        &[payer.clone(), config.clone(), system.clone()],
        &[&[CONFIG_SEED, &[config_bump]]],
    )?;
    // The vault carries no data but must be program-owned so Withdraw may debit it.
    invoke_signed(
        &system_create_account(payer.key, vault.key, rent.minimum_balance(0), 0, program_id),
        &[payer.clone(), vault.clone(), system.clone()],
        &[&[VAULT_SEED, &[vault_bump]]],
    )?;

    let mut d = config.try_borrow_mut_data()?;
    d[..32].copy_from_slice(operator.key.as_ref());
    d[32..40].copy_from_slice(&0u64.to_le_bytes());
    d[40] = config_bump;
    d[41] = vault_bump;

    msg!("shh-bridge:initialized|operator={}|config={}|vault={}", operator.key, config.key, vault.key);
    Ok(())
}

fn deposit(program_id: &Pubkey, accounts: &[AccountInfo], rest: &[u8]) -> ProgramResult {
    let it = &mut accounts.iter();
    let depositor = next_account_info(it)?;
    let config = next_account_info(it)?;
    let vault = next_account_info(it)?;
    let system = next_account_info(it)?;

    if rest.len() != 40 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let amount = u64::from_le_bytes(rest[..8].try_into().unwrap());
    let l2_recipient = Pubkey::new_from_array(rest[8..40].try_into().unwrap());
    if amount == 0 {
        return Err(ProgramError::InvalidInstructionData);
    }
    if !depositor.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    let ((config_key, _), (vault_key, _)) = expected_pdas(program_id);
    if *config.key != config_key || *vault.key != vault_key || *system.key != SYSTEM_PROGRAM_ID {
        return Err(ProgramError::InvalidSeeds);
    }
    if config.owner != program_id {
        return Err(ProgramError::UninitializedAccount);
    }

    invoke(
        &system_transfer(depositor.key, vault.key, amount),
        &[depositor.clone(), vault.clone(), system.clone()],
    )?;

    let mut d = config.try_borrow_mut_data()?;
    let nonce = u64::from_le_bytes(d[32..40].try_into().unwrap());
    let next = nonce.checked_add(1).ok_or(ProgramError::InvalidAccountData)?;
    d[32..40].copy_from_slice(&next.to_le_bytes());

    // The relayer keys on this exact line: shh-bridge:deposit|<nonce>|<l2 recipient>|<lamports>
    msg!("shh-bridge:deposit|{}|{}|{}", nonce, l2_recipient, amount);
    Ok(())
}

fn withdraw(program_id: &Pubkey, accounts: &[AccountInfo], rest: &[u8]) -> ProgramResult {
    let it = &mut accounts.iter();
    let operator = next_account_info(it)?;
    let config = next_account_info(it)?;
    let vault = next_account_info(it)?;
    let recipient = next_account_info(it)?;

    if rest.len() != 8 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let amount = u64::from_le_bytes(rest[..8].try_into().unwrap());
    if amount == 0 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let ((config_key, _), (vault_key, _)) = expected_pdas(program_id);
    if *config.key != config_key || *vault.key != vault_key {
        return Err(ProgramError::InvalidSeeds);
    }
    if config.owner != program_id {
        return Err(ProgramError::UninitializedAccount);
    }
    let stored_operator = Pubkey::new_from_array(config.try_borrow_data()?[..32].try_into().unwrap());
    if !operator.is_signer || *operator.key != stored_operator {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Never drain below the vault's own rent floor, or the account could be reaped.
    let floor = Rent::get()?.minimum_balance(0);
    let available = vault.lamports().saturating_sub(floor);
    if amount > available {
        return Err(ProgramError::InsufficientFunds);
    }
    **vault.try_borrow_mut_lamports()? -= amount;
    **recipient.try_borrow_mut_lamports()? += amount;

    msg!("shh-bridge:withdraw|{}|{}", recipient.key, amount);
    Ok(())
}
