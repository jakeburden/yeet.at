## yeet@ — a minimal on-chain microblog for Solana (devnet)

yeet@ is a tiny microblog that stores each post directly on-chain in a program-owned account. The webapp lets you:

- Post short messages ("yeets") up to 512 bytes
- Auto-create your on-chain user profile on first post
- Browse a user’s posts at `/u/[address]` and individual posts at `/u/[address]/[index]`

Under the hood, the frontend talks to a small Rust program that manages a per-user counter and writes each post’s header + content into a dedicated account.

### Prerequisites
- Node.js and npm
- A Solana wallet (Phantom, Backpack, or Android MWA)
- Devnet RPC (defaults to devnet; Helius URL optional)

### Configure environment
Create a `.env.local` in `web/` with:

```bash
# Required: the deployed program id of the microblog program
# Either var name works; NEXT_PUBLIC_YEET_PROGRAM_ID takes precedence in the app
NEXT_PUBLIC_YEET_PROGRAM_ID=YourProgramId111111111111111111111111111111
# NEXT_PUBLIC_MICROBLOG_PROGRAM_ID=YourProgramId111111111111111111111111111111

# Optional: RPC; defaults to "devnet" if unset
NEXT_PUBLIC_RPC_URL=https://rpc.helius.xyz/?api-key=YOUR_KEY
```

### Install and run (dev)
```bash
cd web
npm install
npm run dev
```
Open http://localhost:3000 and connect your wallet (devnet). Compose a message and click Post. Your posts are listed locally and can be viewed on-chain at:

- `/u/<your_address>` — all your posts
- `/u/<your_address>/<index>` — a single post

Production build:
```bash
npm run build
npm start
```

### How the Rust program works (high level)
Path: `program/yeet-at/src/lib.rs`

The program exposes two instructions:

- InitUser (discriminator 0)
  - Accounts: `[signer author]`, `[writable user_profile]`
  - Initializes a user profile account owned by the program and sets `post_count = 0`.

- CreatePost (discriminator 1)
  - Accounts: `[signer author]`, `[writable user_profile]`, `[writable post_account]`
  - Validates sizes/ownership, increments the user’s `post_count`, and writes the post header + UTF-8 content into `post_account`.

Account layouts (packed, little-endian):
- User profile: `1-byte tag (1)` + `32-byte owner` + `u64 post_count` → total 41 bytes
- Post account: `1-byte tag (2)` + `32-byte author` + `u64 index` + `u16 content_len` + `content[0..512]`

Addressing model used by the webapp:
- The client creates program-owned accounts with System Program `createAccountWithSeed`, using seeds:
  - User profile: seed `"user"`
  - Post: seed `"post-{index}"`
- The program itself does not derive or enforce a specific address scheme beyond ownership and size checks; it writes to the provided, writable accounts.

Limits and checks:
- Content must be 1..=512 bytes
- User profile and post accounts must be owned by the program and sized exactly as expected

### Local program testing with LiteSVM (optional)
There is a lightweight simulator test in `program/yeet-at/tests/litesvm_test.rs`. It loads an SBF build of the program if you set an environment variable:

```bash
cd program/yeet-at
# Point to a compiled SBF .so for the program
export YEET_AT_SBF_PATH=/absolute/path/to/yeet_at.so
cargo test -p yeet-at -- --nocapture
```

