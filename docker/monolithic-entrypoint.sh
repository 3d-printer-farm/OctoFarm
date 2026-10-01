#!/bin/sh
mkdir -p /app/data

if [ -d "logs" ]
then
    mkdir -p logs
else
    echo "Logs folder already exists..."
fi

cd server && pm2 start app.js --name OctoFarm --no-daemon -o '../logs/pm2.log' -e '../logs/pm2.error.log' --time  --restart-delay=1000 --exp-backoff-restart-delay=1500
