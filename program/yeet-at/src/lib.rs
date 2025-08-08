use pinocchio::{
    account_info::AccountInfo,
    entrypoint,
    program_error::ProgramError,
    pubkey::Pubkey,
    ProgramResult,
};

#[derive(Clone, Copy)]
struct UserProfile {
    post_count: u64,
}

impl UserProfile {
    const SIZE: usize = 1 + 8;
    fn pack_into_slice(&self, data: &mut [u8]) {
        data[0] = 1;
        data[1..9].copy_from_slice(&self.post_count.to_le_bytes());
    }
    fn unpack_from_slice(data: &[u8]) -> Result<Self, ProgramError> {
        if data.len() < Self::SIZE { return Err(ProgramError::InvalidAccountData); }
        Ok(Self { post_count: u64::from_le_bytes(data[1..9].try_into().unwrap()) })
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
    let user_profile_ai = &accounts[1];
    if !payer.is_signer() { return Err(ProgramError::MissingRequiredSignature); }
    if user_profile_ai.owner() != program_id { return Err(ProgramError::IncorrectProgramId); }
    if user_profile_ai.data_len() < UserProfile::SIZE { return Err(ProgramError::InvalidAccountData); }
    let mut data = user_profile_ai.try_borrow_mut_data()?;
    let profile = UserProfile { post_count: 0 };
    profile.pack_into_slice(&mut data[..UserProfile::SIZE]);
    Ok(())
}

fn create_post(program_id: &Pubkey, accounts: &[AccountInfo], content: &[u8]) -> ProgramResult {
    if content.is_empty() || content.len() > 512 { return Err(ProgramError::InvalidInstructionData); }
    if accounts.len() < 3 { return Err(ProgramError::NotEnoughAccountKeys); }
    let author = &accounts[0];
    let user_profile_ai = &accounts[1];
    let post_ai = &accounts[2];
    if !author.is_signer() { return Err(ProgramError::MissingRequiredSignature); }

    if user_profile_ai.owner() != program_id { return Err(ProgramError::IncorrectProgramId); }
    if user_profile_ai.data_len() < UserProfile::SIZE { return Err(ProgramError::InvalidAccountData); }

    let mut profile_data = user_profile_ai.try_borrow_mut_data()?;
    let mut profile = UserProfile::unpack_from_slice(&profile_data[..UserProfile::SIZE])?;
    let post_index = profile.post_count;
    profile.post_count = profile.post_count.checked_add(1).ok_or(ProgramError::InvalidInstructionData)?;
    profile.pack_into_slice(&mut profile_data[..UserProfile::SIZE]);

    if post_ai.owner() != program_id { return Err(ProgramError::IncorrectProgramId); }
    if post_ai.data_len() != (PostHeader::BASE_SIZE + content.len()) { return Err(ProgramError::InvalidAccountData); }

    let mut data = post_ai.try_borrow_mut_data()?;
    let header = PostHeader { author: *author.key(), index: post_index, content_len: content.len() as u16 };
    header.pack_into_slice(&mut data[..PostHeader::BASE_SIZE]);
    data[PostHeader::BASE_SIZE..PostHeader::BASE_SIZE + content.len()].copy_from_slice(content);
    Ok(())
}

