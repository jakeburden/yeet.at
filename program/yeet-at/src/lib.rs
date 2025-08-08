use pinocchio::{
    account_info::AccountInfo,
    entrypoint,
    program_error::ProgramError,
    pubkey::Pubkey,
    ProgramResult,
};
use solana_pubkey as spubkey;

#[derive(Clone, Copy)]
struct UserProfile {
    owner: [u8; 32],
    post_count: u64,
}

impl UserProfile {
    // discriminant(1) + owner(32) + post_count(8)
    const SIZE: usize = 1 + 32 + 8;
    fn pack_into_slice(&self, data: &mut [u8]) {
        data[0] = 1; // initialized
        data[1..33].copy_from_slice(&self.owner);
        data[33..41].copy_from_slice(&self.post_count.to_le_bytes());
    }
    fn unpack_from_slice(data: &[u8]) -> Result<Self, ProgramError> {
        if data.len() < Self::SIZE { return Err(ProgramError::InvalidAccountData); }
        if data[0] != 1 { return Err(ProgramError::UninitializedAccount); }
        Ok(Self {
            owner: <[u8; 32]>::try_from(&data[1..33]).unwrap(),
            post_count: u64::from_le_bytes(data[33..41].try_into().unwrap()),
        })
    }
}

pub struct PostHeader {
    pub author: Pubkey,
    pub index: u64,
    pub content_len: u16,
}

impl PostHeader {
    pub const BASE_SIZE: usize = 1 + 32 + 8 + 2;
    fn pack_into_slice(&self, dst: &mut [u8]) {
        dst[0] = 2;
        dst[1..33].copy_from_slice(self.author.as_ref());
        dst[33..41].copy_from_slice(&self.index.to_le_bytes());
        dst[41..43].copy_from_slice(&self.content_len.to_le_bytes());
    }
}

entrypoint!(process_instruction);

pub fn process_instruction(program_id: &Pubkey, accounts: &[AccountInfo], ix_data: &[u8]) -> ProgramResult {
    if ix_data.is_empty() { return Err(ProgramError::InvalidInstructionData); }
    match ix_data[0] {
        0 => init_user(program_id, accounts),
        1 => create_post(program_id, accounts, &ix_data[1..]),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

fn init_user(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    if accounts.len() < 2 { return Err(ProgramError::NotEnoughAccountKeys); }
    let payer = &accounts[0];
    let user_profile = &accounts[1];
    if !payer.is_signer() { return Err(ProgramError::MissingRequiredSignature); }
    if user_profile.owner() != program_id { return Err(ProgramError::IncorrectProgramId); }
    if user_profile.executable() { return Err(ProgramError::InvalidAccountData); }
    if !user_profile.is_writable() { return Err(ProgramError::InvalidAccountData); }
    if user_profile.data_len() != UserProfile::SIZE { return Err(ProgramError::InvalidAccountData); }

    // Enforce PDA: user profile = PDA(["user", author_pubkey])
    let program_id_sp = spubkey::Pubkey::new_from_array(<[u8; 32]>::try_from(program_id.as_ref()).unwrap());
    let (expected_profile, _bump) =
        spubkey::Pubkey::find_program_address(&[b"user", payer.key().as_ref()], &program_id_sp);
    if user_profile.key().as_ref() != expected_profile.as_ref() { return Err(ProgramError::InvalidAccountData); }

    // Prevent re-initialization via discriminant
    {
        let data = user_profile.try_borrow_data()?;
        if data[0] != 0 { return Err(ProgramError::AccountAlreadyInitialized); }
    }
    let mut data = user_profile.try_borrow_mut_data()?;
    let profile = UserProfile { owner: <[u8; 32]>::try_from(payer.key().as_ref()).unwrap(), post_count: 0 };
    profile.pack_into_slice(&mut data[..UserProfile::SIZE]);
    Ok(())
}

fn create_post(program_id: &Pubkey, accounts: &[AccountInfo], content: &[u8]) -> ProgramResult {
    if content.is_empty() || content.len() > 512 { return Err(ProgramError::InvalidInstructionData); }
    if accounts.len() < 3 { return Err(ProgramError::NotEnoughAccountKeys); }
    let author = &accounts[0];
    let user_profile = &accounts[1];
    let post = &accounts[2];
    if !author.is_signer() { return Err(ProgramError::MissingRequiredSignature); }

    if user_profile.owner() != program_id { return Err(ProgramError::IncorrectProgramId); }
    if user_profile.executable() { return Err(ProgramError::InvalidAccountData); }
    if user_profile.data_len() != UserProfile::SIZE { return Err(ProgramError::InvalidAccountData); }
    if !user_profile.is_writable() { return Err(ProgramError::InvalidAccountData); }

    let mut profile_data = user_profile.try_borrow_mut_data()?;
    let mut profile = UserProfile::unpack_from_slice(&profile_data[..UserProfile::SIZE])?;
    // Verify the profile belongs to the author
    if &profile.owner != author.key().as_ref() { return Err(ProgramError::IllegalOwner); }
    // Verify PDA linkage for the profile
    let program_id_sp = spubkey::Pubkey::new_from_array(<[u8; 32]>::try_from(program_id.as_ref()).unwrap());
    let (expected_profile, _bump) =
        spubkey::Pubkey::find_program_address(&[b"user", author.key().as_ref()], &program_id_sp);
    if user_profile.key().as_ref() != expected_profile.as_ref() { return Err(ProgramError::InvalidAccountData); }
    let post_index = profile.post_count;
    profile.post_count = profile.post_count.checked_add(1).ok_or(ProgramError::InvalidInstructionData)?;
    profile.pack_into_slice(&mut profile_data[..UserProfile::SIZE]);

    if post.owner() != program_id { return Err(ProgramError::IncorrectProgramId); }
    if post.executable() { return Err(ProgramError::InvalidAccountData); }
    if post.data_len() != (PostHeader::BASE_SIZE + content.len()) { return Err(ProgramError::InvalidAccountData); }
    if !post.is_writable() { return Err(ProgramError::InvalidAccountData); }
    if post.key() == user_profile.key() { return Err(ProgramError::InvalidAccountData); }

    // Enforce post PDA derived from (author, index)
    let (expected_post, _bump) = spubkey::Pubkey::find_program_address(
        &[b"post", author.key().as_ref(), &post_index.to_le_bytes()],
        &program_id_sp,
    );
    if post.key().as_ref() != expected_post.as_ref() { return Err(ProgramError::InvalidAccountData); }

    // Prevent overwrites; require uninitialized
    {
        let data = post.try_borrow_data()?;
        if data.get(0) == Some(&2) { return Err(ProgramError::AccountAlreadyInitialized); }
    }

    let mut data = post.try_borrow_mut_data()?;
    let header = PostHeader { author: *author.key(), index: post_index, content_len: content.len() as u16 };
    header.pack_into_slice(&mut data[..PostHeader::BASE_SIZE]);
    data[PostHeader::BASE_SIZE..PostHeader::BASE_SIZE + content.len()].copy_from_slice(content);
    Ok(())
}

