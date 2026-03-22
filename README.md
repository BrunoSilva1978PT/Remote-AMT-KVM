# Remote-AMT-KVM

Desktop application for remote management of Intel AMT (Active Management Technology) devices. Built with Electron, featuring a dark-themed modern UI.

## Features

### Remote Desktop (Hardware KVM)
- Full remote desktop via Intel AMT KVM (hardware-level, works even with OS crashed)
- Native fullscreen mode
- Snapshot capture and session recording
- Adjustable encoding (RAW/RLE, 256/64k colors)

### Copy & Paste
- **Paste Text** - Paste text from host clipboard directly into the remote machine (sends keystrokes)
- **Copy Text** - OCR-based text extraction from the remote screen with selectable region

### IDE-R (Virtual Media)
- Mount local ISO/IMG files as a virtual CD-ROM on the remote machine
- Boot from ISO remotely (install/recover OS without physical access)
- BIOS detects it as "Intel Virtual CD 1.00"
- Supports full SCSI command set (READ_CAPACITY, READ_10, MODE_SENSE, etc.)

### Special Keys & BIOS Navigation
- Send special keys via dropdown: ESC, Delete, F1-F12, +, -, x
- Navigate BIOS menus, change boot order, all remotely
- Ctrl+Alt+Del support

### Computer Management
- Add, edit and organize multiple AMT devices
- Group devices with tags
- Stored credentials with digest authentication

### Power Actions
- Power on / Power off / Reset / Power cycle
- Power up to BIOS / Reset to BIOS
- Boot to PXE
- Next boot from IDE-R (virtual CD)

### System Status
- Real-time AMT system information (hardware, firmware, network)
- Feature toggles: KVM, SOL, IDE-R enable/disable
- Session timeout configuration

### Security
- TLS support for secure connections (port 16993)
- Digest authentication
- Insecure connection warning banner

### UI
- Modern dark theme designed for extended use
- Responsive layout for 1080p, 1440p, and 4K displays
- Flexbox-based modal dialogs

## Installation

### From source

```bash
git clone https://github.com/BrunoSilva1978PT/Remote-AMT-KVM.git
cd Remote-AMT-KVM
npm install
npm start
```

### Build Windows installer

```bash
npm run build
```

The installer will be generated in the `dist/` folder.

## Project Structure

```
Remote-AMT-KVM/
├── main.js              # Electron entry point
├── package.json
├── server/
│   ├── webserver.js     # Express + WebSocket server
│   ├── interceptor.js   # HTTP/Redirect protocol interceptor
│   └── common.js        # Shared utilities
└── public/
    ├── default.htm      # Main UI
    └── scripts/
        ├── app.js               # Main application logic
        ├── kvm.js               # KVM desktop, paste, copy, IDE-R UI
        ├── status.js            # System status & power actions
        ├── amt-desktop-0.0.2.js # KVM/VNC protocol handler
        ├── amt-ider-ws-0.0.1.js # IDE-R virtual media (SCSI emulation)
        ├── amt-redir-ws-0.1.0.js# WebSocket redirect (KVM/IDER/SOL)
        ├── amt-wsman-*.js       # WS-Management protocol
        ├── amt-0.2.0.js         # AMT API wrapper
        └── zlib*.js             # Decompression for RLE encoding
```

## Requirements

- Node.js 18+
- Intel AMT enabled device(s) on the network
- AMT configured with KVM and IDE-R enabled

## Based On

Originally derived from [MeshCommander](https://github.com/Ylianst/MeshCommander) by Ylian Saint-Hilaire (Intel Corporation, Apache 2.0).
