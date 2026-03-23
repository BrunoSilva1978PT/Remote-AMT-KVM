const { app, BrowserWindow, session, ipcMain } = require('electron');
const path = require('path');
const net = require('net');

let mainWindow;
let serverPort;

function findFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
        server.on('error', reject);
    });
}

function startMeshCommander(port) {
    const webserver = require('./server/webserver.js');
    // Use userData path for writable config (asar is read-only)
    const configDir = app.getPath('userData');
    webserver.CreateWebServer({ port: port, configPath: path.join(configDir, 'computerlist.config'), settingsPath: path.join(configDir, 'settings.json') });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 970,
        height: 760,
        minWidth: 970,
        minHeight: 640,
        icon: path.join(__dirname, 'favicon.png'),
        title: 'Remote-AMT-KVM',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.setMenuBarVisibility(false);

    // Grant clipboard permissions for KVM copy/paste
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        callback(true);
    });
    session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
        if (permission === 'clipboard-read' || permission === 'clipboard-sanitized-write') return true;
        return true;
    });

    mainWindow.loadURL('http://127.0.0.1:' + serverPort);

    // F12 to open DevTools
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12' && input.type === 'keyDown') { mainWindow.webContents.toggleDevTools(); event.preventDefault(); }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}


app.on('ready', async () => {
    serverPort = await findFreePort();
    startMeshCommander(serverPort);
    // Small delay to let Express bind the port
    setTimeout(createWindow, 500);
});

app.on('window-all-closed', () => {
    app.quit();
});

