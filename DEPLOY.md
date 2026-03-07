# Deployment

## 1. Build

```bash
cd /home/nurbot/ws/chatlocal
npm run build
```

## 2. systemd service

Create `/etc/systemd/system/chatlocal.service`:

```ini
[Unit]
Description=ChatLocal
After=network.target

[Service]
Type=simple
User=nurbot
WorkingDirectory=/home/nurbot/ws/chatlocal
EnvironmentFile=/home/nurbot/ws/chatlocal/.env

# nvm-managed node — must use full paths; tsx is local to the project
ExecStart=/home/nurbot/.nvm/versions/node/v22.17.0/bin/node \
  /home/nurbot/ws/chatlocal/node_modules/.bin/tsx \
  server.ts

Restart=on-failure
RestartSec=5

StandardOutput=journal
StandardError=journal
SyslogIdentifier=chatlocal

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now chatlocal
sudo journalctl -u chatlocal -f
```

## 3. Deploy an update

```bash
git pull
npm run build
sudo systemctl restart chatlocal
```

## 4. Development flow

Stop the service to free the port, then run the dev server:

```bash
sudo systemctl stop chatlocal
npm run dev
```

When done:

```bash
npm run build
sudo systemctl start chatlocal
```

## Notes

- **Node path**: systemd does not inherit the nvm `PATH`. If you upgrade Node via nvm, update the absolute paths in `ExecStart`.
- **Environment**: Variables are injected by systemd via `EnvironmentFile`. The `dotenv` call in `server.ts` is a harmless no-op in this case.
