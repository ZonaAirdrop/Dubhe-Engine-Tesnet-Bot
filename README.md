# Dubhe Engine Tesnet Bot

 📋 Features

 🚀 Wrap SUI → wSUI

 🚀 Token swaps: wSUI ↔ wDUBHE, wSUI ↔ wSTARS

 🚀 Add liquidity to 3 pools

 🚀 Multi-wallet farming support

 🚀 Delay config between txs

 🚀 Proxy support (HTTP/SOCKS)
 
 # Installation
 
### (1) Clone Bot Reposrory 

````
git clone https://github.com/ZonaAirdrop/Dubhe-Engine-Tesnet-Bot.git
````
### (2) 

````
cd Dubhe-Engine-Tesnet-Bot
````
### (3) Install Project 

````
npm install
````
# (4) Create File .env

````
nano .env
````

# (5) Paste wallet Details 

````
# PRIVATE_KEY_1=0x8xxx
MNEMONIC_1="memonic Parshe"
````

# Add proxy (Optional)

````
nano proxies.txt
````
#Add one proxy per line:

````
http://user:pass@ip:port
socks5://user:pass@ip:port
````

# (6) Running Bot 

````
node index.js
````
# Delete Bot if there is an update 

````
npm uninstall @mysten/sui.js && npm install @mysten/sui.js
git pull
````
