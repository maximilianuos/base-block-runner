# Base Block Runner

**Base Block Runner** is a small onchain browser game built on Base Mainnet.

Jump over onchain obstacles, survive as long as you can, and save your score directly on Base.

Built by [Maximilianuos](https://github.com/maximilianuos) with ❤️ for the Hyrcani community.

## Live Demo

Play here:

https://base-block-runner.vercel.app/

## GitHub Repository

https://github.com/maximilianuos/base-block-runner

## Onchain Contract

Base Mainnet contract:

```text
0xE2D82b9c236859EE3a68146509260e564c2b5837
```

## What it does

* Runs as a browser-based game.
* Connects to a wallet such as Rabby or MetaMask.
* Reads the player’s best onchain score from Base.
* Saves scores of 250+ on Base Mainnet.
* Uses only the `submitScore` contract interaction.
* Does not request USDC approval.
* Does not transfer tokens.
* Requires only a Base gas fee when saving a score.

## Tech Stack

* Vite
* JavaScript
* HTML Canvas
* CSS
* ethers.js
* Solidity smart contract
* Base Mainnet
* Vercel

## How to run locally

Clone the repository:

```bash
git clone https://github.com/maximilianuos/base-block-runner.git
cd base-block-runner
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Gameplay

* Click **Start Game** to begin.
* Press **Space**, **Arrow Up**, click, or tap to jump during the run.
* After Game Over, scores of 250+ can be saved on Base Mainnet.
* The game does not restart automatically after Game Over, so players have time to save their score.

## Safety Notes

This project is an MVP game prototype.

The game does not include rewards, token transfers, NFTs, or financial incentives. The score is saved onchain only as a simple record of gameplay.

Because the game runs in the browser, it should not be used for financial rewards without adding stronger anti-cheat logic, such as server-side score verification.

## License

MIT
