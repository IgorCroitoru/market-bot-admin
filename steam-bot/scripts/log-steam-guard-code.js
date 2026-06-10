const path = require("path");
const dotenv = require("dotenv");
const SteamTotp = require("steam-totp");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const sharedSecret = process.env.STEAM_SHARED_SECRET;

if (!sharedSecret) {
  console.error("Missing STEAM_SHARED_SECRET in steam-bot/.env");
  process.exit(1);
}

const guardCode = SteamTotp.generateAuthCode(sharedSecret);
console.log(`Steam Guard code: ${guardCode}`);
