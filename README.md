# Remote-AMT-KVM

Desktop application for remote management of Intel AMT (Active Management Technology) devices. Built with Electron, featuring a dark-themed modern UI. Provides hardware-level KVM, virtual media boot (IDE-R), power control, and system monitoring — all without requiring the remote OS to be running.

## Features

### Remote Desktop (Hardware KVM)
- Full remote desktop via Intel AMT KVM — hardware-level, works even with OS crashed or not installed
- Multi-display support: switch between primary, secondary, and tertiary displays
- Multiple encoding modes: RLE8/RLE16, RAW8/RAW16, ZLib compression (ZRLE), and grayscale variants
- Resolution downscaling / decimation for lower bandwidth (AMT v16+)
- Software KVM quality and scaling controls (AMT v12+, 12.5%–100%)
- Frame rate limiting for bandwidth optimization
- Native fullscreen mode (toggle with ESC)
- Focus modes: All Focus / Small Focus / Large Focus
- Local mouse cursor show/hide
- Blank screen toggle — disable remote display while maintaining control
- View-only mode — read-only access without keyboard/mouse input
- Session recording to file and snapshot capture (PNG)

### Copy & Paste
- **Paste Text** — paste text from host clipboard directly into the remote machine as keystrokes (keyboard-layout aware, 4096 char max)
- **Copy Text** — OCR-based text extraction: select a region on the remote screen and extract text to clipboard

### IDE-R (Virtual Media Boot)
- Mount local ISO/IMG files as a virtual CD-ROM or USB disk on the remote machine
- Three mount modes: **CD-ROM** (traditional IDE-R), **USB** (faster, AMT v11+), and **Floppy**
- Boot remotely from ISO — install or recover an OS without physical access
- **netboot.xyz** — one-click download and boot of the network boot menu
- Server-side IDER engine with burst mode (cork/uncork) for maximum throughput
- Async I/O with direct file reads for optimized performance
- Full SCSI command set: READ_CAPACITY, READ_10, MODE_SENSE, REQUEST_SENSE
- Mount indicator with active ISO/mode display and eject button

### Power Management & Boot Control
- **Power actions**: Power on, Power off, Soft power off, Reset, Power cycle, Sleep, Hibernate, NMI
- **Boot target actions**: Power on / Reset to BIOS Setup, PXE, IDE-R Floppy, IDE-R CD-ROM
- **Advanced boot options**: BIOS Pause, Force Boot Device (HDD, PXE, CD/DVD), boot capability auto-detection
- Wake-on-LAN (OS Wake from Standby)
- Real-time power state display with source indicator (plugged-in / battery)
- 5-second power state polling with 15-second action timeout

### Special Keys & BIOS Navigation
- Send special keys via dropdown: ESC, Delete, F1–F12, +, -, x
- Ctrl+Alt+Del dedicated button
- Navigate BIOS menus, change boot order, all remotely

### System Status & Information
- Real-time power state with source (plugged-in / battery)
- Hostname, domain, and Intel ME firmware version with provisioning mode (ACM / CCM)
- Active features status: Redirection Port, SOL, IDE-R / USB-R, KVM
- Session timeout display (in minutes)
- User consent settings: Not Required, KVM Only, Always Required
- Firmware version warning for outdated/vulnerable AMT versions
- Network, boot capabilities, and hardware inventory

### Device Management
- Add, edit, and delete AMT devices with friendly names
- Group devices with tags for organization
- Stored credentials with digest authentication and password strength validation
- Authentication method selection: Digest / None or Digest / TLS
- Search and filter by hostname, name, or IP
- Keyboard shortcuts: Insert (add), Delete (remove), Ctrl+A (select all), Enter (connect), arrows (navigate)
- Multi-select with checkboxes
- Import/Export device lists (JSON and CSV)
- **Network scanning** — auto-scan local subnets for AMT devices on ports 16992/16993
- RMCP ping status (online/offline) with color-coded indicators and 30-second polling
- Redirection port connectivity check

### Security & Authentication
- TLS/HTTPS support (port 16993) with insecure connection warning banner
- HTTP Digest authentication with realm matching and CNonce rotation
- User consent with 6-digit code entry and multi-display selection
- Password strength enforcement (8+ chars, upper/lower/digit/symbol)
- Per-device TLS toggle

### Settings & Persistence
- Desktop settings saved per session: encoding, decimation, cursor, frame rate, quality
- Device list stored locally (computerlist.config) with passwords (Electron-only, no server/cloud)
- All preferences persisted in settings.json across app restarts

### UI & Interface
- Modern dark theme with cyan accent colors, designed for extended use
- Responsive layout for 1080p, 1440p, and 4K displays
- Fixed header, left sidebar navigation, and collapsible details panel
- Tabbed views: System Status, Remote Desktop (with full toolbar)
- Flexbox-based modal dialogs with smooth transitions
- Custom scrollbars and gradient headers

### URL Parameters (Direct Connection)
- `?host=` / `?user=` / `?pass=` / `?tls=` — connect directly to a device
- `?kvm=1` — auto-connect KVM on load
- `?kvmfull=1` — KVM fullscreen mode
- `?kvmonly=1` — KVM fullscreen exclusive (no UI chrome)
- `?kvmviewonly=1` — view-only mode
- `?norefresh=1` — disable display refresh polling

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
│   ├── webserver.js      # Express + WebSocket server
│   ├── amt-ider-server.js # Server-side IDER engine (SCSI emulation)
│   ├── interceptor.js    # HTTP/Redirect protocol interceptor
│   └── common.js         # Shared utilities
└── public/
    ├── default.htm       # Main UI
    └── scripts/
        ├── app.js               # Main application logic
        ├── kvm.js               # KVM desktop, paste, copy, IDE-R UI
        ├── status.js            # System status & power actions
        ├── amt-desktop-0.0.2.js # KVM/VNC protocol handler
        ├── amt-ider-ws-0.0.1.js # IDE-R virtual media client
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
