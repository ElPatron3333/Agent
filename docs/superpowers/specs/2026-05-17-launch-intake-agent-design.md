# Launch Intake Agent Design

## Goal

Build a dedicated Smithii Bundle Launch intake flow that behaves like a launch specialist instead of a rigid form. The user should be able to describe a Pump.fun launch in natural language, and the agent should extract everything it can, ask only for missing or ambiguous fields, and refuse to prepare a preview until the launch is actually complete.

The primary target request is a message such as:

> I want to launch a coin called Shitcoin on Pumpfun, bundle it with 6 wallets. Wallet 1 is the dev and uses 0.5 SOL for creation. Wallet 2 buys 2 SOL, wallet 3 buys 1 SOL...

## Definitions

- Dev wallet: the wallet that creates the coin and supplies the dev/token creation amount. It is not part of the bundle buyer set.
- Bundle wallets: the buyer wallets included in the Smithii bundled launch buys.
- Dev amount: if the user says the dev wallet "buys" or "uses" an amount, the agent interprets that as the token creation/dev amount, not as a bundle buy.
- Wallet index: `wallet 1`, `wallet 2`, etc. refer to the visible order of imported wallets in the Wallet table, using one-based numbering.

## User Experience

The agent should accept natural launch instructions and maintain a structured launch intake state. It should parse what the user provides and ask the next missing question when required data is absent.

The agent must not prepare a Bundle Launch preview until all required fields are complete:

- target launchpad: Pump.fun for this phase
- token name
- token symbol, inferred from the name when possible but confirmed if ambiguous
- token description
- dev wallet
- dev/token creation amount
- bundle wallet count
- exact bundle wallet identities
- exact buy amount for every bundle wallet
- uploaded token image file
- socials decision: provided values or explicit skip

Social fields are optional, but the agent must ask for them if the user did not mention them. The user can reply `skip` to continue without socials. Supported social fields are website, Telegram, X/Twitter, and GitHub.

The token image is required before preview. A filename or URL in chat is not sufficient for preview. The UI must expose image upload while the agent is collecting launch details, not only after handoff.

## Wallet Resolution

Wallet references resolve in this order:

1. Exact public key in the message, if it matches an imported wallet.
2. Wallet index such as `wallet 1`, mapped to the current Wallet table order.

The final preview path must restate the resolved wallet mapping before preparing or presenting the preview, including:

- which wallet is dev
- the dev amount
- every bundle wallet
- every bundle wallet buy amount

If the user uses wallet indexes, the agent should explicitly say that those indexes were mapped to the imported wallet table order to avoid confusion.

If the user requests `bundle it with 6 wallets` but gives only 3 bundle buy amounts, the agent asks for the missing 3 amounts. It must not invent default buy amounts.

The dev wallet must not be counted toward the requested bundle wallet count. If the user says `wallet 1 is dev` and `bundle it with 6 wallets`, the completed launch needs 1 dev wallet plus 6 bundle wallets.

## Data Model

Add a dedicated Bundle Launch intake model instead of extending the current `walletCount + solPerWallet` draft shape.

The intake state should represent:

- token metadata: name, symbol, description, uploaded image status
- launchpad: Pump.fun
- dev wallet reference and resolved pubkey
- dev amount SOL
- requested bundle wallet count
- bundle allocations: wallet reference, resolved pubkey, buy amount SOL
- socials: website, Telegram, X/Twitter, GitHub, and whether the user skipped socials
- intake status: collecting, ready for wallet mapping confirmation, ready for preview

The existing preview and browser handoff can still use the current Smithii launch wiring once the intake has been converted into a launch preview input. The conversion step should produce explicit `bundleWallets` with per-wallet amounts.

## Parser Behavior

The parser should extract these patterns from natural language:

- launch intent: `launch`, `create`, `deploy`, `coin`, `token`, `Pumpfun`, `Pump.fun`
- token name: `called X`, `named X`, `coin X`, `token X`
- symbol: explicit ticker/symbol when present
- dev wallet: `wallet 1 is dev`, `dev wallet is <pubkey>`, `wallet:<pubkey> is dev`
- dev amount: dev wallet `uses`, `buys`, `creates with`, or `launches with` N SOL
- bundle count: `bundle it with 6 wallets`, `6 bundle wallets`
- bundle allocations: `wallet 2 buys 2 SOL`, `<pubkey> buys 1 SOL`, `wallet:<pubkey> 1 SOL`
- socials: website, Telegram, X/Twitter, GitHub URLs or handles
- skip: `skip`, `no socials`, `without socials`

If a message contains a vague or conflicting wallet instruction, the agent asks a narrow clarification instead of guessing.

## UI Changes

The main launch/chat area should expose an image upload control during intake. The control is required for Bundle Launch preview readiness.

The wallet table should make imported wallet order unambiguous because wallet indexes depend on it. A visible one-based row number is enough.

The preview should include a concise launch summary with:

- token name and symbol
- dev wallet and dev amount
- bundle wallet count
- per-wallet buy table
- image selected
- socials provided or skipped

Unknown fee estimates should remain hidden unless Smithii provides an authoritative source.

## Safety And Validation

The chat route must continue rejecting private-key payloads. Private keys stay in browser state and are only used in the browser handoff path.

Preview generation must validate:

- imported wallets exist before wallet index references can resolve
- exact public keys match imported wallets
- dev wallet exists and has private key material in browser state before handoff
- bundle wallet count matches requested count
- every bundle wallet has a positive SOL buy amount
- dev wallet is not duplicated in the bundle allocation
- image file is present before preview

Live execution remains gated by the existing browser handoff, connected wallet, prepared packet, and explicit approval.

## Error Handling

The agent should ask one actionable question at a time. Examples:

- `I found 6 bundle wallets requested, but only 3 buy amounts. What should wallets 4, 5, and 6 buy?`
- `Wallet 3 maps to the imported wallet table, but only 2 wallets are loaded. Import the wallet CSV or reference an exact wallet address.`
- `I have the launch details, but I need the token image before I can prepare the preview. Upload the image, then I will continue.`
- `Social links are optional. Send website, Telegram, X, GitHub, or reply skip.`

## Testing

Add focused tests for:

- parsing a complete one-message launch with dev amount and per-wallet bundle buys
- treating dev wallet amount as dev/token creation amount, not a bundle buy
- requiring missing bundle buy amounts instead of defaulting them
- resolving wallet indexes against imported wallet order
- resolving exact public keys against imported wallets
- rejecting unknown wallet indexes and unmatched public keys
- requiring an uploaded image before preview
- asking for socials when omitted and accepting `skip`
- including GitHub in social parsing and preview output
- preserving the current browser handoff safety gates

## Out Of Scope

- Other launchpads beyond Pump.fun.
- Live fee display without an authoritative Smithii fee source.
- AI-based non-deterministic parsing.
- Backend custody of private keys.
- Automatic live submit without explicit approval.
