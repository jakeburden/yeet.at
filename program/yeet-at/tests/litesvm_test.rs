use litesvm::LiteSVM;
use solana_keypair::Keypair;
use solana_message::Message;
use solana_pubkey::Pubkey;
use solana_signer::Signer;
use solana_instruction::{AccountMeta, Instruction};
use solana_transaction::Transaction;
use solana_system_interface::instruction::create_account;
use std::env;
use std::fs;

fn program_id() -> Pubkey { Pubkey::new_unique() }

#[test]
fn test_init_and_create_post() {
    let mut svm = LiteSVM::new();
    let author_kp = Keypair::new();
    let author = author_kp.pubkey();
    svm.airdrop(&author, 1_000_000_000).unwrap();

    let pid = program_id();
    if let Ok(path) = env::var("YEET_AT_SBF_PATH") {
        let bytes = fs::read(path).expect("read sbf");
        svm.add_program(pid, &bytes);
    } else {
        eprintln!("YEET_AT_SBF_PATH not set; skipping litesvm test");
        return;
    }

    let user_pda = Pubkey::find_program_address(&[b"user", author.as_ref()], &pid).0;
    let post_index: u64 = 0;
    let post_pda = Pubkey::find_program_address(&[b"post", author.as_ref(), &post_index.to_le_bytes()], &pid).0;

    let user_space = 1 + 8;
    let lamports = 1_000_000;
    let ca_user = create_account(&author, &user_pda, lamports, user_space as u64, &pid);
    let tx_ca_user = Transaction::new(&[&author_kp], Message::new(&[ca_user], Some(&author)), svm.latest_blockhash());
    svm.send_transaction(tx_ca_user).unwrap();

    let content = b"hello yeet@".to_vec();
    let post_space = (1 + 32 + 8 + 2 + content.len()) as u64;
    let ca_post = create_account(&author, &post_pda, lamports, post_space, &pid);
    let tx_ca_post = Transaction::new(&[&author_kp], Message::new(&[ca_post], Some(&author)), svm.latest_blockhash());
    svm.send_transaction(tx_ca_post).unwrap();

    let init_ix = Instruction {
        program_id: pid,
        accounts: vec![AccountMeta::new(author, true), AccountMeta::new(user_pda, false)],
        data: vec![0u8],
    };
    let tx = Transaction::new(&[&author_kp], Message::new(&[init_ix], Some(&author)), svm.latest_blockhash());
    svm.send_transaction(tx).unwrap();

    let mut data = vec![1u8];
    data.extend_from_slice(&content);
    let create_ix = Instruction {
        program_id: pid,
        accounts: vec![AccountMeta::new(author, true), AccountMeta::new(user_pda, false), AccountMeta::new(post_pda, false)],
        data,
    };
    let tx2 = Transaction::new(&[&author_kp], Message::new(&[create_ix], Some(&author)), svm.latest_blockhash());
    let res = svm.send_transaction(tx2);
    assert!(res.is_ok());
}

