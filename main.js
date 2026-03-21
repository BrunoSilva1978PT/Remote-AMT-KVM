const { app, BrowserWindow } = require('electron');
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
    const webserver = require('./meshcommander/webserver.js');
    webserver.CreateWebServer({ port: port });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 970,
        height: 760,
        minWidth: 970,
        minHeight: 640,
        icon: path.join(__dirname, 'favicon.png'),
        title: 'MeshCommander',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.setMenuBarVisibility(false);
    mainWindow.loadURL('http://127.0.0.1:' + serverPort);

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
