# Remote-AMT-KVM

Desktop application for remote management of Intel AMT (Active Management Technology) devices. Built with Electron, featuring a dark-themed modern UI.

## Features

- **Remote Desktop (Hardware KVM)** - View and control remote machines via Intel AMT KVM, with snapshot and session recording
- **Copy & Paste** - Paste text from host clipboard directly into the remote machine, and copy text from the remote session
- **Computer Management** - Add, edit and organize multiple AMT devices with stored credentials
- **Power Actions** - Remote power on/off, reset, and boot options
- **TLS Support** - Secure connections to AMT devices on port 16993
- **Dark Mode UI** - Modern dark interface designed for extended use

## Installation

### From source

```bash
git clone https://github.com/yourusername/Remote-AMT-KVM.git
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
    └── scripts/         # Frontend modules (AMT protocol, KVM, zlib)
```

## Requirements

- Node.js 18+
- Intel AMT enabled device(s) on the network

## Based On

Originally derived from [MeshCommander](https://github.com/Ylianst/MeshCommander) by Ylian Saint-Hilaire (Intel Corporation, Apache 2.0).
