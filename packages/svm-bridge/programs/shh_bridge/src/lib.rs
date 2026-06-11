//! shh bridge — the L1 (Solana) side of the shh SVM L2 (Anchor program).
//!
//! Deposits: anyone locks SOL in the program's vault PDA together with an L2 recipient; the
//! relayer (client/relayer.mjs) watches the deposit log and credits the same amount on the L2.
//! Withdrawals: phase 1 is operator-signed release from the vault. Phase 2 replaces the
//! operator with a state-proof check (Groth16 over the L2 state commitments — the same BN254
//! core as packages/circuits, verifiable on Solana via the alt_bn128 syscalls).
//!
//! PDAs: config ["config"] holds operator + deposit nonce; vault ["vault"] is a system-owned
//! account that custodies the locked lamports.

use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};

declare_id!("bcnPMqscm6oy1KM6BKTwVjhs2QEBXs2U81FSixJzUhG");

#[program]
pub mod shh_bridge {
    use super::*;

    /// One-time setup: create the config PDA and record the operator + PDA bumps.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        cfg.operator = ctx.accounts.operator.key();
        cfg.deposit_nonce = 0;
        cfg.config_bump = ctx.bumps.config;
        cfg.vault_bump = ctx.bumps.vault;
        msg!(
            "shh-bridge:initialized|operator={}|vault={}",
            cfg.operator,
            ctx.accounts.vault.key()
        );
        Ok(())
    }

    /// Lock `amount` lamports in the vault for `l2_recipient`; emit the numbered deposit log
    /// the relayer keys on: shh-bridge:deposit|<nonce>|<l2 recipient>|<lamports>.
    pub fn deposit(ctx: Context<Deposit>, amount: u64, l2_recipient: Pubkey) -> Result<()> {
        require!(amount > 0, BridgeError::ZeroAmount);
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.depositor.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            amount,
        )?;
        let cfg = &mut ctx.accounts.config;
        let nonce = cfg.deposit_nonce;
        cfg.deposit_nonce = nonce.checked_add(1).ok_or(BridgeError::Overflow)?;
        msg!("shh-bridge:deposit|{}|{}|{}", nonce, l2_recipient, amount);
        Ok(())
    }

    /// Operator-signed release from the vault (phase 1 trust model). Never drains the vault
    /// below its rent-exempt floor.
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(amount > 0, BridgeError::ZeroAmount);
        let floor = Rent::get()?.minimum_balance(0);
        let available = ctx.accounts.vault.lamports().saturating_sub(floor);
        require!(amount <= available, BridgeError::InsufficientFunds);

        let bump = ctx.accounts.config.vault_bump;
        let seeds: &[&[u8]] = &[b"vault", std::slice::from_ref(&bump)];
        system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.recipient.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;
        msg!("shh-bridge:withdraw|{}|{}", ctx.accounts.recipient.key(), amount);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(init, payer = payer, space = 8 + Config::INIT_SPACE, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    /// SOL vault PDA: system-owned, only ever receives/sends lamports.
    #[account(seeds = [b"vault"], bump)]
    pub vault: SystemAccount<'info>,
    /// CHECK: stored as the operator in config; no constraints needed here.
    pub operator: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.config_bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"vault"], bump = config.vault_bump)]
    pub vault: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    pub operator: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.config_bump, has_one = operator)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"vault"], bump = config.vault_bump)]
    pub vault: SystemAccount<'info>,
    /// CHECK: recipient of the withdrawn SOL; any account.
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub operator: Pubkey,
    pub deposit_nonce: u64,
    pub config_bump: u8,
    pub vault_bump: u8,
}

#[error_code]
pub enum BridgeError {
    #[msg("amount must be greater than zero")]
    ZeroAmount,
    #[msg("deposit nonce overflow")]
    Overflow,
    #[msg("amount exceeds vault balance above the rent floor")]
    InsufficientFunds,
}
