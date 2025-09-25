/**
 * OLT configuration and environment variables
 */
require('dotenv').config();

module.exports = {
  // Base OLT settings
  olt: {
    url: process.env.OLT_URL,
    type: process.env.OLT_TYPE,
    username: process.env.UNAME,
    password: process.env.UPASS
  },
  
  // Bot settings
  bot: {
    token: process.env.BOT_TOKEN,
    passChat: process.env.PASS_CHAT
  },
  
  // Paths
  paths: {
    authFile: './src/utils/authuserlist.json'
  }
};